import path from "node:path";
import type { Execution, OperationJournalEntry } from "./types.js";

export interface ExecutionMetrics {
  executionId: string;
  status: "completed" | "failed" | "rolled_back";
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  filesProcessed: number;
  duplicates: number;
  proposalsTotal: number;
  completed: number;
  failed: number;
  rolledBack: number;
  pending: number;
  providerType: "ollama" | "deterministic" | "mixed";
  providerName: string;
  isTimeEstimated: boolean;
  estimatedNetMinutesSaved: number;
  estimationMethod: string;
  errorCount: number;
  errorSummaries: string[];
}

export function resolveExecutionStatus(execution: Execution): "completed" | "failed" | "rolled_back" {
  if (execution.status === "rolled_back" || execution.status === "failed") {
    return execution.status;
  }
  const proposals = Array.isArray(execution.proposals) ? execution.proposals : [];
  const reports = Array.isArray(execution.reports) ? execution.reports : [];
  const errors = Array.isArray(execution.errors) ? execution.errors : [];
  if (proposals.length > 0 && proposals.every((p) => p.status === "rolled_back")) {
    return "rolled_back";
  }
  if (errors.length > 0 && reports.length === 0 && proposals.length === 0) {
    return "failed";
  }
  return execution.status || "completed";
}

export function formatDateSafe(val?: string): string {
  if (!val || typeof val !== "string") return "N/A";
  const d = new Date(val);
  return isNaN(d.getTime()) ? "N/A" : d.toISOString();
}

export function computeExecutionMetrics(
  execution: Execution,
  journal: OperationJournalEntry[] = []
): ExecutionMetrics {
  const executionId = execution.id || "unknown";
  const proposals = Array.isArray(execution.proposals) ? execution.proposals : [];
  const reports = Array.isArray(execution.reports) ? execution.reports : [];
  const errors = Array.isArray(execution.errors) ? execution.errors.filter((e): e is string => typeof e === "string") : [];

  let durationSeconds = 0;
  if (execution.startedAt && execution.endedAt) {
    const start = new Date(execution.startedAt).getTime();
    const end = new Date(execution.endedAt).getTime();
    if (!isNaN(start) && !isNaN(end) && end >= start) {
      durationSeconds = (end - start) / 1000;
    }
  }
  if (durationSeconds === 0 && typeof execution.automatedMinutes === "number" && execution.automatedMinutes > 0) {
    durationSeconds = execution.automatedMinutes * 60;
  }

  const completed = proposals.filter((p) => p && p.status === "completed").length;
  const failed = proposals.filter((p) => p && p.status === "failed").length;
  const rolledBack = proposals.filter((p) => p && p.status === "rolled_back").length;
  const pending = proposals.filter((p) => p && p.status === "pending").length;

  const status = resolveExecutionStatus(execution);

  const hasOllama = reports.some((r) => r && r.provider === "ollama");
  const hasDet = reports.some((r) => r && r.provider === "deterministic");
  const providerType: "ollama" | "deterministic" | "mixed" =
    hasOllama && hasDet ? "mixed" : hasOllama ? "ollama" : "deterministic";

  const providerName =
    providerType === "ollama"
      ? "Open-Weight Local Model (Gemma 3)"
      : providerType === "mixed"
      ? "Mixed (Local Model + Deterministic)"
      : "Deterministic Heuristic Engine";

  const estimationMethod =
    "Estimated net time saved compares baseline manual processing (heuristic estimate of 6.0 minutes per file) against measured automated duration and review overhead (estimated at 0.5 minutes per proposal). Estimates are distinct from measured clock duration.";

  const errorSummaries = errors.map((err) => sanitizeErrorMessage(err, execution.workspace));

  return {
    executionId,
    status,
    startedAt: formatDateSafe(execution.startedAt) === "N/A" ? "" : execution.startedAt,
    endedAt: formatDateSafe(execution.endedAt) === "N/A" ? "" : execution.endedAt,
    durationSeconds,
    filesProcessed: Number(execution.filesProcessed) || 0,
    duplicates: Number(execution.duplicates) || 0,
    proposalsTotal: proposals.length,
    completed,
    failed,
    rolledBack,
    pending,
    providerType,
    providerName,
    isTimeEstimated: true,
    estimatedNetMinutesSaved: Number(execution.estimatedNetMinutesSaved) || 0,
    estimationMethod,
    errorCount: errors.length,
    errorSummaries
  };
}

