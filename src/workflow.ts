import { promises as fs } from "node:fs";
import path from "node:path";
import { csvProfile, hashFile, safeWorkspacePath, scanWorkspace } from "./core.js";
import { defaultProvider, type ModelProvider } from "./provider.js";
import { appendJournal, getExecution, listJournal, saveExecution, updateJournal } from "./store.js";
import type { Execution, OperationJournalEntry, Proposal } from "./types.js";

function proposal(source: string, destination: string, reason: string): Proposal {
  return { id: crypto.randomUUID(), sourcePath: source, destinationPath: destination, reason, status: "pending" };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.lstat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function runCleanup(workspace: string, provider: ModelProvider = defaultProvider): Promise<Execution> {
  const started = Date.now();
  const maxBytes = Number(process.env.MAX_FILE_BYTES) || 1_048_576;
  const records = await scanWorkspace(workspace, maxBytes);
  const reports = [];
  const proposals: Proposal[] = [];
  const errors: string[] = [];
  const usedDestinations = new Set<string>();

  for (const record of records) {
    if (record.type === "unsupported") continue;
    try {
      const text = await fs.readFile(record.path, "utf8");
      if (record.type === "csv") {
        const profile = csvProfile(text);
        reports.push({
          source: record.relativePath,
          summary: `${profile.rowCount} rows, ${profile.headers.length} columns; ${profile.duplicateRows} duplicate rows.`,
          facts: profile.headers,
          tasks: [],
          decisions: [],
          deadlines: [],
          category: "Dataset",
          suggestedName: record.name,
          provider: "deterministic" as const
        });
      } else {
        reports.push(await provider.analyze(record.relativePath, text));
      }

      if (!record.duplicateOf && record.type !== "json") {
        const category = reports.at(-1)?.category ?? "Reference";
        const cleanCategory = category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "reference";
        const ext = path.extname(record.name);
        const base = path.basename(record.name, ext);

        let destRelative = path.join(cleanCategory, record.name);
        let candidateDest = safeWorkspacePath(workspace, destRelative);
        let counter = 1;

        while (usedDestinations.has(candidateDest) || (candidateDest !== record.path && (await pathExists(candidateDest)))) {
          destRelative = path.join(cleanCategory, `${base}-${counter}${ext}`);
          candidateDest = safeWorkspacePath(workspace, destRelative);
          counter++;
        }

        usedDestinations.add(candidateDest);
        proposals.push(proposal(record.path, candidateDest, "Category suggested from document signals."));
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
    id: crypto.randomUUID(),
    workspace: path.resolve(workspace),
    status: errors.length && !reports.length ? "failed" : "completed",
    startedAt: new Date(started).toISOString(),
    endedAt: new Date().toISOString(),
    filesProcessed: records.length,
    duplicates: records.filter((item) => item.duplicateOf).length,
    tasksExtracted: reports.reduce((sum, report) => sum + report.tasks.length, 0),
    proposals,
    reports,
    errors,
    manualMinutes: records.length * 6,
    automatedMinutes,
    reviewMinutes: proposals.length * 0.5,
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
      const realWorkspace = await fs.realpath(workspace);
      const sourceRealPath = await fs.realpath(source);

      if (!sourceRealPath.startsWith(`${realWorkspace}${path.sep}`)) {
        throw new Error("Source symlink escapes workspace.");
      }

      await fs.mkdir(path.dirname(destination), { recursive: true });
      const destinationParent = await fs.realpath(path.dirname(destination));
      if (!destinationParent.startsWith(`${realWorkspace}${path.sep}`) && destinationParent !== realWorkspace) {
        throw new Error("Destination path escapes workspace.");
      }

      if (await pathExists(destination)) {
        throw new Error("Destination already exists.");
      }

      const fileHash = await hashFile(source);
      await fs.rename(source, destination);

      item.status = "completed";
      const journalEntry: OperationJournalEntry = {
        id: crypto.randomUUID(),
        proposalId: item.id,
        executionId: stored.id,
        sourcePath: source,
        destinationPath: destination,
        fileHash,
        completedAt: new Date().toISOString()
      };
      await appendJournal(journalEntry);
      await saveExecution(stored);
      results.push({ id: item.id, status: "completed" });
    } catch (error) {
      item.status = "failed";
      await saveExecution(stored);
      results.push({ id: item.id, status: "failed", error: error instanceof Error ? error.message : "Operation failed" });
    }
  }

  return results;
}

export async function rollbackExecution(executionId: string) {
  const execution = await getExecution(executionId);
  if (!execution) throw new Error("Execution was not found.");
  const journal = await listJournal();
  const results: Array<{ id: string; status: string; error?: string }> = [];
  const realWorkspace = await fs.realpath(execution.workspace);

  for (const entry of journal.filter((item) => item.executionId === executionId && !item.rolledBackAt)) {
    try {
      const workspace = execution.workspace;
      const source = safeWorkspacePath(workspace, path.relative(workspace, entry.sourcePath));
      const destination = safeWorkspacePath(workspace, path.relative(workspace, entry.destinationPath));

      if (!(await pathExists(destination))) {
        throw new Error("Destination file does not exist.");
      }

      const destinationReal = await fs.realpath(destination);
      if (!destinationReal.startsWith(`${realWorkspace}${path.sep}`) && destinationReal !== realWorkspace) {
        throw new Error("Destination path escapes workspace.");
      }

      await fs.mkdir(path.dirname(source), { recursive: true });
      const sourceParentReal = await fs.realpath(path.dirname(source));
      if (!sourceParentReal.startsWith(`${realWorkspace}${path.sep}`) && sourceParentReal !== realWorkspace) {
        throw new Error("Source path escapes workspace.");
      }

      if (await pathExists(source)) {
        throw new Error("Original path is occupied.");
      }

      if (entry.fileHash) {
        const currentHash = await hashFile(destination);
        if (currentHash !== entry.fileHash) {
          throw new Error("Destination file was modified after the operation; rollback aborted to prevent data loss.");
        }
      }

      await fs.rename(destination, source);
      entry.rolledBackAt = new Date().toISOString();
      await updateJournal(entry);

      const proposal = execution.proposals.find((item) => item.id === entry.proposalId);
      if (proposal) {
        proposal.status = "pending";
        await saveExecution(execution);
      }

      results.push({ id: entry.id, status: "rolled_back" });
    } catch (error) {
      results.push({ id: entry.id, status: "failed", error: error instanceof Error ? error.message : "Rollback failed" });
    }
  }

  return results;
}

