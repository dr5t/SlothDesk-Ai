import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { FileRecord, SourceEvidence, SupportedFileType } from "./types.js";

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
  const records: FileRecord[] = [];
  const hashes = new Map<string, string>();
  const pending = [root];
  while (pending.length) {
    const current = pending.pop() as string;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
    const filePath = safeWorkspacePath(root, path.relative(root, path.join(current, entry.name)));
    if (entry.isDirectory()) {
      pending.push(filePath);
      continue;
    }
    if (!entry.isFile()) continue;
    const stat = await fs.stat(filePath);
    const type = classifyFile(entry.name);
    if (stat.size > maxBytes) continue;
    const hash = await hashFile(filePath);
    const duplicateOf = hashes.get(hash);
    const relativePath = path.relative(root, filePath);
    hashes.set(hash, relativePath);
    records.push({
      path: filePath,
      relativePath,
      name: entry.name,
      type,
      size: stat.size,
      hash,
      ...(duplicateOf ? { duplicateOf } : {})
    });
    }
  }
  return records;
}

export function extractDeterministicSignals(text: string) {
  if (typeof text !== "string") {
    return { lines: [], tasks: [], decisions: [], deadlines: [], evidence: [] };
  }
  const rawLines = text.split(/\r?\n/);
  const lines: string[] = [];
  const tasks: string[] = [];
  const decisions: string[] = [];
  const deadlines: string[] = [];
  const evidence: SourceEvidence[] = [];

  rawLines.forEach((raw, idx) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const lineNum = idx + 1;
    lines.push(trimmed);

    if (/^(?:[-*]\s*)?(todo|task|action|follow[- ]?up)\b/i.test(trimmed)) {
      tasks.push(trimmed);
      evidence.push({ item: trimmed, excerpt: trimmed.slice(0, 160), line: lineNum });
    }
    if (/\b(decided|decision|agreed|approved)\b/i.test(trimmed)) {
      decisions.push(trimmed);
      evidence.push({ item: trimmed, excerpt: trimmed.slice(0, 160), line: lineNum });
    }
    if (/\b(?:by|due|deadline)\b.*\b(?:\d{1,2}[/-]\d{1,2}|monday|tuesday|wednesday|thursday|friday|next week|tomorrow)\b/i.test(trimmed)) {
      deadlines.push(trimmed);
      evidence.push({ item: trimmed, excerpt: trimmed.slice(0, 160), line: lineNum });
    }
  });

  return { lines, tasks, decisions, deadlines, evidence };
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
