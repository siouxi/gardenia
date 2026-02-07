import sys
import json
import io
import traceback
import ast

def run_code(code, local_vars):
    # Capture stdout/stderr
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    sys.stdout = buffer_out = io.StringIO()
    sys.stderr = buffer_err = io.StringIO()
    
    status = "success"
    error_msg = None
    
    try:
        # Parse the code to check structure
        tree = ast.parse(code)
        
        # Check if the last statement is an expression (so we can print it like a REPL)
        if tree.body and isinstance(tree.body[-1], ast.Expr):
            # Separate the last expression
            last_expr = tree.body.pop()
            
            # Execute all preceding statements
            if tree.body:
                exec(compile(tree, filename="<string>", mode="exec"), local_vars)
            
            # Evaluate the last expression
            res = eval(compile(ast.Expression(last_expr.value), filename="<string>", mode="eval"), local_vars)
            
            # If the result is not None, print it to our captured stdout
            if res is not None:
                print(res)
        else:
            # If not ending in expression, just execute typically
            exec(code, local_vars)
            
    except Exception:
        status = "error"
        # Return the full traceback
        error_msg = traceback.format_exc()
    
    # Restore stdout/stderr
    sys.stdout = old_stdout
    sys.stderr = old_stderr
    
    return {
        "status": status,
        "output": buffer_out.getvalue(),
        "error": error_msg or buffer_err.getvalue()
    }

def main():
    # Persistent dictionary for local variables (session state)
    local_vars = {}
    
    # Print a ready signal or just start loop
    # We can print a startup message if needed, but better to keep protocol pure JSON
    
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            
            try:
                req = json.loads(line)
            except json.JSONDecodeError:
                # Ignore malformed lines
                continue
                
            command = req.get("command", "")
            
            response = run_code(command, local_vars)
            
            # Send JSON response as a single line
            print(json.dumps(response))
            sys.stdout.flush()
            
        except Exception as e:
            # Handle fatal errors in the loop logic itself
            err_response = {"status": "fatal", "error": str(e)}
            print(json.dumps(err_response))
            sys.stdout.flush()

if __name__ == "__main__":
    main()
