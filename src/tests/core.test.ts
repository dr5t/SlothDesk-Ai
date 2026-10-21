import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { classifyFile, csvProfile, extractDeterministicSignals, safeWorkspacePath, scanWorkspace } from "../core.js";
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
  await mkdir(path.join(workspace, "nested"));
  await writeFile(path.join(workspace, "nested", "c.txt"), "nested");
  const records = await scanWorkspace(workspace);
  assert.equal(records.length, 3);
  assert.equal(records.filter((record) => record.duplicateOf).length, 1);
  assert.equal(records.some((record) => record.relativePath === path.join("nested", "c.txt")), true);
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
  if (!move) throw new Error("Expected proposal for notes.txt was not found");
  assert.ok(move);
  const result = await approveOperations(execution, [move.id]);
  assert.equal(result[0].status, "completed");
  assert.equal(await scanWorkspace(workspace).then((items) => items.some((item) => item.path === path.join(workspace, "notes.txt"))), false);
  const rollback = await rollbackExecution(execution.id);
  assert.equal(rollback[0].status, "rolled_back");
  assert.equal(await scanWorkspace(workspace).then((items) => items.some((item) => item.path === path.join(workspace, "notes.txt"))), true);
  await rm(workspace, { recursive: true, force: true });
});

test("extractDeterministicSignals returns source evidence with line numbers for tasks, decisions, and deadlines", () => {
  const content = [
    "# Sprint Backlog",
    "",
    "TODO: Implement source evidence extraction",
    "Decided on deterministic grounded citations",
    "Deadline: Friday before deployment",
    "Regular notes without signals"
  ].join("\n");

  const signals = extractDeterministicSignals(content);
  assert.equal(signals.tasks.length, 1);
  assert.equal(signals.decisions.length, 1);
  assert.equal(signals.deadlines.length, 1);
  assert.equal(signals.evidence.length, 3);

  assert.equal(signals.evidence[0].line, 3);
  assert.equal(signals.evidence[0].item, "TODO: Implement source evidence extraction");
  assert.ok(signals.evidence[0].excerpt.length > 0);

  assert.equal(signals.evidence[1].line, 4);
  assert.equal(signals.evidence[1].item, "Decided on deterministic grounded citations");

  assert.equal(signals.evidence[2].line, 5);
  assert.equal(signals.evidence[2].item, "Deadline: Friday before deployment");
});

test("extractDeterministicSignals handles empty documents and whitespace gracefully", () => {
  const emptySignals = extractDeterministicSignals("");
  assert.deepEqual(emptySignals.lines, []);
  assert.deepEqual(emptySignals.tasks, []);
  assert.deepEqual(emptySignals.decisions, []);
  assert.deepEqual(emptySignals.deadlines, []);
  assert.deepEqual(emptySignals.evidence, []);

  const whitespaceSignals = extractDeterministicSignals("   \n\t  \r\n   ");
  assert.deepEqual(whitespaceSignals.lines, []);
  assert.deepEqual(whitespaceSignals.tasks, []);
  assert.deepEqual(whitespaceSignals.decisions, []);
  assert.deepEqual(whitespaceSignals.deadlines, []);
  assert.deepEqual(whitespaceSignals.evidence, []);
});

test("extractDeterministicSignals handles malformed non-string inputs safely", () => {
  const nullSignals = extractDeterministicSignals(null as any);
  assert.deepEqual(nullSignals.tasks, []);
  assert.deepEqual(nullSignals.evidence, []);

  const undefinedSignals = extractDeterministicSignals(undefined as any);
  assert.deepEqual(undefinedSignals.tasks, []);
  assert.deepEqual(undefinedSignals.evidence, []);

  const numberSignals = extractDeterministicSignals(42 as any);
  assert.deepEqual(numberSignals.tasks, []);
  assert.deepEqual(numberSignals.evidence, []);
});

test("Smart Desk workflow links reports and proposals bidirectionally", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "slothdesk-link-"));
  await writeFile(path.join(workspace, "hacktoberfest.md"), "# Plan\nTODO: Submit slow and steady entry\nDeadline: Friday");
  const execution = await runCleanup(workspace);

  assert.equal(execution.reports.length, 1);
  const report = execution.reports[0];
  assert.ok(report);
  assert.equal(report.source, "hacktoberfest.md");
  assert.equal(report.provider, "deterministic");
  assert.ok(report.evidence && report.evidence.length > 0);
  assert.ok(typeof report.proposalId === "string");

  const proposal = execution.proposals.find((p) => p.id === report.proposalId);
  assert.ok(proposal);
  assert.equal(proposal.reportSource, "hacktoberfest.md");

  await rm(workspace, { recursive: true, force: true });
});
