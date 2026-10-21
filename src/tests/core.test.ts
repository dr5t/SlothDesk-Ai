import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { classifyFile, csvProfile, safeWorkspacePath, scanWorkspace } from "../core.js";
import { approveOperations, rollbackExecution, runCleanup } from "../workflow.js";
import { rm } from "node:fs/promises";

test("classifies supported file types", () => {
  assert.equal(classifyFile("notes.MD"), "markdown");
  assert.equal(classifyFile("binary.exe"), "unsupported");
});

test("rejects paths outside a workspace", () => {
  assert.throws(() => safeWorkspacePath("/tmp/workspace", "../secret"), /outside/);
});

test("scans files and detects cryptographic duplicates", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "slothdesk-"));
  await writeFile(path.join(workspace, "a.txt"), "same");
  await writeFile(path.join(workspace, "b.txt"), "same");
  const records = await scanWorkspace(workspace);
  assert.equal(records.length, 2);
  assert.equal(records.filter((record) => record.duplicateOf).length, 1);
});

test("profiles CSV data without a model", () => {
  const profile = csvProfile("name,score\nA,4\nB,\nB,");
  assert.deepEqual(profile.headers, ["name", "score"]);
  assert.equal(profile.rowCount, 3);
  assert.equal(profile.duplicateRows, 1);
  assert.equal(profile.missing[1].missing, 2);
});

test("approved moves are journaled and can be rolled back", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "slothdesk-"));
  await writeFile(path.join(workspace, "notes.txt"), "TODO: review the launch plan");
  const execution = await runCleanup(workspace);
  const move = execution.proposals.find((item) => item.sourcePath.endsWith("notes.txt"));
  assert.ok(move);
  const result = await approveOperations(execution, [move.id]);
  assert.equal(result[0].status, "completed");
  assert.equal(await scanWorkspace(workspace).then((items) => items.some((item) => item.name === "notes.txt")), false);
  const rollback = await rollbackExecution(execution.id);
  assert.equal(rollback[0].status, "rolled_back");
  assert.equal(await scanWorkspace(workspace).then((items) => items.some((item) => item.name === "notes.txt")), true);
  await rm(workspace, { recursive: true, force: true });
});
