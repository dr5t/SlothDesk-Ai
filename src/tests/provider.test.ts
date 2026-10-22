import { createServer, Server } from "node:http";
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { OllamaProvider, sanitizeProviderError } from "../provider.js";

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

test("provider: health returns connected=true but available=false when configured model is not installed", async () => {
  const { server, url } = await createMockOllama((req, res) => {
    if (req.url === "/api/tags") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ models: [{ name: "llama3:8b" }] }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  try {
    const provider = new OllamaProvider(url, "gemma3:4b");
    const health = await provider.health();
    assert.equal(health.connected, true);
    assert.equal(health.installed, false);
    assert.equal(health.available, false);
    assert.equal(health.inferenceVerified, false);
    assert.match(health.message, /not installed/i);
  } finally {
    server.close();
  }
});

test("provider: inferenceVerified is false on standby and becomes true after successful analysis", async () => {
  const mockReport = {
    summary: "Sprint plan",
    facts: ["Fact 1"],
    tasks: ["Task 1"],
    decisions: ["Decision 1"],
    deadlines: ["Deadline 1"],
    category: "Actionable",
    suggestedName: "plan.md"
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
    const initialHealth = await provider.health();
    assert.equal(initialHealth.available, true);
    assert.equal(initialHealth.inferenceVerified, false);

    const report = await provider.analyze("file.md", "content");
    assert.equal(report.provider, "ollama");

    const postHealth = await provider.health();
    assert.equal(postHealth.inferenceVerified, true);
    assert.equal(postHealth.lastUsedProvider, "ollama");
    assert.ok(postHealth.lastInferenceAt);
  } finally {
    server.close();
  }
});

test("provider: unavailable daemon records sanitized error and uses deterministic fallback", async () => {
  const provider = new OllamaProvider("http://127.0.0.1:9998", "gemma3:4b");
  const report = await provider.analyze("doc.txt", "TODO: urgent item\nDeadline: tomorrow");
  assert.equal(report.provider, "deterministic");
  const health = await provider.health();
  assert.equal(health.available, false);
  assert.equal(health.connected, false);
  assert.equal(health.inferenceVerified, false);
  assert.equal(health.lastUsedProvider, "deterministic");
  assert.ok(health.lastError);
  assert.equal(health.lastError.includes("/Users/"), false);
  assert.equal(health.lastError.includes("\n"), false);
});

test("provider: sanitizeProviderError redacts local paths and secrets without stack traces", () => {
  const dirty = "Error: open /Users/shauryatiwari/secret/db.sqlite failed\n    at Object.open (node:fs:123)\n    at init (server.js:45)";
  const clean = sanitizeProviderError(dirty);
  assert.equal(clean.includes("/Users/"), false);
  assert.equal(clean.includes("\n"), false);
  assert.equal(clean.includes("at Object.open"), false);
  assert.match(clean, /\[path\]/);

  const secretError = "Error: connection failed with token=secret12345&key=mykey";
  const cleanSecret = sanitizeProviderError(secretError);
  assert.equal(cleanSecret.includes("secret12345"), false);
  assert.equal(cleanSecret.includes("mykey"), false);
});

test("provider: analyze on empty document directly returns fallbackReport without model call", async () => {
  const provider = new OllamaProvider("http://127.0.0.1:9999", "gemma3:4b");
  const report = await provider.analyze("empty.txt", "");
  assert.equal(report.provider, "deterministic");
  assert.equal(report.summary, "No extractable text was found.");
  assert.deepEqual(report.tasks, []);
  assert.deepEqual(report.decisions, []);
  assert.deepEqual(report.deadlines, []);
  assert.deepEqual(report.evidence, []);
});

test("provider: grounded source evidence matches lines in analyzed text", async () => {
  const provider = new OllamaProvider("http://127.0.0.1:9999", "gemma3:4b");
  const text = "Intro line\nTODO: write tests for Hacktoberfest\nDecided on local first\nDone";
  const report = await provider.analyze("notes.md", text);
  assert.equal(report.provider, "deterministic");
  assert.ok(report.evidence && report.evidence.length >= 2);
  const taskEvidence = report.evidence.find((e) => e.item.includes("TODO"));
  assert.ok(taskEvidence);
  assert.equal(taskEvidence.line, 2);
});

test("provider: health recognizes normalized model tags and registry prefixes", async () => {
  const { server, url } = await createMockOllama((req, res) => {
    if (req.url === "/api/tags") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ models: [{ name: "registry.ollama.ai/library/gemma3:4b" }] }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  try {
    const provider = new OllamaProvider(url, "gemma3:4b");
    const health = await provider.health();
    assert.equal(health.connected, true);
    assert.equal(health.installed, true);
    assert.equal(health.available, true);
    assert.equal(health.inferenceVerified, false);
    assert.match(health.message, /ready/i);
  } finally {
    server.close();
  }
});

test("provider: analyze times out when model inference exceeds timeoutMs and falls back to deterministic", async () => {
  const { server, url } = await createMockOllama((req, res) => {
    if (req.url === "/api/tags") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ models: [{ name: "gemma3:4b" }] }));
      return;
    }
    if (req.url === "/api/generate" && req.method === "POST") {
      setTimeout(() => {
        if (!res.writableEnded) {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ response: "{}" }));
        }
      }, 300);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  try {
    const provider = new OllamaProvider(url, "gemma3:4b", 50);
    const report = await provider.analyze("task.txt", "TODO: complete adversarial pass\nDeadline: Friday");
    assert.equal(report.provider, "deterministic");
    assert.ok(report.tasks.length > 0);
    const health = await provider.health();
    assert.equal(health.lastUsedProvider, "deterministic");
    assert.equal(health.inferenceVerified, false);
    assert.ok(health.lastError);
  } finally {
    server.close();
  }
});

