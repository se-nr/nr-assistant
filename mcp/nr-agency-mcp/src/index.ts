/**
 * N+R Agency MCP Server — local stdio entry point
 *
 * For lokal brug med Claude Code/Desktop.
 * Server-logik (alle tools) er i server.ts.
 *
 * Lokalt: npm run dev
 * Vercel: bruger api/mcp.ts i stedet
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ─── Auto-update Marketing AI Agents repo ────────────────────────────────────

function autoUpdateAgentsRepo(): void {
  // Find the repo relative to this MCP server
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // MCP server is at ~/.claude/nr-assistant/mcp/nr-agency-mcp/
  // Marketing AI Agents could be at a configured path or common location
  const possiblePaths = [
    resolve(__dirname, "../../../../.."), // Up from src/ to ~ then check
    process.env.NR_AGENTS_REPO_PATH,     // Explicit env override
  ].filter(Boolean) as string[];

  // Also check home directory for the repo
  const home = process.env.HOME || process.env.USERPROFILE || "";
  if (home) {
    possiblePaths.push(resolve(home, " Marketing AI Agents"));
    possiblePaths.push(resolve(home, "Marketing AI Agents"));
  }

  for (const repoPath of possiblePaths) {
    const gitDir = resolve(repoPath, ".git");
    const agentsDir = resolve(repoPath, ".claude/agents");

    if (!existsSync(gitDir) || !existsSync(agentsDir)) continue;

    try {
      // Fetch latest
      execSync("git fetch origin main --quiet 2>/dev/null", {
        cwd: repoPath,
        timeout: 10000,
        stdio: "pipe",
      });

      // Check if behind
      const local = execSync("git rev-parse HEAD", { cwd: repoPath, stdio: "pipe" }).toString().trim();
      const remote = execSync("git rev-parse origin/main", { cwd: repoPath, stdio: "pipe" }).toString().trim();

      if (local === remote) {
        process.stderr.write("[N+R Auto-Update] Agents repo already up to date.\n");
        return;
      }

      // Pull (fast-forward only)
      execSync("git pull --ff-only origin main --quiet 2>/dev/null", {
        cwd: repoPath,
        timeout: 15000,
        stdio: "pipe",
      });

      const behind = execSync(`git rev-list ${local}..${remote} --count`, { cwd: repoPath, stdio: "pipe" }).toString().trim();
      process.stderr.write(`[N+R Auto-Update] Pulled ${behind} new commit(s) from agents repo.\n`);
      return;
    } catch {
      // Silent fail — don't block server startup
      process.stderr.write("[N+R Auto-Update] Could not auto-update agents repo. Run 'git pull' manually.\n");
      return;
    }
  }

  // No repo found — not an error, just skip
}

// Run auto-update before starting server (non-blocking on failure)
try {
  autoUpdateAgentsRepo();
} catch {
  // Never block server startup
}

// ─── Start MCP server ────────────────────────────────────────────────────────

const server = createMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);
