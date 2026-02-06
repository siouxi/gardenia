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
    if (cmd_start < 0) return(NULL)
    
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
    return(list(command = command))
}

#' Simple JSON serializer for response objects
#' @param lst List with status, output, and error
#' @return JSON string
to_simple_json <- function(lst) {
    # Escape special characters in strings
    escape_json <- function(str) {
        if (is.null(str)) return("null")
        str <- gsub("\\\\", "\\\\\\\\", str)
        str <- gsub('"', '\\\\"', str)
        str <- gsub("\n", "\\\\n", str)
        str <- gsub("\r", "\\\\r", str)
        str <- gsub("\t", "\\\\t", str)
        paste0('"', str, '"')
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
    
    paste0("{", paste(parts, collapse = ","), "}")
}

#' Execute R code and capture output
#' @param code Character string containing R code to execute
#' @param env Environment to execute code in (for persistent session)
#' @return List with status, output, and error information
run_code <- function(code, env) {
    status <- "success"
    output_text <- ""
    error_msg <- NULL
    
    tryCatch({
        # Capture all output (stdout and messages)
        output_text <- capture.output({
            # Parse and evaluate the code
            result <- eval(parse(text = code), envir = env)
            
            # If result is not NULL and not invisible, print it (REPL-like behavior)
            if (!is.null(result)) {
                print(result)
            }
        }, type = "output")
        
        # Collapse output lines into a single string
        output_text <- paste(output_text, collapse = "\n")
        
    }, error = function(e) {
        status <<- "error"
        error_msg <<- paste("Error:", conditionMessage(e))
    }, warning = function(w) {
        # Warnings are treated as part of output, not errors
        output_text <<- paste(output_text, "\nWarning:", conditionMessage(w), sep = "\n")
    })
    
    list(
        status = status,
        output = output_text,
        error = error_msg
    )
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
        request <- tryCatch({
            parse_simple_json(line)
        }, error = function(e) {
            NULL
        })
        
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
