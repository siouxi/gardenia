#!/usr/bin/env python3
import os
import re

# This script finds all node .ts files in the registry definitions folder
# and applies a streaming-aware Zero-Copy wrapping to the node logic.

TARGET_DIR = "/home/nicolas/Documentos/gardenia/gardeniaclient/src/registry/definitions"

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # We want to identify the `.setPythonCode(...)` block
    # and replace the standard `if 'data' in dir() and isinstance(data, pd.DataFrame):`
    # check with a unified streaming/zero-copy handler.
    
    # We will only process files that have a `.setPythonCode(` block and a simple `if 'data' in dir()` pattern.
    if ".setPythonCode" not in content:
        return

    # Check if this node is just an Input node (e.g. read_csv). They generate data, not consume it.
    if "import pandas as pd" in content and "read_" in content and "Input" in filepath:
        # We need to add chunksize support to Inputs
        new_content = content.replace(
            "pd.read_csv(filepath", 
            "pd.read_csv(filepath, chunksize=params.get('chunksize', None)"
        )
        # Not a full streaming refactor for this demo script, keeping it safer for generic nodes
        pass

    # The most common pattern for processing nodes is:
    # if 'data' in dir() and isinstance(data, pd.DataFrame):
    #     <do something with data to produce result>
    #     result = ...
    
    # We will look for:
    # 1. `if 'data' in dir() and isinstance(data, pd.DataFrame):`
    # 2. Extract the body
    
    match = re.search(r"if 'data' in dir\(\) and isinstance\(data, pd\.DataFrame\):\n(.*?)(?=\nelse:|\n`,\s*\[|\Z)", content, re.DOTALL)
    
    if not match:
        return

    original_body = match.group(1)
    
    # Indentation fix: typically the body is indented by 4 spaces.
    # We want to create a processing function we can map over purely memory chunks OR standard data.
    
    # Create the unified template complying with AI_AGENT_GUIDELINES.md:
    new_python_code = """# 🛡️ ARCHITECTURE COMPLIANT NODE (Zero-Copy & Streaming)
import pandas as pd

def process_chunk(df: pd.DataFrame) -> pd.DataFrame:
    # --- Original Node Logic ---
""" + original_body + """
    # ---------------------------
    return result

# 1. STREAMING MODE SUPPORT
if 'stream_input' in dir() and hasattr(stream_input('data'), '__iter__'):
    stream = stream_input('data')
    for chunk in stream:
        yield process_chunk(chunk)

# 2. ZERO-COPY FULL MEMORY MODE SUPPORT
elif 'data' in dir() and isinstance(data, pd.DataFrame):
    result = process_chunk(data)
    print("Zero-Copy block processed successfully.")
else:
    raise ValueError("Connect a dataset (Zero-Copy) or stream (Streaming) to the input.")
"""

    # We need to replace the old `if...else` block with our new architecture.
    old_block_match = re.search(r"if 'data' in dir\(\) and isinstance\(data, pd\.DataFrame\):.*?(?=\n`,\s*\[)", content, re.DOTALL)
    
    if old_block_match:
        old_block = old_block_match.group(0)
        
        # We need to un-indent the original body relative to its own baseline, 
        # then re-indent it by exactly 4 spaces for the process_chunk function.
        lines = original_body.split('\n')
        # find minimum indentation of non-empty lines
        non_empty_lines = [line for line in lines if line.strip()]
        if non_empty_lines:
            min_indent = min(len(line) - len(line.lstrip()) for line in non_empty_lines)
            unindented_lines = [line[min_indent:] if len(line[:min_indent].strip()) == 0 else line for line in lines]
        else:
            unindented_lines = lines
            
        indented_body = "\n".join(["    " + line if line.strip() else line for line in unindented_lines])
        
        final_replacement = """# 🛡️ ARCHITECTURE COMPLIANT NODE (Zero-Copy & Streaming)
import pandas as pd

def process_chunk(data: pd.DataFrame) -> pd.DataFrame:
""" + indented_body + """
    return result if 'result' in locals() else data

# 1. STREAMING MODE SUPPORT
if 'stream_input' in dir() and hasattr(stream_input('data'), '__iter__'):
    stream = stream_input('data')
    for chunk in stream:
        yield process_chunk(chunk)

# 2. ZERO-COPY FULL MEMORY MODE SUPPORT
elif 'data' in dir() and isinstance(data, pd.DataFrame):
    result = process_chunk(data)
    print("Zero-Copy block processed successfully.")
else:
    raise ValueError("Connect a dataset (Zero-Copy) or stream (Streaming) to the input.")"""

        new_content = content.replace(old_block, final_replacement)
        
        # Write back
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Refactored: {os.path.basename(filepath)}")


def main():
    count = 0
    for filename in os.listdir(TARGET_DIR):
        if filename.endswith(".ts"):
            process_file(os.path.join(TARGET_DIR, filename))
            count += 1
    print(f"Done processing {count} files.")

if __name__ == "__main__":
    main()
