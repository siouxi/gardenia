#!/usr/bin/env Rscript

# R Bridge Script for Arrow IPC-based communication
# Requires 'arrow' package

# Check for arrow package existence quietly
if (!requireNamespace("arrow", quietly = TRUE)) {
    # If arrow is missing, we must output valid JSON error so the host can parse it
    cat('{"status":"error","output":"","error":"The \'arrow\' package is required but not installed. Please run install.packages(\'arrow\').","variables":[]}\n')
    quit(status = 0) # Quit successfully so the error message is received
}

suppressPackageStartupMessages(library(arrow))
suppressPackageStartupMessages(library(jsonlite))

# Suppress warnings during startup to keep stdout clean for JSON
options(warn = -1)

#' Execute R code with Arrow IPC context
#' @param command_json JSON string containing command details
#' @param env Environment to execute code in
#' @return List response object
process_command <- function(command_json, env) {
    tryCatch(
        {
            request <- fromJSON(command_json)

            # 1. Load variables from Input IPC file (if provided)
            if (!is.null(request$input_ipc) && file.exists(request$input_ipc)) {
                tryCatch(
                    {
                        # Read all columns from the Arrow file into a table
                        table <- read_ipc_file(request$input_ipc)

                        # Convert to data frame (zero-copy where possible)
                        df <- as.data.frame(table)

                        # Assign each column as a variable in the environment
                        for (col_name in names(df)) {
                            # Assign to global scope for easy access
                            assign(col_name, df[[col_name]], envir = env)

                            # ALSO assign to 'inputs' list if it exists (created by worker_manager)
                            # This allows unified access via inputs$data, etc.
                            if (exists("inputs", envir = env)) {
                                # We need to assign into the list 'inputs' in 'env'
                                # R environments are tricky with nested assignment via assign()
                                # Easiest is to use eval
                                eval(parse(text = paste0("inputs[['", col_name, "']] <- ", col_name)), envir = env)
                            } else {
                                # Create inputs if missing
                                assign("inputs", list(), envir = env)
                                eval(parse(text = paste0("inputs[['", col_name, "']] <- ", col_name)), envir = env)
                            }
                        }
                    },
                    error = function(e) {
                        warning(paste("Failed to load input IPC:", e$message))
                    }
                )
            }

            # 2. Execute Code and Capture Output
            output_text <- ""
            error_msg <- NULL
            status <- "success"

            # Capture stdout/stderr
            # Note: worker_manager injects 'inputs' creation code before user code
            output_text <- capture.output(
                {
                    tryCatch(
                        {
                            eval(parse(text = request$code), envir = env)
                        },
                        error = function(e) {
                            status <<- "error"
                            print(e)
                            error_msg <<- e$message
                        }
                    )
                },
                type = "output"
            )

            output_text <- paste(output_text, collapse = "\n")

            # 3. Write Output Variables to IPC
            serialized_vars <- list()

            # Only process variables if execution was successful or we want to inspect partial state
            if (status == "success") {
                tryCatch(
                    {
                        vars <- ls(envir = env, all.names = FALSE)

                        # Create output directory for IPC files if needed
                        output_dir <- if (!is.null(request$output_dir)) request$output_dir else tempdir()
                        if (!dir.exists(output_dir)) dir.create(output_dir, recursive = TRUE)

                        for (var_name in vars) {
                            # Skip 'inputs' variable itself to avoid circularity/redundancy
                            if (var_name == "inputs") next

                            val <- get(var_name, envir = env)

                            # Basic metadata
                            val_meta <- list(
                                name = var_name,
                                type_hint = class(val)[1],
                                is_dataframe = FALSE
                            )

                            if (is.data.frame(val)) {
                                # Write DataFrame to Arrow IPC
                                fname <- paste0(request$id, "_", var_name, ".arrow")
                                fpath <- file.path(output_dir, fname)

                                tryCatch(
                                    {
                                        write_ipc_file(val, fpath, compression = "zstd")

                                        val_meta$ipc_path <- fpath
                                        val_meta$is_dataframe <- TRUE
                                        val_meta$preview <- paste("DataFrame:", nrow(val), "rows x", ncol(val), "cols")
                                        val_meta$value <- "[DataFrame stored in IPC]"
                                    },
                                    error = function(e) {
                                        val_meta$error <- paste("Failed to write IPC:", e$message)
                                    }
                                )
                            } else if (is.atomic(val) && length(val) <= 100) {
                                # Small atomic vectors -> distinct value
                                val_meta$value <- val
                            } else {
                                # Complex objects or large vectors -> string representation
                                preview <- capture.output(print(head(val)))
                                val_meta$value <- paste(preview, collapse = "\n")
                            }

                            serialized_vars[[length(serialized_vars) + 1]] <- val_meta
                        }
                    },
                    error = function(e) {
                        output_text <<- paste(output_text, paste("Serialization warning:", e$message), sep = "\n")
                    }
                )
            }

            list(
                id = request$id,
                status = status,
                output = output_text,
                error = error_msg,
                variables = serialized_vars
            )
        },
        error = function(e) {
            list(
                status = "error",
                output = "",
                error = paste("Bridge internal error:", e$message),
                variables = list()
            )
        }
    )
}

# Main Loop
main <- function() {
    # Environment for the user session
    session_env <- new.env(parent = .GlobalEnv)

    stdin_con <- file("stdin", "r", blocking = TRUE)

    while (TRUE) {
        # Read line-by-line
        line <- readLines(stdin_con, n = 1, warn = FALSE)

        if (length(line) == 0) {
            break # EOF
        }

        if (nchar(line) == 0) {
            next # Empty line
        }

        # Process
        response <- process_command(line, session_env)

        # Send JSON response
        cat(toJSON(response, auto_unbox = TRUE), "\n")
        flush(stdout())
    }
    close(stdin_con)
}

if (!interactive()) {
    main()
}
