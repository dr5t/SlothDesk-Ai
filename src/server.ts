import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { approveOperations, rollbackExecution, runCleanup } from "./workflow.js";
import { getExecution, listExecutions, listJournal } from "./store.js";
import { defaultProvider } from "./provider.js";
import { AVAILABLE_RECIPES, runRecipe } from "./recipes.js";
import { computeExecutionMetrics, serializeExecutionToJson, serializeExecutionToMarkdown } from "./reports.js";

const port = Number(process.env.PORT ?? 3147);
const publicDir = path.resolve("public");

export const json = (response: ServerResponse, status: number, value: unknown) => {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
};

export const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if ((request.method === "GET" || request.method === "POST") && (url.pathname === "/api/health" || url.pathname === "/api/provider")) {
      const health = await defaultProvider.health();
      if (!health.lastUsedProvider) {
        const executions = await listExecutions();
        const latest = executions[0];
        if (latest && latest.reports && latest.reports.length > 0) {
          const hasOllama = latest.reports.some((r) => r.provider === "ollama");
          health.lastUsedProvider = hasOllama ? "ollama" : "deterministic";
          if (hasOllama) health.inferenceVerified = true;
          health.lastInferenceAt = latest.endedAt;
        }
      }
      return json(response, 200, { ok: true, model: health });
    }

    if (request.method === "GET" && url.pathname === "/api/executions") {
      return json(response, 200, await listExecutions());
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/executions/")) {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length === 3 && parts[1] === "executions") {
        const id = decodeURIComponent(parts[2]);
        const execution = await getExecution(id);
        if (!execution) return json(response, 404, { error: "Execution was not found." });
        const journal = await listJournal();
        const metrics = computeExecutionMetrics(execution, journal);
        return json(response, 200, { execution, metrics });
      }
      if (parts.length === 4 && parts[1] === "executions" && parts[3] === "export") {
        const id = decodeURIComponent(parts[2]);
        const execution = await getExecution(id);
        if (!execution) return json(response, 404, { error: "Execution was not found." });
        const journal = await listJournal();
        const format = (url.searchParams.get("format") || "markdown").toLowerCase();
        const sanitizePaths = url.searchParams.get("sanitize") !== "false";
        if (format === "json") {
          const serialized = serializeExecutionToJson(execution, { sanitizePaths, journal });
          response.writeHead(200, {
            "content-type": "application/json; charset=utf-8",
            "content-disposition": `attachment; filename="slothdesk-execution-${id.slice(0, 8)}.json"`
          });
          return response.end(serialized);
        }
        const serialized = serializeExecutionToMarkdown(execution, { sanitizePaths, journal });
        response.writeHead(200, {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": `attachment; filename="slothdesk-execution-${id.slice(0, 8)}.md"`
        });
        return response.end(serialized);
      }
    }

    if (request.method === "GET" && url.pathname === "/api/recipes") {
      return json(response, 200, AVAILABLE_RECIPES);
    }

    if (request.method === "POST" && url.pathname === "/api/recipes/run") {
      if (process.env.HOSTED_MODE === "true") {
        return json(response, 403, { error: "Hosted mode accepts uploads only; local workspace access is disabled." });
      }
      const body = await readBody(request);
      if (typeof body.recipeId !== "string" || !body.recipeId.trim()) {
        return json(response, 400, { error: "A recipe ID is required." });
      }
      if (!AVAILABLE_RECIPES.some((r) => r.id === body.recipeId)) {
        return json(response, 400, { error: `Unknown recipe: ${body.recipeId}.` });
      }
      if (typeof body.workspace !== "string" || !body.workspace.trim()) {
        return json(response, 400, { error: "A workspace path is required." });
      }
      const result = await runRecipe(body.recipeId, body.workspace);
      return json(response, 200, result);
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


