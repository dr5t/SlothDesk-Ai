import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { approveOperations, rollbackExecution, runCleanup } from "./workflow.js";
import { getExecution, listExecutions } from "./store.js";
import { OllamaProvider } from "./provider.js";

const port = Number(process.env.PORT ?? 3147);
const publicDir = path.resolve("public");

export const json = (response: ServerResponse, status: number, value: unknown) => {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
};

export const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return json(response, 200, { ok: true, model: await new OllamaProvider().health() });
    }

    if (request.method === "GET" && url.pathname === "/api/executions") {
      return json(response, 200, await listExecutions());
    }

    if (request.method === "POST" && url.pathname === "/api/cleanup") {
      if (process.env.HOSTED_MODE === "true") {
        return json(response, 403, { error: "Hosted mode accepts uploads only; local workspace access is disabled." });
      }
      const body = await readBody(request);
      if (typeof body.workspace !== "string" || !body.workspace.trim()) {
        return json(response, 400, { error: "A workspace path is required." });
      }
      return json(response, 200, await runCleanup(body.workspace));
    }

    if (request.method === "POST" && url.pathname === "/api/approve") {
      if (process.env.HOSTED_MODE === "true") {
        return json(response, 403, { error: "Hosted mode accepts uploads only; local workspace access is disabled." });
      }
      const body = await readBody(request);
      if (
        typeof body.executionId !== "string" ||
        !Array.isArray(body.approvedIds) ||
        !body.approvedIds.every((id: unknown) => typeof id === "string")
      ) {
        return json(response, 400, { error: "Execution ID and approved IDs (array of strings) are required." });
      }
      const execution = await getExecution(body.executionId);
      if (!execution) return json(response, 404, { error: "Execution was not found." });
      return json(response, 200, { results: await approveOperations(execution, body.approvedIds) });
    }

    if (request.method === "POST" && url.pathname === "/api/rollback") {
      if (process.env.HOSTED_MODE === "true") {
        return json(response, 403, { error: "Hosted mode accepts uploads only; local workspace access is disabled." });
      }
      const body = await readBody(request);
      if (typeof body.executionId !== "string") {
        return json(response, 400, { error: "Execution ID is required." });
      }
      return json(response, 200, { results: await rollbackExecution(body.executionId) });
    }

    if (request.method === "GET") {
      const requested = url.pathname === "/" ? "/index.html" : url.pathname;
      if (requested.includes("\0")) return json(response, 400, { error: "Bad request" });

      const filePath = path.resolve(publicDir, `.${requested}`);
      if (filePath !== publicDir && !filePath.startsWith(`${publicDir}${path.sep}`)) {
        return json(response, 403, { error: "Forbidden" });
      }

      try {
        const stat = await fs.stat(filePath);
        if (stat.isDirectory()) {
          const indexFile = path.join(filePath, "index.html");
          try {
            const indexStat = await fs.stat(indexFile);
            if (indexStat.isFile()) {
              const contents = await fs.readFile(indexFile);
              response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
              return response.end(contents);
            }
          } catch {}
          return json(response, 404, { error: "Not found" });
        }

        const contents = await fs.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const contentTypes: Record<string, string> = {
          ".html": "text/html; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".js": "application/javascript; charset=utf-8",
          ".json": "application/json; charset=utf-8",
          ".svg": "image/svg+xml",
          ".ico": "image/x-icon"
        };
        response.writeHead(200, { "content-type": contentTypes[ext] ?? "application/octet-stream" });
        return response.end(contents);
      } catch (err: any) {
        if (err?.code === "ENOENT") return json(response, 404, { error: "Not found" });
        return json(response, 500, { error: "Internal server error" });
      }
    }

    return json(response, 404, { error: "Not found" });
  } catch (error) {
    return json(response, 500, { error: error instanceof Error ? error.message : "Unexpected server error" });
  }
});

async function readBody(request: IncomingMessage): Promise<Record<string, any>> {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  if (raw.length > 100_000) throw new Error("Request too large.");
  return JSON.parse(raw || "{}") as Record<string, any>;
}

import { fileURLToPath } from "node:url";

const isMainModule = process.argv[1] && (
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) ||
  process.argv[1].endsWith("/server.js") ||
  process.argv[1].endsWith("/server.ts")
);

if (isMainModule && process.env.NODE_ENV !== "test") {
  server.listen(port, "0.0.0.0", () => console.log(`SlothDesk AI listening at http://0.0.0.0:${port}`));
}


