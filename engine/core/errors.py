"""
Gardenia Error Classes
======================

Typed error classes for consistent error handling across Python and R execution.
"""

from enum import Enum
from dataclasses import dataclass, field
from typing import Optional, List
import re


class ErrorCategory(Enum):
    """Categories of errors that can occur during execution"""
    SYNTAX = "syntax"           # Syntax error in code
    RUNTIME = "runtime"         # Runtime exception
    TIMEOUT = "timeout"         # Execution timeout
    MEMORY = "memory"           # Memory limit exceeded
    DEPENDENCY = "dependency"   # Missing library/module
    FILE = "file"               # File not found
    SESSION = "session"         # R/Python session error
    CONNECTION = "connection"   # Connection error


# Mapping of error categories to user-friendly suggestions
ERROR_SUGGESTIONS = {
    ErrorCategory.SYNTAX: [
        "Check syntax on the indicated line",
        "Look for missing brackets, quotes, or colons",
    ],
    ErrorCategory.DEPENDENCY: [
        "Install the missing package",
        "Check package name spelling",
    ],
    ErrorCategory.TIMEOUT: [
        "Increase timeout in Advanced Settings",
        "Optimize code to run faster",
        "Process data in smaller chunks",
    ],
    ErrorCategory.MEMORY: [
        "Increase memory limit in Advanced Settings",
        "Process data in smaller batches",
        "Use more memory-efficient data structures",
    ],
    ErrorCategory.FILE: [
        "Verify the file path is correct",
        "Check if file exists",
        "Use absolute path instead of relative",
    ],
    ErrorCategory.SESSION: [
        "Restart the R/Python session",
        "Check if R/Python is installed correctly",
    ],
    ErrorCategory.RUNTIME: [
        "Review the error traceback",
        "Check variable types and values",
    ],
    ErrorCategory.CONNECTION: [
        "Restart the application",
        "Check if R/Python is running",
    ],
}


@dataclass
class GardeniaError:
    """Structured error with category and suggestions"""
    category: ErrorCategory
    message: str
    language: str = "python"  # 'python' | 'r'
    node_id: Optional[str] = None
    line_number: Optional[int] = None
    suggestions: List[str] = field(default_factory=list)
    recoverable: bool = False
    original_error: Optional[str] = None
    
    def __post_init__(self):
        # Add default suggestions if none provided
        if not self.suggestions:
            self.suggestions = ERROR_SUGGESTIONS.get(self.category, [])
    
    def to_dict(self) -> dict:
        return {
            "category": self.category.value,
            "message": self.message,
            "language": self.language,
            "node_id": self.node_id,
            "line_number": self.line_number,
            "suggestions": self.suggestions,
            "recoverable": self.recoverable,
        }


def parse_python_error(error_str: str, node_id: Optional[str] = None) -> GardeniaError:
    """Parse a Python error string into a GardeniaError"""
    
    # Check for timeout
    if "timed out" in error_str.lower() or "timeout" in error_str.lower():
        return GardeniaError(
            category=ErrorCategory.TIMEOUT,
            message=error_str,
            language="python",
            node_id=node_id,
            recoverable=True,
        )
    
    # Check for memory error
    if "MemoryError" in error_str or "memory" in error_str.lower():
        return GardeniaError(
            category=ErrorCategory.MEMORY,
            message=error_str,
            language="python",
            node_id=node_id,
        )
    
    # Check for module not found
    if "ModuleNotFoundError" in error_str or "No module named" in error_str:
        # Extract module name
        match = re.search(r"No module named ['\"]?(\w+)['\"]?", error_str)
        module_name = match.group(1) if match else "unknown"
        return GardeniaError(
            category=ErrorCategory.DEPENDENCY,
            message=f"Module '{module_name}' not found",
            language="python",
            node_id=node_id,
            suggestions=[f"Install {module_name}: pip install {module_name}"],
            recoverable=True,
        )
    
    # Check for file not found
    if "FileNotFoundError" in error_str or "No such file" in error_str:
        return GardeniaError(
            category=ErrorCategory.FILE,
            message=error_str,
            language="python",
            node_id=node_id,
        )
    
    # Check for syntax error
    if "SyntaxError" in error_str:
        # Try to extract line number
        line_match = re.search(r"line (\d+)", error_str)
        line_num = int(line_match.group(1)) if line_match else None
        return GardeniaError(
            category=ErrorCategory.SYNTAX,
            message=error_str,
            language="python",
            node_id=node_id,
            line_number=line_num,
        )
    
    # Default to runtime error
    return GardeniaError(
        category=ErrorCategory.RUNTIME,
        message=error_str,
        language="python",
        node_id=node_id,
        original_error=error_str,
    )


def parse_r_error(error_str: str, node_id: Optional[str] = None) -> GardeniaError:
    """Parse an R error string into a GardeniaError"""
    
    # Check for timeout
    if "timed out" in error_str.lower() or "timeout" in error_str.lower():
        return GardeniaError(
            category=ErrorCategory.TIMEOUT,
            message=error_str,
            language="r",
            node_id=node_id,
            recoverable=True,
        )
    
    # Check for library not found
    if "there is no package called" in error_str.lower():
        match = re.search(r"no package called ['\"]?(\w+)['\"]?", error_str, re.IGNORECASE)
        pkg_name = match.group(1) if match else "unknown"
        return GardeniaError(
            category=ErrorCategory.DEPENDENCY,
            message=f"R package '{pkg_name}' not found",
            language="r",
            node_id=node_id,
            suggestions=[f"Install {pkg_name}: install.packages('{pkg_name}')"],
            recoverable=True,
        )
    
    # Check for could not find function
    if "could not find function" in error_str.lower():
        match = re.search(r"could not find function ['\"]?(\w+)['\"]?", error_str, re.IGNORECASE)
        func_name = match.group(1) if match else "unknown"
        return GardeniaError(
            category=ErrorCategory.DEPENDENCY,
            message=f"Function '{func_name}' not found. May need to load a library.",
            language="r",
            node_id=node_id,
            suggestions=[
                f"Load the library containing {func_name}",
                "Check function name spelling",
            ],
        )
    
    # Check for file not found
    if "cannot open file" in error_str.lower() or "does not exist" in error_str.lower():
        return GardeniaError(
            category=ErrorCategory.FILE,
            message=error_str,
            language="r",
            node_id=node_id,
        )
    
    # Check for parse error (syntax)
    if "Error in parse" in error_str or "unexpected" in error_str.lower():
        line_match = re.search(r"line (\d+)", error_str)
        line_num = int(line_match.group(1)) if line_match else None
        return GardeniaError(
            category=ErrorCategory.SYNTAX,
            message=error_str,
            language="r",
            node_id=node_id,
            line_number=line_num,
        )
    
    # Check for session error
    if "session" in error_str.lower() and ("crash" in error_str.lower() or "died" in error_str.lower()):
        return GardeniaError(
            category=ErrorCategory.SESSION,
            message="R session crashed",
            language="r",
            node_id=node_id,
            recoverable=True,
        )
    
    # Default to runtime error
    return GardeniaError(
        category=ErrorCategory.RUNTIME,
        message=error_str,
        language="r",
        node_id=node_id,
        original_error=error_str,
    )
