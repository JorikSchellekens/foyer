/**
 * Call the Foyer MCP endpoint from a terminal. For trying tools by hand and
 * for scripted checks.
 *
 *   FOYER_KEY=foyer_... bun scripts/mcp-cli.ts --list
 *   FOYER_KEY=foyer_... bun scripts/mcp-cli.ts get_workspace
 *   FOYER_KEY=foyer_... bun scripts/mcp-cli.ts get_dataroom '{"dataroomId":"..."}'
 *
 * FOYER_MCP_URL defaults to http://localhost:3000/api/mcp/mcp.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.env.FOYER_MCP_URL ?? "http://localhost:3000/api/mcp/mcp";
const key = process.env.FOYER_KEY;
if (!key) {
  console.error("Set FOYER_KEY to an API key from Settings > API and MCP.");
  process.exit(2);
}
const [tool, json] = process.argv.slice(2);
if (!tool) {
  console.error("Usage: bun scripts/mcp-cli.ts --list | --instructions | <tool> ['<json arguments>']");
  process.exit(2);
}

const client = new Client({ name: "foyer-cli", version: "1.0.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${key}` } },
  })
);

if (tool === "--instructions") {
  console.log(client.getInstructions());
} else if (tool === "--list") {
  const { tools } = await client.listTools();
  for (const t of tools) {
    const flags = [
      t.annotations?.readOnlyHint ? "read-only" : "changes data",
      t.annotations?.destructiveHint ? "destructive" : "",
    ].filter(Boolean);
    console.log(`\n${t.name}  [${flags.join(", ")}]\n  ${t.description}`);
    if (process.argv.includes("--schema"))
      console.log(`  input: ${JSON.stringify(t.inputSchema.properties ?? {})}`);
  }
} else {
  let args: Record<string, unknown> = {};
  try {
    args = json ? JSON.parse(json) : {};
  } catch {
    console.error("The second argument must be JSON, for example '{\"dataroomId\":\"...\"}'.");
    process.exit(2);
  }
  const res = await client.callTool({ name: tool, arguments: args });
  for (const c of res.content as { type: string; text?: string }[])
    if (c.type === "text") console.log(c.text);
  if (res.isError) process.exitCode = 1;
}
await client.close();
