import { promises as fs } from "node:fs";
import path from "node:path";
import type { Execution, OperationJournalEntry } from "./types.js";

const dataDir = path.resolve(process.env.DATA_DIR ?? ".data");
const historyFile = path.join(dataDir, "executions.json");
const journalFile = path.join(dataDir, "operations.json");

export async function listExecutions(): Promise<Execution[]> {
  try {
    return JSON.parse(await fs.readFile(historyFile, "utf8")) as Execution[];
  } catch {
    return [];
  }
}

export async function saveExecution(execution: Execution) {
  const executions = await listExecutions();
  await fs.mkdir(dataDir, { recursive: true });
  const withoutCurrent = executions.filter((item) => item.id !== execution.id);
  await fs.writeFile(historyFile, JSON.stringify([execution, ...withoutCurrent].slice(0, 50), null, 2));
}

export async function getExecution(id: string): Promise<Execution | undefined> {
  return (await listExecutions()).find((execution) => execution.id === id);
}

export async function listJournal(): Promise<OperationJournalEntry[]> {
  try {
    return JSON.parse(await fs.readFile(journalFile, "utf8")) as OperationJournalEntry[];
  } catch {
    return [];
  }
}

export async function appendJournal(entry: OperationJournalEntry) {
  const journal = await listJournal();
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(journalFile, JSON.stringify([entry, ...journal].slice(0, 500), null, 2));
}

export async function updateJournal(entry: OperationJournalEntry) {
  const journal = await listJournal();
  const updated = journal.map((item) => item.id === entry.id ? entry : item);
  await fs.writeFile(journalFile, JSON.stringify(updated, null, 2));
}
