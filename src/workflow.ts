import { promises as fs } from "node:fs";
import path from "node:path";
import { csvProfile, safeWorkspacePath, scanWorkspace } from "./core.js";
import { OllamaProvider } from "./provider.js";
import { appendJournal, getExecution, listJournal, saveExecution, updateJournal } from "./store.js";
import type { Execution, OperationJournalEntry, Proposal } from "./types.js";

function proposal(source: string, destination: string, reason: string): Proposal {
  return { id: crypto.randomUUID(), sourcePath: source, destinationPath: destination, reason, status: "pending" };
}

export async function runCleanup(workspace: string): Promise<Execution> {
  const started = Date.now();
  const records = await scanWorkspace(workspace);
  const provider = new OllamaProvider();
  const reports = [];
  const proposals: Proposal[] = [];
  const errors: string[] = [];
  for (const record of records) {
    if (record.type === "unsupported") continue;
    try {
      const text = await fs.readFile(record.path, "utf8");
      if (record.type === "csv") {
        const profile = csvProfile(text);
        reports.push({ source: record.relativePath, summary: `${profile.rowCount} rows, ${profile.headers.length} columns; ${profile.duplicateRows} duplicate rows.`, facts: profile.headers, tasks: [], decisions: [], deadlines: [], category: "Dataset", suggestedName: record.name, provider: "deterministic" as const });
      } else {
        reports.push(await provider.analyze(record.relativePath, text));
      }
      if (!record.duplicateOf && record.type !== "json") {
        const category = reports.at(-1)?.category ?? "Reference";
        proposals.push(proposal(record.path, safeWorkspacePath(workspace, path.join(category.toLowerCase().replace(/[^a-z0-9]+/g, "-"), record.name)), "Category suggested from document signals."));
      }
    } catch (error) {
      errors.push(`${record.relativePath}: ${error instanceof Error ? error.message : "Unable to process file"}`);
    }
  }
  for (const record of records.filter((item) => item.duplicateOf)) {
    proposals.push(proposal(record.path, record.path, `Duplicate of ${record.duplicateOf}; review before removal.`));
  }
  const automatedMinutes = (Date.now() - started) / 60_000;
  const execution: Execution = {
    id: crypto.randomUUID(), workspace: path.resolve(workspace), status: errors.length && !reports.length ? "failed" : "completed",
    startedAt: new Date(started).toISOString(), endedAt: new Date().toISOString(),
    filesProcessed: records.length, duplicates: records.filter((item) => item.duplicateOf).length,
    tasksExtracted: reports.reduce((sum, report) => sum + report.tasks.length, 0),
    proposals, reports, errors, manualMinutes: records.length * 6, automatedMinutes, reviewMinutes: proposals.length * 0.5,
    estimatedNetMinutesSaved: Math.max(0, records.length * 6 - automatedMinutes - proposals.length * 0.5)
  };
  await saveExecution(execution);
  return execution;
}

export async function approveOperations(execution: Execution, approvedIds: string[]) {
  const stored = await getExecution(execution.id);
  if (!stored) throw new Error("Execution was not found. Run the workflow again.");
  const approved = new Set(approvedIds);
  const results = [];
  for (const item of stored.proposals) {
    if (!approved.has(item.id) || item.status !== "pending" || item.destinationPath === item.sourcePath) continue;
    try {
      const workspace = stored.workspace;
      const source = safeWorkspacePath(workspace, path.relative(workspace, item.sourcePath));
      const destination = safeWorkspacePath(workspace, path.relative(workspace, item.destinationPath));
      const sourceRealPath = await fs.realpath(source);
      if (sourceRealPath !== source && !sourceRealPath.startsWith(`${workspace}${path.sep}`)) throw new Error("Source symlink escapes workspace.");
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.access(destination).then(() => { throw new Error("Destination already exists."); }).catch((error: unknown) => {
        if (error instanceof Error && error.message === "Destination already exists.") throw error;
      });
      await fs.rename(source, destination);
      item.status = "completed";
      const journalEntry: OperationJournalEntry = { id: crypto.randomUUID(), proposalId: item.id, executionId: stored.id, sourcePath: source, destinationPath: destination, completedAt: new Date().toISOString() };
      await appendJournal(journalEntry);
      results.push({ id: item.id, status: "completed" });
    } catch (error) {
      item.status = "failed";
      results.push({ id: item.id, status: "failed", error: error instanceof Error ? error.message : "Operation failed" });
    }
  }
  await saveExecution(stored);
  return results;
}

export async function rollbackExecution(executionId: string) {
  const execution = await getExecution(executionId);
  if (!execution) throw new Error("Execution was not found.");
  const journal = await listJournal();
  const results: Array<{ id: string; status: string; error?: string }> = [];
  for (const entry of journal.filter((item) => item.executionId === executionId && !item.rolledBackAt)) {
    try {
      await fs.access(entry.destinationPath);
      await fs.access(entry.sourcePath).then(() => { throw new Error("Original path is occupied."); }).catch((error: unknown) => {
        if (error instanceof Error && error.message === "Original path is occupied.") throw error;
      });
      await fs.rename(entry.destinationPath, entry.sourcePath);
      entry.rolledBackAt = new Date().toISOString();
      await updateJournal(entry);
      const proposal = execution.proposals.find((item) => item.id === entry.proposalId);
      if (proposal) proposal.status = "pending";
      results.push({ id: entry.id, status: "rolled_back" });
    } catch (error) {
      results.push({ id: entry.id, status: "failed", error: error instanceof Error ? error.message : "Rollback failed" });
    }
  }
  await saveExecution(execution);
  return results;
}
