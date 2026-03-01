#!/usr/bin/env python3
"""
NotebookLM MCP Server
Wraps the notebooklm skill scripts for use in Claude Desktop and other MCP-compatible clients.
"""

import subprocess
import sys
from pathlib import Path

from mcp.server.fastmcp import FastMCP

SKILL_DIR = Path(__file__).parent
RUN_PY = SKILL_DIR / "scripts" / "run.py"

mcp = FastMCP(
    "notebooklm",
    description="Query Google NotebookLM notebooks for source-grounded, citation-backed research answers"
)


def _run(script: str, *args, timeout: int = 180) -> str:
    """Run a notebooklm script via run.py and return output."""
    result = subprocess.run(
        [sys.executable, str(RUN_PY), script, *args],
        capture_output=True,
        text=True,
        cwd=str(SKILL_DIR),
        timeout=timeout
    )
    output = result.stdout.strip()
    if result.returncode != 0:
        stderr = result.stderr.strip()
        if stderr and stderr not in output:
            return f"Error: {stderr}\n{output}".strip()
    return output or "No output returned"


@mcp.tool()
def notebooklm_query(
    question: str,
    notebook_id: str = "",
    notebook_url: str = ""
) -> str:
    """
    Query a NotebookLM notebook with a question.
    Returns a source-grounded answer based only on documents uploaded to the notebook.
    Provide either notebook_id (from notebooklm_list) or notebook_url directly.
    If neither is provided, uses the active notebook.
    """
    args = ["--question", question]
    if notebook_url:
        args += ["--notebook-url", notebook_url]
    elif notebook_id:
        args += ["--notebook-id", notebook_id]
    return _run("ask_question.py", *args)


@mcp.tool()
def notebooklm_list() -> str:
    """
    List all notebooks in the library with their IDs, topics, and usage stats.
    Use this to find notebook IDs before querying.
    """
    return _run("notebook_manager.py", "list")


@mcp.tool()
def notebooklm_search(query: str) -> str:
    """
    Search the notebook library by topic or keyword.
    Returns matching notebooks with their IDs.
    """
    return _run("notebook_manager.py", "search", "--query", query)


@mcp.tool()
def notebooklm_add(
    url: str,
    name: str,
    description: str,
    topics: str
) -> str:
    """
    Add a new notebook to the library.
    - url: Full NotebookLM URL (https://notebooklm.google.com/notebook/...)
    - name: Short display name
    - description: What the notebook contains (be specific)
    - topics: Comma-separated keywords (e.g. "brand-strategy,voc,competitor-analysis")
    """
    return _run(
        "notebook_manager.py", "add",
        "--url", url,
        "--name", name,
        "--description", description,
        "--topics", topics
    )


@mcp.tool()
def notebooklm_activate(notebook_id: str) -> str:
    """
    Set a notebook as the active default for subsequent queries.
    Use notebooklm_list to find the notebook ID.
    """
    return _run("notebook_manager.py", "activate", "--id", notebook_id)


@mcp.tool()
def notebooklm_auth_status() -> str:
    """
    Check if NotebookLM authentication is valid.
    If not authenticated, the user must run auth setup via Claude Code CLI:
    cd ~/.claude/skills/notebooklm && python scripts/run.py auth_manager.py setup
    """
    return _run("auth_manager.py", "status", timeout=30)


if __name__ == "__main__":
    mcp.run(transport="stdio")
