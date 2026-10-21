import { createServer, Server } from "node:http";
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { OllamaProvider } from "../provider.js";

function createMockOllama(handler: (req: any, res: any) => void): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const s = createServer(handler);
    s.listen(0, "127.0.0.1", () => {
      const address = s.address() as any;
      resolve({ server: s, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

test("provider: health returns available=false when endpoint is unreachable", async () => {
  const provider = new OllamaProvider("http://127.0.0.1:9999", "gemma3:4b");
  const health = await provider.health();
  assert.equal(health.available, false);
  assert.match(health.message, /unavailable/i);
});

test("provider: health returns available=true when model is present", async () => {
  const { server, url } = await createMockOllama((req, res) => {
    if (req.url === "/api/tags") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ models: [{ name: "gemma3:4b" }] }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  try {
    const provider = new OllamaProvider(url, "gemma3:4b");
    const health = await provider.health();
    assert.equal(health.available, true);
    assert.equal(health.model, "gemma3:4b");
    assert.match(health.message, /ready/i);
  } finally {
    server.close();
  }
});

test("provider: analyze parses valid Ollama JSON response", async () => {
  const mockReport = {
    summary: "Sprint planning notes for release",
    facts: ["Sprint starts Monday", "4 engineers"],
    tasks: ["Set up CI pipeline", "Deploy staging"],
    decisions: ["Use Node 20 LTS"],
    deadlines: ["Friday 5pm"],
    category: "Actionable",
    suggestedName: "sprint-plan.md"
  };

  const { server, url } = await createMockOllama((req, res) => {
    if (req.url === "/api/tags") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ models: [{ name: "gemma3:4b" }] }));
      return;
    }
    if (req.url === "/api/generate" && req.method === "POST") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ response: JSON.stringify(mockReport) }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  try {
    const provider = new OllamaProvider(url, "gemma3:4b");
    const report = await provider.analyze("notes.txt", "Some text");
    assert.equal(report.provider, "ollama");
    assert.equal(report.summary, "Sprint planning notes for release");
    assert.deepEqual(report.tasks, ["Set up CI pipeline", "Deploy staging"]);
    assert.deepEqual(report.decisions, ["Use Node 20 LTS"]);
    assert.equal(report.category, "Actionable");
  } finally {
    server.close();
  }
});

test("provider: analyze falls back to deterministic extraction if model response is invalid", async () => {
  const { server, url } = await createMockOllama((req, res) => {
    if (req.url === "/api/tags") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ models: [{ name: "gemma3:4b" }] }));
      return;
    }
    if (req.url === "/api/generate") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ response: "NOT VALID JSON!" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  try {
    const provider = new OllamaProvider(url, "gemma3:4b");
    const report = await provider.analyze("task.txt", "TODO: complete adversarial pass\nDeadline: Friday");
    assert.equal(report.provider, "deterministic");
    assert.ok(report.tasks.length > 0);
  } finally {
    server.close();
  }
});
