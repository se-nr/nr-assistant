/**
 * N+R Agency MCP Server — local stdio entry point
 *
 * For lokal brug med Claude Code/Desktop.
 * Server-logik (alle tools) er i server.ts.
 *
 * Auto-update ved startup:
 * 1. Puller MCP serveren selv (nr-assistant repo) + rebuilder hvis ændret
 * 2. Puller Marketing AI Agents repo (agenter, skills, config)
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const log = (msg: string) => process.stderr.write(`[N+R Auto-Update] ${msg}\n`);

// ─── Generic repo updater ────────────────────────────────────────────────────

function gitPullIfBehind(repoPath: string, label: string): boolean {
  try {
    execSync("git fetch origin main --quiet 2>/dev/null", {
      cwd: repoPath, timeout: 10000, stdio: "pipe",
    });

    const local = execSync("git rev-parse HEAD", { cwd: repoPath, stdio: "pipe" }).toString().trim();
    const remote = execSync("git rev-parse origin/main", { cwd: repoPath, stdio: "pipe" }).toString().trim();

    if (local === remote) {
      log(`${label}: up to date.`);
      return false;
    }

    execSync("git pull --ff-only origin main --quiet 2>/dev/null", {
      cwd: repoPath, timeout: 15000, stdio: "pipe",
    });

    const count = execSync(`git rev-list ${local}..${remote} --count`, {
      cwd: repoPath, stdio: "pipe",
    }).toString().trim();

    log(`${label}: pulled ${count} new commit(s).`);
    return true;
  } catch {
    log(`${label}: could not auto-update. Run 'git pull' manually.`);
    return false;
  }
}

// ─── 1. Self-update MCP server ───────────────────────────────────────────────

function autoUpdateSelf(): void {
  // MCP server repo root: go up from dist/src/ or src/ to nr-agency-mcp/
  // Then up to nr-assistant/ (the git repo root)
  const mcpPkgDir = resolve(__dirname, ".."); // nr-agency-mcp/
  const nrAssistantRoot = resolve(mcpPkgDir, "../.."); // nr-assistant/

  if (!existsSync(resolve(nrAssistantRoot, ".git"))) return;

  const updated = gitPullIfBehind(nrAssistantRoot, "MCP server");

  if (updated) {
    // Rebuild if server code changed
    try {
      const diff = execSync("git diff HEAD~1 --name-only -- mcp/nr-agency-mcp/src/", {
        cwd: nrAssistantRoot, stdio: "pipe",
      }).toString().trim();

      if (diff) {
        log("MCP server: source changed, rebuilding...");
        execSync("npm run build", { cwd: mcpPkgDir, timeout: 30000, stdio: "pipe" });
        log("MCP server: rebuild complete. Restart session to use new version.");
      }
    } catch {
      log("MCP server: rebuild failed. Run 'npm run build' manually in nr-agency-mcp/.");
    }
  }
}

// ─── 2. Update Marketing AI Agents repo ──────────────────────────────────────

function autoUpdateAgentsRepo(): void {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const possiblePaths = [
    process.env.NR_AGENTS_REPO_PATH,
    home ? resolve(home, " Marketing AI Agents") : null,
    home ? resolve(home, "Marketing AI Agents") : null,
  ].filter(Boolean) as string[];

  for (const repoPath of possiblePaths) {
    if (!existsSync(resolve(repoPath, ".git")) || !existsSync(resolve(repoPath, ".claude/agents"))) continue;
    gitPullIfBehind(repoPath, "Agents");
    return;
  }
}

// ─── Run auto-updates (never block startup) ──────────────────────────────────

try { autoUpdateSelf(); } catch { /* silent */ }
try { autoUpdateAgentsRepo(); } catch { /* silent */ }

// ─── Start MCP server ────────────────────────────────────────────────────────

const server = createMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);
