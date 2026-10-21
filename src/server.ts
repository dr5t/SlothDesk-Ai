import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { approveOperations, rollbackExecution, runCleanup } from "./workflow.js";
import { getExecution, listExecutions } from "./store.js";
import { OllamaProvider } from "./provider.js";

const port = Number(process.env.PORT ?? 3147);
const publicDir = path.resolve("public");
const json = (response: import("node:http").ServerResponse, status: number, value: unknown) => {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (request.method === "GET" && url.pathname === "/api/health") return json(response, 200, { ok: true, model: await new OllamaProvider().health() });
    if (request.method === "GET" && url.pathname === "/api/executions") return json(response, 200, await listExecutions());
    if (request.method === "POST" && url.pathname === "/api/cleanup") {
      if (process.env.HOSTED_MODE === "true") return json(response, 403, { error: "Hosted mode accepts uploads only; local workspace access is disabled." });
      const body = await readBody(request);
      if (typeof body.workspace !== "string" || !body.workspace.trim()) return json(response, 400, { error: "A workspace path is required." });
      return json(response, 200, await runCleanup(body.workspace));
    }
    if (request.method === "POST" && url.pathname === "/api/approve") {
      const body = await readBody(request);
      if (typeof body.executionId !== "string" || !Array.isArray(body.approvedIds)) return json(response, 400, { error: "Execution ID and approved IDs are required." });
      const execution = await getExecution(body.executionId);
      if (!execution) return json(response, 404, { error: "Execution was not found." });
      return json(response, 200, { results: await approveOperations(execution, body.approvedIds) });
    }
    if (request.method === "POST" && url.pathname === "/api/rollback") {
      const body = await readBody(request);
      if (typeof body.executionId !== "string") return json(response, 400, { error: "Execution ID is required." });
      return json(response, 200, { results: await rollbackExecution(body.executionId) });
    }
    if (request.method === "GET") {
      const requested = url.pathname === "/" ? "/index.html" : url.pathname;
      const filePath = path.resolve(publicDir, `.${requested}`);
      if (!filePath.startsWith(publicDir)) return json(response, 403, { error: "Forbidden" });
      const contents = await fs.readFile(filePath);
      response.writeHead(200, { "content-type": requested.endsWith(".css") ? "text/css" : "text/html" });
      return response.end(contents);
    }
    return json(response, 404, { error: "Not found" });
  } catch (error) {
    return json(response, 500, { error: error instanceof Error ? error.message : "Unexpected server error" });
  }
});

async function readBody(request: import("node:http").IncomingMessage): Promise<Record<string, any>> {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  if (raw.length > 100_000) throw new Error("Request too large.");
  return JSON.parse(raw || "{}") as Record<string, any>;
}

server.listen(port, () => console.log(`SlothDesk AI listening at http://localhost:${port}`));
