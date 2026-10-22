import { strict as assert } from "node:assert";
import { test, before, after } from "node:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { runCleanup, approveOperations, rollbackExecution } from "../workflow.js";
import { getExecution, listJournal } from "../store.js";
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

test("review: proposal status transitions through pending -> completed -> rolled_back", async () => {
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), "review-status-"));
  process.env.DATA_DIR = path.join(ws, ".data");
  try {
    const file = path.join(ws, "agenda.md");
    await fs.writeFile(file, "# Agenda\nTODO: review quarterly roadmap\n");

    const execution = await runCleanup(ws);
    const proposal = execution.proposals.find((p) => p.sourcePath === file);
    assert.ok(proposal);
    assert.equal(proposal.status, "pending");
    assert.equal(proposal.operationType, "categorize_move");
    assert.equal(proposal.provider, "deterministic");

    const approveResults = await approveOperations(execution, [proposal.id]);
    assert.equal(approveResults.length, 1);
    assert.equal(approveResults[0].status, "completed");

    const updatedExec = await getExecution(execution.id);
    assert.ok(updatedExec);
    const updatedProposal = updatedExec.proposals.find((p) => p.id === proposal.id);
    assert.ok(updatedProposal);
    assert.equal(updatedProposal.status, "completed");

    const origExistsAfterMove = await fs.stat(file).then(() => true, () => false);
    assert.equal(origExistsAfterMove, false);

    const rollbackResults = await rollbackExecution(execution.id);
    assert.equal(rollbackResults.length, 1);
    assert.equal(rollbackResults[0].status, "rolled_back");

    const rolledBackExec = await getExecution(execution.id);
    assert.ok(rolledBackExec);
    const rolledBackProposal = rolledBackExec.proposals.find((p) => p.id === proposal.id);
    assert.ok(rolledBackProposal);
    assert.equal(rolledBackProposal.status, "rolled_back");

    const origRestored = await fs.stat(file).then(() => true, () => false);
    assert.equal(origRestored, true);
  } finally {
    await fs.rm(ws, { recursive: true, force: true });
  }
});

test("review: failed operation transitions proposal status to failed with recorded warning", async () => {
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), "review-fail-"));
  process.env.DATA_DIR = path.join(ws, ".data");
  try {
    const file = path.join(ws, "notes.txt");
    await fs.writeFile(file, "TODO: test failure state");

    const execution = await runCleanup(ws);
    const proposal = execution.proposals[0];
    assert.ok(proposal);

    await fs.mkdir(path.dirname(proposal.destinationPath), { recursive: true });
    await fs.writeFile(proposal.destinationPath, "blocking file");

    const results = await approveOperations(execution, [proposal.id]);
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "failed");
    assert.match(results[0].error ?? "", /already exists/i);

    const reloaded = await getExecution(execution.id);
    assert.ok(reloaded);
    const reloadedProposal = reloaded.proposals.find((p) => p.id === proposal.id);
    assert.ok(reloadedProposal);
    assert.equal(reloadedProposal.status, "failed");
    assert.ok(reloadedProposal.warning);
    assert.match(reloadedProposal.warning, /already exists/i);
  } finally {
    await fs.rm(ws, { recursive: true, force: true });
  }
});

test("review: invalid selections with forged or duplicate-review IDs are safely ignored", async () => {
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), "review-invalid-"));
  process.env.DATA_DIR = path.join(ws, ".data");
  try {
    const content = "duplicate content for test";
    await fs.writeFile(path.join(ws, "orig.txt"), content);
    await fs.writeFile(path.join(ws, "dup.txt"), content);

    const execution = await runCleanup(ws);
    const dupProposal = execution.proposals.find((p) => p.operationType === "duplicate_review");
    assert.ok(dupProposal);
    assert.equal(dupProposal.operationType, "duplicate_review");
    assert.equal(dupProposal.sourcePath, dupProposal.destinationPath);

    const dupApprove = await approveOperations(execution, [dupProposal.id]);
    assert.equal(dupApprove.length, 0);

    const forgedApprove = await approveOperations(execution, ["forged-uuid-1234"]);
    assert.equal(forgedApprove.length, 0);

    const emptyApprove = await approveOperations(execution, []);
    assert.equal(emptyApprove.length, 0);

    const dupFileExists = await fs.stat(dupProposal.sourcePath).then(() => true, () => false);
    assert.equal(dupFileExists, true);
  } finally {
    await fs.rm(ws, { recursive: true, force: true });
  }
});

test("review: repeated approvals for already completed proposals do not re-execute", async () => {
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), "review-repeat-"));
  process.env.DATA_DIR = path.join(ws, ".data");
  try {
    const file = path.join(ws, "test.md");
    await fs.writeFile(file, "# Testing repeated approval\nTODO: verify replay\n");

    const execution = await runCleanup(ws);
    const proposal = execution.proposals[0];
    assert.ok(proposal);

    const firstRun = await approveOperations(execution, [proposal.id]);
    assert.equal(firstRun.length, 1);
    assert.equal(firstRun[0].status, "completed");

    const secondRun = await approveOperations(execution, [proposal.id]);
    assert.equal(secondRun.length, 0);

    const finalExec = await getExecution(execution.id);
    assert.ok(finalExec);
    assert.equal(finalExec.proposals[0].status, "completed");
  } finally {
    await fs.rm(ws, { recursive: true, force: true });
  }
});

test("review: rolled back proposal can be re-approved cleanly", async () => {
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), "review-reapprove-"));
  process.env.DATA_DIR = path.join(ws, ".data");
  try {
    const file = path.join(ws, "doc.txt");
    await fs.writeFile(file, "TODO: test re-approval after rollback");

    const execution = await runCleanup(ws);
    const proposal = execution.proposals[0];
    assert.ok(proposal);

    const r1 = await approveOperations(execution, [proposal.id]);
    assert.equal(r1[0].status, "completed");

    const r2 = await rollbackExecution(execution.id);
    assert.equal(r2[0].status, "rolled_back");

    const r3 = await approveOperations(execution, [proposal.id]);
    assert.equal(r3.length, 1);
    assert.equal(r3[0].status, "completed");

    const finalExec = await getExecution(execution.id);
    assert.ok(finalExec);
    assert.equal(finalExec.proposals[0].status, "completed");
  } finally {
    await fs.rm(ws, { recursive: true, force: true });
  }
});

test("review API: server-authoritative approval rejects invalid bodies and client paths", async () => {
  const res1 = await fetch(`${baseUrl}/api/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  });
  assert.equal(res1.status, 400);

  const res2 = await fetch(`${baseUrl}/api/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ executionId: "uuid", approvedIds: "invalid-type" })
  });
  assert.equal(res2.status, 400);

  const res3 = await fetch(`${baseUrl}/api/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ executionId: "non-existent-id", approvedIds: [] })
  });
  assert.equal(res3.status, 404);
});
