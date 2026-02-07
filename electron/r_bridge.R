#!/usr/bin/env Rscript

# R Bridge Script for JSON-based communication with Electron
# Uses ONLY base R - no external packages required

#' Simple JSON parser for single-level objects (sufficient for our needs)
#' @param json_str Character string containing JSON
#' @return List with parsed values
parse_simple_json <- function(json_str) {
    # Extract command value using a simpler approach
    # Match: "command" : "anything here"
    # We need to handle escaped quotes within the value

    # Find the start of "command"
    cmd_start <- regexpr('"command"\\s*:\\s*"', json_str, perl = TRUE)
    if (cmd_start < 0) {
        return(NULL)
    }

    # Move past the opening quote
    value_start <- cmd_start + attr(cmd_start, "match.length")

    # Find the closing quote (not preceded by backslash)
    remaining <- substring(json_str, value_start)

    # Simple extraction: find the first unescaped quote
    chars <- strsplit(remaining, "")[[1]]
    result <- character(0)
    i <- 1
    while (i <= length(chars)) {
        if (chars[i] == "\\" && i < length(chars)) {
            # Escaped character - decode it
            next_char <- chars[i + 1]
            if (next_char == "n") {
                result <- c(result, "\n")
            } else if (next_char == "t") {
                result <- c(result, "\t")
            } else if (next_char == "r") {
                result <- c(result, "\r")
            } else if (next_char == "\\" || next_char == '"') {
                result <- c(result, next_char)
            } else {
                # Unknown escape, keep as is
                result <- c(result, next_char)
            }
            i <- i + 2
        } else if (chars[i] == '"') {
            # Found closing quote
            break
        } else {
            result <- c(result, chars[i])
            i <- i + 1
        }
    }

    command <- paste(result, collapse = "")
    list(command = command)
}

#' Simple JSON serializer for response objects
#' @param lst List with status, output, error, and variables
#' @return JSON string
to_simple_json <- function(lst) {
    # Escape special characters in strings
    escape_json <- function(str) {
        if (is.null(str)) {
            return("null")
        }
        str <- gsub("\\\\", "\\\\\\\\", str)
        str <- gsub('"', '\\\\"', str)
        str <- gsub("\n", "\\\\n", str)
        str <- gsub("\r", "\\\\r", str)
        str <- gsub("\t", "\\\\t", str)
        paste0('"', str, '"')
    }

    # Serialize a variable object
    serialize_var <- function(v) {
        paste0(
            "{",
            '"name":', escape_json(v$name), ",",
            '"value":', escape_json(as.character(v$value)), ",",
            '"type_hint":', escape_json(v$type_hint), ",",
            '"is_dataframe":', if (isTRUE(v$is_dataframe)) "true" else "false",
            "}"
        )
    }

    parts <- character(0)
    if (!is.null(lst$status)) {
        parts <- c(parts, paste0('"status":', escape_json(lst$status)))
    }
    if (!is.null(lst$output)) {
        parts <- c(parts, paste0('"output":', escape_json(lst$output)))
    }
    if (!is.null(lst$error)) {
        parts <- c(parts, paste0('"error":', escape_json(lst$error)))
    } else {
        parts <- c(parts, '"error":null')
    }

    # Serialize variables array
    if (!is.null(lst$variables) && length(lst$variables) > 0) {
        vars_json <- sapply(lst$variables, serialize_var)
        parts <- c(parts, paste0(
            '"variables":[', paste(vars_json, collapse = ","), "]"
        ))
    } else {
        parts <- c(parts, '"variables":[]')
    }

    paste0("{", paste(parts, collapse = ","), "}")
}

#' Execute R code and capture output
#' @param code Character string containing R code to execute
#' @param env Environment to execute code in (for persistent session)
#' @return List with status, output, error, and variables
run_code <- function(code, env) {
    status <- "success"
    output_text <- ""
    error_msg <- NULL

    tryCatch(
        {
            # Capture all output (stdout and messages)
            output_text <- capture.output(
                {
                    # Parse and evaluate the code with visibility tracking
                    result <- withVisible(eval(parse(text = code), envir = env))

                    # Only print if the result is visible (REPL-like behavior)
                    # This prevents duplicate output for expressions
                    if (result$visible && !is.null(result$value)) {
                        print(result$value)
                    }
                },
                type = "output"
            )

            # Collapse output lines into a single string
            output_text <- paste(output_text, collapse = "\n")
        },
        error = function(e) {
            status <<- "error"
            error_msg <<- paste("Error:", conditionMessage(e))
        },
        warning = function(w) {
            # Warnings are treated as part of output, not errors
            output_text <<- paste(
                output_text, "\nWarning:", conditionMessage(w),
                sep = "\n"
            )
        }
    )

    # Extract variables from session environment
    variables <- extract_variables(env)

    list(
        status = status,
        output = output_text,
        error = error_msg,
        variables = variables
    )
}

#' Extract variables from environment
#' @param env Environment to extract from
#' @return List of variable info
extract_variables <- function(env) {
    var_names <- ls(env)
    if (length(var_names) == 0) {
        return(list())
    }

    vars <- lapply(var_names, function(name) {
        value <- get(name, envir = env)

        # Determine type
        type_hint <- class(value)[1]
        is_df <- is.data.frame(value)

        # Serialize value (simple types only, truncate for large objects)
        serialized_value <- tryCatch(
            {
                if (is_df) {
                    paste0(
                        "[data.frame: ", nrow(value), " rows x ", ncol(value), " cols]"
                    )
                } else if (is.function(value)) {
                    "[function]"
                } else if (is.environment(value)) {
                    "[environment]"
                } else if (length(value) > 100) {
                    paste0("[", type_hint, ": length ", length(value), "]")
                } else if (is.atomic(value) && length(value) <= 10) {
                    # Small atomic vectors - convert to string
                    paste(as.character(value), collapse = ", ")
                } else {
                    paste0("[", type_hint, "]")
                }
            },
            error = function(e) {
                "[unable to serialize]"
            }
        )

        list(
            name = name,
            value = serialized_value,
            type_hint = type_hint,
            is_dataframe = is_df
        )
    })

    vars
}

#' Main loop: read JSON from stdin, execute, return JSON
main <- function() {
    # Create persistent environment for session state
    session_env <- new.env(parent = .GlobalEnv)

    # Set stdin connection to read line by line
    stdin_con <- file("stdin", "r", blocking = TRUE)

    # Main REPL loop
    while (TRUE) {
        # Read one line from stdin
        line <- readLines(stdin_con, n = 1, warn = FALSE)

        # Check for EOF
        if (length(line) == 0) {
            break
        }

        # Try to parse JSON request
        request <- tryCatch(
            {
                parse_simple_json(line)
            },
            error = function(e) {
                NULL
            }
        )

        # Ignore malformed JSON
        if (is.null(request) || is.null(request$command)) {
            next
        }

        # Execute command
        response <- run_code(request$command, session_env)

        # Send JSON response as a single line
        response_json <- to_simple_json(response)
        cat(response_json, "\n", sep = "")
        flush(stdout())
    }

    close(stdin_con)
}

# Run main loop
if (!interactive()) {
    main()
}