test("provider: analyze falls back to deterministic extraction when Ollama returns HTTP 500", async () => {
  const { server, url } = await createMockOllama((req, res) => {
    if (req.url === "/api/tags") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ models: [{ name: "gemma3:4b" }] }));
      return;
    }
    if (req.url === "/api/generate" && req.method === "POST") {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "model out of memory" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  try {
    const provider = new OllamaProvider(url, "gemma3:4b");
    const report = await provider.analyze("task.txt", "TODO: handle server error\nDeadline: tomorrow");
    assert.equal(report.provider, "deterministic");
    assert.ok(report.tasks.length > 0);
    const health = await provider.health();
    assert.equal(health.lastUsedProvider, "deterministic");
    assert.equal(health.inferenceVerified, false);
    assert.match(health.lastError ?? "", /500/);
  } finally {
    server.close();
  }
});

test("provider: analyze falls back to deterministic extraction when schema validation fails", async () => {
  const { server, url } = await createMockOllama((req, res) => {
    if (req.url === "/api/tags") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ models: [{ name: "gemma3:4b" }] }));
      return;
    }
    if (req.url === "/api/generate" && req.method === "POST") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ response: JSON.stringify({ facts: ["only facts"] }) }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  try {
    const provider = new OllamaProvider(url, "gemma3:4b");
    const report = await provider.analyze("task.txt", "TODO: verify schema validation\nDeadline: next week");
    assert.equal(report.provider, "deterministic");
    assert.ok(report.tasks.length > 0);
    const health = await provider.health();
    assert.equal(health.lastUsedProvider, "deterministic");
    assert.equal(health.inferenceVerified, false);
    assert.match(health.lastError ?? "", /Invalid model schema/);
  } finally {
    server.close();
  }
});

test("provider: timeoutMs respects OLLAMA_TIMEOUT_MS environment variable within safe bounds", async () => {
  const origEnv = process.env.OLLAMA_TIMEOUT_MS;
  try {
    process.env.OLLAMA_TIMEOUT_MS = "45000";
    const provider = new OllamaProvider("http://127.0.0.1:9999", "gemma3:4b");
    assert.equal((provider as any).timeoutMs, 45000);

    process.env.OLLAMA_TIMEOUT_MS = "-100";
    const providerUnderflow = new OllamaProvider("http://127.0.0.1:9999", "gemma3:4b");
    assert.equal((providerUnderflow as any).timeoutMs, 60000);

    process.env.OLLAMA_TIMEOUT_MS = "999999999";
    const providerOverflow = new OllamaProvider("http://127.0.0.1:9999", "gemma3:4b");
    assert.equal((providerOverflow as any).timeoutMs, 60000);
  } finally {
    if (origEnv !== undefined) {
      process.env.OLLAMA_TIMEOUT_MS = origEnv;
    } else {
      delete process.env.OLLAMA_TIMEOUT_MS;
    }
  }
});
