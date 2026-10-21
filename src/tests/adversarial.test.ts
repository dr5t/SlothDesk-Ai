import { mkdir, mkdtemp, writeFile, symlink, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { safeWorkspacePath, scanWorkspace, hashFile } from "../core.js";
import { approveOperations, rollbackExecution, runCleanup } from "../workflow.js";
import { getExecution, listExecutions, listJournal, saveExecution, appendJournal } from "../store.js";

test("adversarial: safeWorkspacePath rejects traversal and escaping candidates", () => {
  const ws = "/tmp/demo-workspace";
  assert.throws(() => safeWorkspacePath(ws, "../outside"), /outside/);
  assert.throws(() => safeWorkspacePath(ws, "../../etc/passwd"), /outside/);
  assert.throws(() => safeWorkspacePath(ws, "/etc/passwd"), /outside/);
  assert.throws(() => safeWorkspacePath(ws, "/tmp/demo-workspace-adjacent/secret.txt"), /outside/);
  assert.equal(safeWorkspacePath(ws, "sub/file.txt"), path.resolve(ws, "sub/file.txt"));
});

test("adversarial: symlink pointing outside workspace is rejected during approval", async () => {
  const ws = await mkdtemp(path.join(tmpdir(), "slothdesk-adv-ws-"));
  const outside = await mkdtemp(path.join(tmpdir(), "slothdesk-adv-out-"));
  const secretFile = path.join(outside, "secret.txt");
  await writeFile(secretFile, "confidential data");

  const escapeSymlink = path.join(ws, "escaped.txt");
  await symlink(secretFile, escapeSymlink);

  const execution = await runCleanup(ws);
  const escapeProposal = execution.proposals.find(p => p.sourcePath === escapeSymlink);
  if (escapeProposal) {
    const results = await approveOperations(execution, [escapeProposal.id]);
    assert.equal(results[0].status, "failed");
    assert.match(results[0].error ?? "", /escapes workspace/i);
  }

  await rm(ws, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

test("adversarial: rollback cannot overwrite a file created at original path after operation", async () => {
  const ws = await mkdtemp(path.join(tmpdir(), "slothdesk-rb-"));
  process.env.DATA_DIR = path.join(ws, ".data");
  const notesPath = path.join(ws, "notes.txt");
  await writeFile(notesPath, "TODO: original task");

  const execution = await runCleanup(ws);
  const move = execution.proposals.find(p => p.sourcePath === notesPath);
  assert.ok(move);
  const approveRes = await approveOperations(execution, [move.id]);
  assert.equal(approveRes[0].status, "completed");

  await writeFile(notesPath, "Brand new important file created after move!");

  const rollbackRes = await rollbackExecution(execution.id);
  assert.equal(rollbackRes[0].status, "failed");
  assert.match(rollbackRes[0].error ?? "", /occupied/i);

  const content = await readFile(notesPath, "utf8");
  assert.equal(content, "Brand new important file created after move!");

  await rm(ws, { recursive: true, force: true });
});

test("adversarial: rollback cannot overwrite when destination file was modified after move", async () => {
  const ws = await mkdtemp(path.join(tmpdir(), "slothdesk-mod-"));
  process.env.DATA_DIR = path.join(ws, ".data");
  const notesPath = path.join(ws, "notes.txt");
  await writeFile(notesPath, "TODO: review architecture");

  const execution = await runCleanup(ws);
  const move = execution.proposals.find(p => p.sourcePath === notesPath);
  assert.ok(move);
  const approveRes = await approveOperations(execution, [move.id]);
  assert.equal(approveRes[0].status, "completed");

  const destPath = move.destinationPath;
  await writeFile(destPath, "MODIFIED CONTENT after move!");

  const rollbackRes = await rollbackExecution(execution.id);
  assert.equal(rollbackRes[0].status, "failed");
  assert.match(rollbackRes[0].error ?? "", /modified/i);

  await rm(ws, { recursive: true, force: true });
});

test("adversarial: server-authoritative approval rejects forged or reused IDs", async () => {
  const ws = await mkdtemp(path.join(tmpdir(), "slothdesk-auth-"));
  process.env.DATA_DIR = path.join(ws, ".data");
  const file1 = path.join(ws, "task.txt");
  await writeFile(file1, "TODO: authentic task");

  const execution = await runCleanup(ws);
  const move = execution.proposals[0];
  assert.ok(move);

  await assert.rejects(
    () => approveOperations({ ...execution, id: "forged-uuid" }, [move.id]),
    /not found/i
  );

  const fakeResults = await approveOperations(execution, ["forged-proposal-id"]);
  assert.equal(fakeResults.length, 0);

  const realResults = await approveOperations(execution, [move.id]);
  assert.equal(realResults[0].status, "completed");

  const replayResults = await approveOperations(execution, [move.id]);
  assert.equal(replayResults.length, 0);

  await rm(ws, { recursive: true, force: true });
});

test("adversarial: filename collisions in subdirectories do not overwrite each other", async () => {
  const ws = await mkdtemp(path.join(tmpdir(), "slothdesk-collision-"));
  process.env.DATA_DIR = path.join(ws, ".data");
  const subA = path.join(ws, "subA");
  const subB = path.join(ws, "subB");
  await mkdir(subA);
  await mkdir(subB);

  await writeFile(path.join(subA, "notes.txt"), "TODO: sub A task");
  await writeFile(path.join(subB, "notes.txt"), "TODO: sub B task");

  const execution = await runCleanup(ws);
  assert.equal(execution.proposals.length, 2);

  const dests = execution.proposals.map(p => p.destinationPath);
  assert.notEqual(dests[0], dests[1], "Proposed destinations must not collide");

  const approveRes = await approveOperations(execution, execution.proposals.map(p => p.id));
  assert.equal(approveRes[0].status, "completed");
  assert.equal(approveRes[1].status, "completed");

  await rm(ws, { recursive: true, force: true });
});

test("adversarial: broken symlink at destination prevents overwriting", async () => {
  const ws = await mkdtemp(path.join(tmpdir(), "slothdesk-brokensym-"));
  process.env.DATA_DIR = path.join(ws, ".data");
  const file = path.join(ws, "notes.txt");
  await writeFile(file, "TODO: important task");

  const execution = await runCleanup(ws);
  const move = execution.proposals[0];
  assert.ok(move);

  await mkdir(path.dirname(move.destinationPath), { recursive: true });
  await symlink("/nonexistent/file/path", move.destinationPath);

  const results = await approveOperations(execution, [move.id]);
  assert.equal(results[0].status, "failed");
  assert.match(results[0].error ?? "", /Destination already exists/i);

  await rm(ws, { recursive: true, force: true });
});

test("adversarial: partial move failure leaves valid operations intact and rollback targets only completed", async () => {
  const ws = await mkdtemp(path.join(tmpdir(), "slothdesk-partial-"));
  process.env.DATA_DIR = path.join(ws, ".data");
  const file1 = path.join(ws, "file1.txt");
  const file2 = path.join(ws, "file2.txt");
  await writeFile(file1, "TODO: keep file 1");
  await writeFile(file2, "TODO: keep file 2");

  const execution = await runCleanup(ws);
  assert.equal(execution.proposals.length, 2);

  await rm(file2);

  const results = await approveOperations(execution, execution.proposals.map(p => p.id));
  const r1 = results.find(r => r.id === execution.proposals[0].id);
  const r2 = results.find(r => r.id === execution.proposals[1].id);
  assert.equal(r1?.status, "completed");
  assert.equal(r2?.status, "failed");

  const rollbackRes = await rollbackExecution(execution.id);
  assert.equal(rollbackRes.length, 1);
  assert.equal(rollbackRes[0].status, "rolled_back");

  await rm(ws, { recursive: true, force: true });
});

test("adversarial: persistence and operation journals remain consistent across restart", async () => {
  const ws = await mkdtemp(path.join(tmpdir(), "slothdesk-restart-"));
  process.env.DATA_DIR = path.join(ws, ".data");
  const file = path.join(ws, "restart.txt");
  await writeFile(file, "TODO: test persistence restart");

  const execution = await runCleanup(ws);
  const move = execution.proposals[0];
  const approveRes = await approveOperations(execution, [move.id]);
  assert.equal(approveRes[0].status, "completed");

  const loadedExecutions = await listExecutions();
  const loadedJournal = await listJournal();

  assert.equal(loadedExecutions.length, 1);
  assert.equal(loadedExecutions[0].id, execution.id);
  assert.equal(loadedExecutions[0].proposals[0].status, "completed");

  assert.equal(loadedJournal.length, 1);
  assert.equal(loadedJournal[0].executionId, execution.id);
  assert.ok(loadedJournal[0].fileHash, "fileHash must be persisted in journal");

  const rollbackRes = await rollbackExecution(execution.id);
  assert.equal(rollbackRes[0].status, "rolled_back");

  const postRollbackJournal = await listJournal();
  assert.ok(postRollbackJournal[0].rolledBackAt, "rolledBackAt must be persisted in journal");

  await rm(ws, { recursive: true, force: true });
});

test("adversarial: MAX_FILE_BYTES skips files larger than threshold", async () => {
  const ws = await mkdtemp(path.join(tmpdir(), "slothdesk-size-"));
  process.env.MAX_FILE_BYTES = "50";

  const small = path.join(ws, "small.txt");
  const large = path.join(ws, "large.txt");
  await writeFile(small, "TODO: small file");
  await writeFile(large, "TODO: ".padEnd(100, "X"));

  const execution = await runCleanup(ws);
  const scannedPaths = execution.reports.map(r => r.source);
  assert.ok(scannedPaths.includes("small.txt"));
  assert.ok(!scannedPaths.includes("large.txt"), "Large file must be skipped");

  delete process.env.MAX_FILE_BYTES;
  await rm(ws, { recursive: true, force: true });
});
