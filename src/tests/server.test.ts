import { createServer, Server } from "node:http";
import { strict as assert } from "node:assert";
import { test, before, after } from "node:test";
import { server } from "../server.js";

let testPort: number;
let baseUrl: string;

before(async () => {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "object" && address !== null) {
        testPort = address.port;
        baseUrl = `http://127.0.0.1:${testPort}`;
      }
      resolve();
    });
  });
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("server: GET /api/health returns 200 with model status", async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  const data = await res.json() as any;
  assert.equal(data.ok, true);
  assert.ok(data.model);
  assert.equal(typeof data.model.available, "boolean");
});

test("server: GET /api/executions returns 200 array", async () => {
  const res = await fetch(`${baseUrl}/api/executions`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data));
});

test("server: hosted mode rejects local workspace endpoints", async () => {
  process.env.HOSTED_MODE = "true";

  try {
    const cleanupRes = await fetch(`${baseUrl}/api/cleanup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: "/tmp" })
    });
    assert.equal(cleanupRes.status, 403);
    const cleanupData = await cleanupRes.json() as any;
    assert.match(cleanupData.error, /hosted mode accepts uploads only/i);

    const approveRes = await fetch(`${baseUrl}/api/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ executionId: "test-id", approvedIds: [] })
    });
    assert.equal(approveRes.status, 403);
    const approveData = await approveRes.json() as any;
    assert.match(approveData.error, /hosted mode accepts uploads only/i);

    const rollbackRes = await fetch(`${baseUrl}/api/rollback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ executionId: "test-id" })
    });
    assert.equal(rollbackRes.status, 403);
    const rollbackData = await rollbackRes.json() as any;
    assert.match(rollbackData.error, /hosted mode accepts uploads only/i);
  } finally {
    delete process.env.HOSTED_MODE;
  }
});

test("server: validation errors on local endpoints", async () => {
  delete process.env.HOSTED_MODE;

  const cRes = await fetch(`${baseUrl}/api/cleanup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  });
  assert.equal(cRes.status, 400);

  const aRes = await fetch(`${baseUrl}/api/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ executionId: "uuid", approvedIds: "not-an-array" })
  });
  assert.equal(aRes.status, 400);

  const rRes = await fetch(`${baseUrl}/api/rollback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  });
  assert.equal(rRes.status, 400);
});

test("server: static file serving and path traversal protection", async () => {
  const rootRes = await fetch(`${baseUrl}/`);
  assert.equal(rootRes.status, 200);
  assert.match(rootRes.headers.get("content-type") ?? "", /text\/html/);
  const rootText = await rootRes.text();
  assert.match(rootText, /SlothDesk/i);

  const cssRes = await fetch(`${baseUrl}/styles.css`);
  assert.equal(cssRes.status, 200);
  assert.match(cssRes.headers.get("content-type") ?? "", /text\/css/);

  const traversalRes = await fetch(`${baseUrl}/../package.json`);
  assert.ok(traversalRes.status === 403 || traversalRes.status === 404);

  const missingRes = await fetch(`${baseUrl}/missing-file.xyz`);
  assert.equal(missingRes.status, 404);
});
