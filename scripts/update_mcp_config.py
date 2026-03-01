#!/usr/bin/env python3
"""
Merger NR_assistant MCP-entries ind i claude_desktop_config.json.
Tilføjer kun entries der ikke allerede eksisterer – overskriver ikke eksisterende.
"""
import json
import sys
import shutil
from datetime import datetime
from pathlib import Path

def main():
    if len(sys.argv) != 3:
        print("Usage: update_mcp_config.py <config.json> <mcp-entries.json>")
        sys.exit(1)

    config_path = Path(sys.argv[1])
    entries_path = Path(sys.argv[2])

    # Load files
    with open(config_path) as f:
        config = json.load(f)
    with open(entries_path) as f:
        new_entries = json.load(f)

    # Ensure mcpServers key exists
    if "mcpServers" not in config:
        config["mcpServers"] = {}

    added = []
    skipped = []

    for name, entry in new_entries.items():
        if name in config["mcpServers"]:
            skipped.append(name)
        else:
            config["mcpServers"][name] = entry
            added.append(name)

    if not added:
        print(f"  ✓ MCP config: alle entries allerede tilstede ({', '.join(skipped)})")
        return

    # Backup original
    backup = config_path.with_suffix(f".backup.{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    shutil.copy2(config_path, backup)

    # Write updated config
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)
        f.write("\n")

    for name in added:
        print(f"  ✓ MCP tilføjet: {name}")
    for name in skipped:
        print(f"  → MCP allerede konfigureret: {name}")

if __name__ == "__main__":
    main()
