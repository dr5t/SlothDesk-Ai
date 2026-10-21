import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { FileRecord, SupportedFileType } from "./types.js";

const extensions: Record<string, SupportedFileType> = {
  ".txt": "text",
  ".md": "markdown",
  ".markdown": "markdown",
  ".csv": "csv",
  ".json": "json"
};

export function classifyFile(fileName: string): SupportedFileType {
  return extensions[path.extname(fileName).toLowerCase()] ?? "unsupported";
}

export function safeWorkspacePath(workspace: string, candidate: string): string {
  const root = path.resolve(workspace);
  const resolved = path.resolve(root, candidate);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Path is outside the authorized workspace.");
  }
  return resolved;
}

export async function hashFile(filePath: string): Promise<string> {
  const contents = await fs.readFile(filePath);
  return createHash("sha256").update(contents).digest("hex");
}

export async function scanWorkspace(workspace: string, maxBytes = 1_048_576): Promise<FileRecord[]> {
  const root = path.resolve(workspace);
  const entries = await fs.readdir(root, { withFileTypes: true });
  const records: FileRecord[] = [];
  const hashes = new Map<string, string>();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = safeWorkspacePath(root, entry.name);
    const stat = await fs.stat(filePath);
    const type = classifyFile(entry.name);
    if (stat.size > maxBytes) continue;
    const hash = await hashFile(filePath);
    const duplicateOf = hashes.get(hash);
    hashes.set(hash, entry.name);
    records.push({
      path: filePath,
      relativePath: entry.name,
      name: entry.name,
      type,
      size: stat.size,
      hash,
      ...(duplicateOf ? { duplicateOf } : {})
    });
  }
  return records;
}

export function extractDeterministicSignals(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const tasks = lines.filter((line) => /^(?:[-*]\s*)?(todo|task|action|follow[- ]?up)\b/i.test(line));
  const decisions = lines.filter((line) => /\b(decided|decision|agreed|approved)\b/i.test(line));
  const deadlines = lines.filter((line) => /\b(?:by|due|deadline)\b.*\b(?:\d{1,2}[/-]\d{1,2}|monday|tuesday|wednesday|thursday|friday|next week|tomorrow)\b/i.test(line));
  return { lines, tasks, decisions, deadlines };
}

export function csvProfile(text: string) {
  const rows = text.trim().split(/\r?\n/).filter(Boolean).map((row) => row.split(",").map((cell) => cell.trim()));
  const headers = rows[0] ?? [];
  const data = rows.slice(1);
  const missing = headers.map((header, index) => ({
    column: header,
    missing: data.filter((row) => !row[index]).length
  }));
  const types = headers.map((header, index) => {
    const values = data.map((row) => row[index]).filter(Boolean);
    const numeric = values.length > 0 && values.every((value) => Number.isFinite(Number(value)));
    return { column: header, inferredType: numeric ? "number" : "text" };
  });
  const uniqueRows = new Set(data.map((row) => JSON.stringify(row))).size;
  return { headers, sample: data.slice(0, 5), rowCount: data.length, duplicateRows: data.length - uniqueRows, missing, types };
}