export function sanitizePath(rawPath: string, workspace?: string): string {
  if (!rawPath || typeof rawPath !== "string") return "";
  if (workspace) {
    const normWorkspace = path.resolve(workspace);
    const normPath = path.resolve(rawPath);
    if (normPath === normWorkspace) return ".";
    if (normPath.startsWith(`${normWorkspace}${path.sep}`)) {
      return path.relative(normWorkspace, normPath) || path.basename(rawPath);
    }
  }
  const masked = rawPath
    .replace(/(?:^|[/\\])(?:Users|home)[/\\][^/\\]+/gi, "[sanitized-user]")
    .replace(/^[a-zA-Z]:[/\\]Users[/\\][^/\\]+/gi, "[sanitized-user]");
  const parts = masked.split(/[\/\\]+/).filter(Boolean);
  if (parts.length <= 2) {
    return path.basename(masked);
  }
  return parts.slice(-2).join("/");
}

export function sanitizeErrorMessage(error: string, workspace?: string): string {
  if (!error || typeof error !== "string") return "";
  let clean = error.replace(/(?:\r?\n)?\s*at\s+.*(?:\r?\n|$)/g, " [internal-trace] ");
  clean = clean.replace(/at\s+.*\(.*:\d+:\d+\)/g, "[internal-trace]");
  clean = clean.replace(/\(?(?:\/[^\s:]+|[A-Za-z]:\\[^\s:]+):\d+:\d+\)?/g, "[internal-trace]");
  clean = clean.replace(/(?:api[_-]?key|token|secret|password|bearer)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]");
  clean = clean.replace(/\b(?:sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|ey[a-zA-Z0-9._-]{20,})\b/g, "[REDACTED-SECRET]");
  if (workspace) {
    clean = clean.split(workspace).join("[authorized-workspace]");
    clean = clean.split(path.resolve(workspace)).join("[authorized-workspace]");
    clean = clean.replace(/(?:^|[/\\])(?:Users|home)[/\\][^/\s'"]+/gi, "[sanitized-path]");
    clean = clean.replace(/[A-Za-z]:[/\\]Users[/\\][^/\s'"]+/gi, "[sanitized-path]");
  }
  return clean.trim();
}

export function serializeExecutionToJson(
  execution: Execution,
  options: { sanitizePaths?: boolean; journal?: OperationJournalEntry[] } = {}
): string {
  const shouldSanitize = options.sanitizePaths !== false;
  const metrics = computeExecutionMetrics(execution, options.journal);
  const proposals = Array.isArray(execution.proposals) ? execution.proposals : [];
  const reports = Array.isArray(execution.reports) ? execution.reports : [];
  const errors = Array.isArray(execution.errors) ? execution.errors.filter((e): e is string => typeof e === "string") : [];

  const payload = {
    executionId: metrics.executionId,
    status: metrics.status,
    workspace: shouldSanitize ? "[authorized-workspace]" : execution.workspace || "",
    timing: {
      startedAt: formatDateSafe(execution.startedAt) === "N/A" ? "" : execution.startedAt,
      endedAt: formatDateSafe(execution.endedAt) === "N/A" ? "" : execution.endedAt,
      measuredDurationSeconds: Number(metrics.durationSeconds.toFixed(3))
    },
    inventory: {
      filesProcessed: metrics.filesProcessed,
      duplicatesDetected: metrics.duplicates,
      proposalsGenerated: metrics.proposalsTotal
    },
    operations: {
      completed: metrics.completed,
      failed: metrics.failed,
      rolledBack: metrics.rolledBack,
      pending: metrics.pending
    },
    analysisProvider: {
      type: metrics.providerType,
      name: metrics.providerName
    },
    productivityEstimation: {
      isEstimated: true,
      estimatedNetMinutesSaved: Number(metrics.estimatedNetMinutesSaved.toFixed(1)),
      measuredDurationSeconds: Number(metrics.durationSeconds.toFixed(3)),
      methodology: metrics.estimationMethod
    },
    errors: errors.map((err) => sanitizeErrorMessage(err, shouldSanitize ? execution.workspace : undefined)),
    proposals: proposals.map((p) => ({
      id: p?.id || "",
      source: shouldSanitize ? sanitizePath(p?.sourcePath, execution.workspace) : p?.sourcePath || "",
      destination: shouldSanitize ? sanitizePath(p?.destinationPath, execution.workspace) : p?.destinationPath || "",
      operationType: p?.operationType || (p?.sourcePath === p?.destinationPath ? "duplicate_review" : "categorize_move"),
      status: p?.status || "pending",
      reason: p?.reason || "",
      provider: p?.provider || "deterministic",
      warning: p?.warning ? sanitizeErrorMessage(p.warning, shouldSanitize ? execution.workspace : undefined) : undefined
    })),
    reports: reports.map((r) => ({
      source: shouldSanitize ? sanitizePath(r?.source, execution.workspace) : r?.source || "",
      category: r?.category || "General",
      summary: r?.summary || "",
      tasksCount: Array.isArray(r?.tasks) ? r.tasks.length : 0,
      decisionsCount: Array.isArray(r?.decisions) ? r.decisions.length : 0,
      deadlinesCount: Array.isArray(r?.deadlines) ? r.deadlines.length : 0,
      provider: r?.provider || "deterministic"
    }))
  };

  return JSON.stringify(payload, null, 2);
}

export function serializeExecutionToMarkdown(
  execution: Execution,
  options: { sanitizePaths?: boolean; journal?: OperationJournalEntry[] } = {}
): string {
  const shouldSanitize = options.sanitizePaths !== false;
  const metrics = computeExecutionMetrics(execution, options.journal);
  const proposals = Array.isArray(execution.proposals) ? execution.proposals : [];
  const reports = Array.isArray(execution.reports) ? execution.reports : [];
  const errors = Array.isArray(execution.errors) ? execution.errors.filter((e): e is string => typeof e === "string") : [];

  const lines: string[] = [
    `# SlothDesk AI Execution Report`,
    ``,
    `## 1. Overview & Verification`,
    `- **Execution ID:** \`${metrics.executionId}\``,
    `- **Execution Status:** ${metrics.status.toUpperCase()}`,
    `- **Workspace:** \`${shouldSanitize ? "[authorized-workspace]" : execution.workspace || ""}\``,
    `- **Start Time:** ${formatDateSafe(execution.startedAt)}`,
    `- **End Time:** ${formatDateSafe(execution.endedAt)}`,
    `- **Measured Automation Duration:** ${metrics.durationSeconds.toFixed(3)}s`,
    `- **Analysis Provider:** ${metrics.providerName}`,
    ``,
    `## 2. Inventory & Operations Summary`,
    `- **Files Processed:** ${metrics.filesProcessed}`,
    `- **Duplicates Detected:** ${metrics.duplicates}`,
    `- **Proposals Staged:** ${metrics.proposalsTotal}`,
    `- **Operations Completed:** ${metrics.completed}`,
    `- **Operations Failed:** ${metrics.failed}`,
    `- **Operations Rolled Back:** ${metrics.rolledBack}`,
    `- **Operations Pending:** ${metrics.pending}`,
    ``,
    `## 3. Measured Time vs. Estimated Time Saved`,
    `- **Measured Clock Duration:** ${metrics.durationSeconds.toFixed(3)} seconds (actual automated runtime)`,
    `- **Estimated Net Minutes Saved:** ~${metrics.estimatedNetMinutesSaved.toFixed(1)} minutes (projected human time)`,
    `> **Estimation Methodology:** ${metrics.estimationMethod}`,
    ``,
    `## 4. Errors & Diagnostics`
  ];

  if (errors.length === 0) {
    lines.push(`No errors were encountered during workspace inventory or processing.`);
  } else {
    for (const err of errors) {
      const sanitized = sanitizeErrorMessage(err, shouldSanitize ? execution.workspace : undefined);
      lines.push(`- ⚠️ ${sanitized}`);
    }
  }

  lines.push(``, `## 5. Staged Proposals & Approval Gate`);
  if (proposals.length === 0) {
    lines.push(`No proposals were staged for this execution.`);
  } else {
    lines.push(
      `| Original Source | Proposed Destination | Operation | Status | Reason |`,
      `| :--- | :--- | :--- | :--- | :--- |`
    );
    for (const p of proposals) {
      const src = shouldSanitize ? sanitizePath(p.sourcePath, execution.workspace) : p.sourcePath;
      const dest = shouldSanitize ? sanitizePath(p.destinationPath, execution.workspace) : p.destinationPath;
      const op = p.operationType || (p.sourcePath === p.destinationPath ? "duplicate_review" : "categorize_move");
      const opText = op === "duplicate_review" ? "Duplicate Review" : "Organize & Move";
      const statusText = (p.status || "pending").toUpperCase().replace("_", " ");
      const reasonText = (p.reason || "").replace(/\|/g, "\\|");
      lines.push(`| \`${src}\` | \`${dest}\` | ${opText} | **${statusText}** | ${reasonText} |`);
    }
  }

  lines.push(``, `## 6. Document Intelligence Findings`);
  if (reports.length === 0) {
    lines.push(`No document intelligence reports were generated.`);
  } else {
    for (const rep of reports) {
      const src = shouldSanitize ? sanitizePath(rep.source, execution.workspace) : rep.source;
      lines.push(
        `### \`${src}\` (${rep.category} · ${rep.provider === "ollama" ? "Open-Weight Model" : "Deterministic"})`,
        `- **Summary:** ${rep.summary}`,
        `- **Tasks Extracted:** ${Array.isArray(rep.tasks) ? rep.tasks.length : 0}`,
        `- **Decisions:** ${Array.isArray(rep.decisions) ? rep.decisions.length : 0}`,
        `- **Deadlines:** ${Array.isArray(rep.deadlines) ? rep.deadlines.length : 0}`,
        ``
      );
    }
  }

  lines.push(`---`, `*Report generated by SlothDesk AI Execution Inspector on ${new Date().toISOString()}.*`);
  return lines.join("\n");
}
