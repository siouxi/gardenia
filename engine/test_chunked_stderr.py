import asyncio
import os
import sys

# Add parent to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.worker_manager import WorkerManager
import logging

logging.basicConfig(level=logging.DEBUG)

async def main():
    wm = WorkerManager()
    r_code = """
options(timeout=10)
library(GEOquery)
getGEOSuppFiles("GSE189903", makeDirectory=FALSE, fetch_files=TRUE)
print("Finished!")
"""
    print("Starting execution...")
    result = await wm.execute(
        code=r_code,
        language="r",
        node_id="test_node_geo",
        parameters={"accession": "GSE189903"},
        timeout=20
    )
    print("\n\n--- RESULTS ---")
    print("STATUS", result.status)
    print("ERROR", result.error)
    print("OUTPUT len:", len(result.output))
    if result.output:
        print("OUTPUT end:", result.output[-300:])

if __name__ == "__main__":
    asyncio.run(main())
