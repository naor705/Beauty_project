/**
 * MCP server bootstrap.
 *
 * Currently runs a tiny stdin JSON-RPC-ish loop so we can demo tool calls
 * without a hard MCP SDK dependency. The real server should swap in
 * `@modelcontextprotocol/sdk` once we move past MVP.
 *
 * Usage (interactive):
 *   npm run mcp
 *   > {"method":"tools/list"}
 *   > {"method":"tools/call","params":{"name":"run_research","input":{}}}
 *
 * TODO(real):
 *   import { Server } from "@modelcontextprotocol/sdk/server/index.js";
 *   import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
 *   const server = new Server({ name: "beauty-researcher", version: "0.1.0" }, { capabilities: { tools: {} } });
 *   server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: listTools() }));
 *   server.setRequestHandler(CallToolRequestSchema, async (req) => ({ content: [{ type: "text", text: JSON.stringify(await runTool(req.params.name, req.params.arguments)) }] }));
 *   await server.connect(new StdioServerTransport());
 */
import { createInterface } from "node:readline";
import { listTools, runTool } from "./tools.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("mcp");

async function main(): Promise<void> {
  log.info(`mcp server ready — ${listTools().length} tools registered`);
  const rl = createInterface({ input: process.stdin });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const msg = JSON.parse(trimmed) as { method: string; params?: { name?: string; input?: unknown } };
      if (msg.method === "tools/list") {
        process.stdout.write(JSON.stringify({ ok: true, tools: listTools().map(({ handler: _h, ...rest }) => rest) }) + "\n");
      } else if (msg.method === "tools/call" && msg.params?.name) {
        const result = await runTool(msg.params.name, msg.params.input ?? {});
        process.stdout.write(JSON.stringify({ ok: true, result }) + "\n");
      } else {
        process.stdout.write(JSON.stringify({ ok: false, error: "unknown method" }) + "\n");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(JSON.stringify({ ok: false, error: msg }) + "\n");
    }
  }
}

main().catch((err) => {
  log.error("mcp server crashed", { err: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
