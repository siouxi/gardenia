import sys
import json
import subprocess
import os
import time
import socket
import getpass
from datetime import datetime

def get_conda_env():
    # Try to get conda env from environment variable
    env_path = os.environ.get('CONDA_PREFIX')
    if env_path:
        return os.path.basename(env_path)
    return "base" # simplistic fallback or check if we are actually in base

def generate_prompt(cwd):
    # Format: HH:MM:SS (env) user@host cwd
    now = datetime.now().strftime("%H:%M:%S")
    env = get_conda_env()
    user = getpass.getuser()
    host = socket.gethostname()
    current_dir = os.path.basename(cwd) if os.path.basename(cwd) else cwd
    
    # 01:42:06 (base) nicolas@minicotina GardeniaW
    return f"{now} ({env}) {user}@{host} {current_dir}"

def main():
    # Initial state
    current_cwd = os.getcwd()
    # We might want to source .bashrc logic or just rely on the python process env
    # But sourcing .bashrc for every command is slow.
    
    # Create a nice initial prompt
    print(json.dumps({
        "status": "success",
        "output": "Gardenia Bash Bridge initialized.",
        "prompt": generate_prompt(current_cwd)
    }))
    sys.stdout.flush()

    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            
            try:
                request = json.loads(line)
            except json.JSONDecodeError:
                continue

            command = request.get('command', '')
            
            # Special handling for 'cd' to persist directory
            # This is a basic simulation. Complex chains like "echo hi; cd ..; ls" won't update our tracked cwd perfectly if we don't parse it.
            # For a bridge, perfect emulation is hard without PTY. 
            # We will rely on subprocess.run with cwd argument.
            
            # Handle directory changing manually if it's a simple cd command
            if command.strip().startswith('cd '):
                target_dir = command.strip()[3:].strip()
                new_dir = os.path.abspath(os.path.join(current_cwd, target_dir))
                if os.path.exists(new_dir) and os.path.isdir(new_dir):
                    current_cwd = new_dir
                    output = ""
                else:
                    output = f"bash: cd: {target_dir}: No such file or directory\n"
            else:
                # Run command in the current_cwd
                # We use shell=True to allow piping, etc.
                try:
                    # We invoke bash specifically to ensure bash syntax works
                    result = subprocess.run(
                        ['bash', '-c', command],
                        cwd=current_cwd,
                        capture_output=True,
                        text=True,
                        env=os.environ # Pass current env
                    )
                    output = result.stdout + result.stderr
                    
                    # Capture exit code if needed, but for now just output
                except Exception as e:
                    output = str(e)

            # Generate prompt after execution
            prompt = generate_prompt(current_cwd)
            
            response = {
                "status": "success",
                "output": output,
                "prompt": prompt
            }
            
            print(json.dumps(response))
            sys.stdout.flush()

        except KeyboardInterrupt:
            continue
        except Exception as e:
            # Fatal error
            err_response = {
                "status": "error",
                "output": str(e),
                "prompt": "> "
            }
            print(json.dumps(err_response))
            sys.stdout.flush()

if __name__ == "__main__":
    main()
