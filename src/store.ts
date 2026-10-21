import { promises as fs } from "node:fs";
import path from "node:path";
import type { Execution, OperationJournalEntry } from "./types.js";

export function getDataDir(): string {
  return path.resolve(process.env.DATA_DIR ?? ".data");
}

function getHistoryFile(): string {
  return path.join(getDataDir(), "executions.json");
}

function getJournalFile(): string {
  return path.join(getDataDir(), "operations.json");
}

async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpFile = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tmpFile, content, "utf8");
  await fs.rename(tmpFile, filePath);
}

export async function listExecutions(): Promise<Execution[]> {
  try {
    const raw = await fs.readFile(getHistoryFile(), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Execution[]) : [];
  } catch {
    return [];
  }
}

export async function saveExecution(execution: Execution) {
  const executions = await listExecutions();
  const withoutCurrent = executions.filter((item) => item.id !== execution.id);
  await atomicWriteJson(getHistoryFile(), [execution, ...withoutCurrent].slice(0, 50));
}

export async function getExecution(id: string): Promise<Execution | undefined> {
  return (await listExecutions()).find((execution) => execution.id === id);
}

export async function listJournal(): Promise<OperationJournalEntry[]> {
  try {
    const raw = await fs.readFile(getJournalFile(), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OperationJournalEntry[]) : [];
  } catch {
    return [];
  }
}

export async function appendJournal(entry: OperationJournalEntry) {
  const journal = await listJournal();
  const withoutCurrent = journal.filter((item) => item.id !== entry.id);
  await atomicWriteJson(getJournalFile(), [entry, ...withoutCurrent].slice(0, 500));
}

export async function updateJournal(entry: OperationJournalEntry) {
  const journal = await listJournal();
  const updated = journal.map((item) => (item.id === entry.id ? entry : item));
  await atomicWriteJson(getJournalFile(), updated);
}

