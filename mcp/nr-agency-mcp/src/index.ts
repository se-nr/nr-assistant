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

const server = createMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);
