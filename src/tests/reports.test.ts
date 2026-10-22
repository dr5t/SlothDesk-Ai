import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { strict as assert } from "node:assert";
import { test, before, after } from "node:test";
import {
  computeExecutionMetrics,
  sanitizePath,
  serializeExecutionToJson,
  serializeExecutionToMarkdown
} from "../reports.js";
import { saveExecution } from "../store.js";
import { server } from "../server.js";
import type { Execution, Proposal, DocumentReport } from "../types.js";

let testPort: number;
let baseUrl: string;
let testDataDir: string;

before(async () => {
  testDataDir = await fs.mkdtemp(path.join(tmpdir(), "slothdesk-reports-data-"));
  process.env.DATA_DIR = testDataDir;

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "object" && address !== null) {
        testPort = address.port;
        baseUrl = `http://127.0.0.1:${testPort}`;
      }
      resolve();
    });
  });
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (testDataDir) {
    await fs.rm(testDataDir, { recursive: true, force: true });
  }
});

test("computeExecutionMetrics calculates clock duration and operation counts", () => {
  const sampleProposals: Proposal[] = [
    {
      id: "p1",
      sourcePath: "/workspace/a.txt",
      destinationPath: "/workspace/docs/a.txt",
      operationType: "categorize_move",
      status: "completed",
      reason: "Text file",
      provider: "deterministic"
    },
    {
      id: "p2",
      sourcePath: "/workspace/b.txt",
      destinationPath: "/workspace/docs/b.txt",
      operationType: "categorize_move",
      status: "failed",
      reason: "Target exists",
      provider: "deterministic"
    },
    {
      id: "p3",
      sourcePath: "/workspace/c.txt",
      destinationPath: "/workspace/docs/c.txt",
      operationType: "categorize_move",
      status: "rolled_back",
      reason: "User rollback",
      provider: "deterministic"
    },
    {
      id: "p4",
      sourcePath: "/workspace/d.txt",
      destinationPath: "/workspace/docs/d.txt",
      operationType: "categorize_move",
      status: "pending",
      reason: "Pending approval",
      provider: "deterministic"
    }
  ];

  const execution: Execution = {
    id: "exec-test-1",
    workspace: "/workspace",
    filesProcessed: 10,
    duplicates: 2,
    tasksExtracted: 5,
    manualMinutes: 60,
    automatedMinutes: 0.05,
    reviewMinutes: 2,
    estimatedNetMinutesSaved: 54.2,
    startedAt: "2026-10-22T04:00:00.000Z",
    endedAt: "2026-10-22T04:00:03.500Z",
    status: "completed",
    proposals: sampleProposals,
    reports: [
      {
        source: "/workspace/a.txt",
        category: "notes",
        summary: "Summary note",
        facts: [],
        tasks: ["Task 1"],
        decisions: ["Decision 1"],
        deadlines: [],
        suggestedName: "a.txt",
        provider: "ollama"
      }
    ],
    errors: []
  };

  const metrics = computeExecutionMetrics(execution);
  assert.equal(metrics.durationSeconds, 3.5);
  assert.equal(metrics.filesProcessed, 10);
  assert.equal(metrics.duplicates, 2);
  assert.equal(metrics.proposalsTotal, 4);
  assert.equal(metrics.completed, 1);
  assert.equal(metrics.failed, 1);
  assert.equal(metrics.rolledBack, 1);
  assert.equal(metrics.pending, 1);
  assert.equal(metrics.providerType, "ollama");
  assert.equal(metrics.isTimeEstimated, true);
  assert.equal(metrics.estimatedNetMinutesSaved, 54.2);
  assert.ok(metrics.estimationMethod.includes("heuristic estimate of 6.0 minutes per file"));
});

test("computeExecutionMetrics handles missing fields safely", () => {
  const minimalExecution: any = {
    id: "exec-minimal"
  };

  const metrics = computeExecutionMetrics(minimalExecution);
  assert.equal(metrics.durationSeconds, 0);
  assert.equal(metrics.filesProcessed, 0);
  assert.equal(metrics.duplicates, 0);
  assert.equal(metrics.proposalsTotal, 0);
  assert.equal(metrics.completed, 0);
  assert.equal(metrics.failed, 0);
  assert.equal(metrics.rolledBack, 0);
  assert.equal(metrics.pending, 0);
  assert.equal(metrics.providerType, "deterministic");
  assert.equal(metrics.estimatedNetMinutesSaved, 0);
});

test("computeExecutionMetrics correctly flags mixed provider", () => {
  const execution: Execution = {
    id: "exec-mixed",
    workspace: "/workspace",
    filesProcessed: 2,
    duplicates: 0,
    tasksExtracted: 1,
    manualMinutes: 12,
    automatedMinutes: 0.1,
    reviewMinutes: 1,
    estimatedNetMinutesSaved: 10,
    startedAt: "2026-10-22T04:00:00.000Z",
    endedAt: "2026-10-22T04:00:01.000Z",
    status: "completed",
    proposals: [],
    reports: [
      {
        source: "file1.txt",
        category: "notes",
        summary: "s1",
        facts: [],
        tasks: [],
        decisions: [],
        deadlines: [],
        suggestedName: "file1.txt",
        provider: "ollama"
      },
      {
        source: "file2.txt",
        category: "notes",
        summary: "s2",
        facts: [],
        tasks: [],
        decisions: [],
        deadlines: [],
        suggestedName: "file2.txt",
        provider: "deterministic"
      }
    ],
    errors: []
  };

  const metrics = computeExecutionMetrics(execution);
  assert.equal(metrics.providerType, "mixed");
  assert.ok(metrics.providerName.includes("Mixed"));
});

test("sanitizePath masks workspace root and private paths", () => {
  const workspace = "/Users/secretuser/project/my-workspace";
  const filePath = "/Users/secretuser/project/my-workspace/subfolder/file.txt";

  const sanitized = sanitizePath(filePath, workspace);
  assert.equal(sanitized, "subfolder/file.txt");

  const outsidePath = "/Users/secretuser/other/secret.txt";
  const sanitizedOutside = sanitizePath(outsidePath, workspace);
  assert.ok(!sanitizedOutside.includes("secretuser"));
});

test("serializeExecutionToJson produces verified data without fabricated tokens or costs", () => {
  const execution: Execution = {
    id: "exec-json-test",
    workspace: "/Users/testuser/documents/workspace",
    filesProcessed: 3,
    duplicates: 1,
    tasksExtracted: 2,
    manualMinutes: 18,
    automatedMinutes: 0.02,
    reviewMinutes: 0.5,
    estimatedNetMinutesSaved: 17.5,
    startedAt: "2026-10-22T04:00:00.000Z",
    endedAt: "2026-10-22T04:00:01.200Z",
    status: "completed",
    proposals: [
      {
        id: "p1",
        sourcePath: "/Users/testuser/documents/workspace/notes.md",
        destinationPath: "/Users/testuser/documents/workspace/Notes/notes.md",
        operationType: "categorize_move",
        status: "completed",
        reason: "Markdown file",
        provider: "ollama"
      }
    ],
    reports: [
      {
        source: "/Users/testuser/documents/workspace/notes.md",
        category: "documentation",
        summary: "Project plan",
        facts: [],
        tasks: ["Deploy app"],
        decisions: [],
        deadlines: [],
        suggestedName: "notes.md",
        provider: "ollama"
      }
    ],
    errors: ["Error at /Users/testuser/documents/workspace/bad.ts:12:34"]
  };

  const jsonStr = serializeExecutionToJson(execution, { sanitizePaths: true });
  const parsed = JSON.parse(jsonStr);

  assert.equal(parsed.executionId, "exec-json-test");
  assert.equal(parsed.status, "completed");
  assert.equal(parsed.workspace, "[authorized-workspace]");
  assert.equal(parsed.timing.measuredDurationSeconds, 1.2);
  assert.equal(parsed.inventory.filesProcessed, 3);
  assert.equal(parsed.inventory.duplicatesDetected, 1);
  assert.equal(parsed.operations.completed, 1);
  assert.equal(parsed.productivityEstimation.isEstimated, true);
  assert.equal(parsed.productivityEstimation.estimatedNetMinutesSaved, 17.5);
  assert.ok(parsed.productivityEstimation.methodology.includes("heuristic estimate of 6.0 minutes per file"));

  assert.equal((parsed as any).tokensUsed, undefined);
  assert.equal((parsed as any).cost, undefined);
  assert.equal((parsed as any).inferenceLatency, undefined);

  assert.ok(!jsonStr.includes("testuser"));
  assert.equal(parsed.proposals[0].source, "notes.md");
});

test("serializeExecutionToMarkdown documents estimation method and status", () => {
  const execution: Execution = {
    id: "exec-md-test",
    workspace: "/Users/dev/workspace",
    filesProcessed: 5,
    duplicates: 0,
    tasksExtracted: 3,
    manualMinutes: 30,
    automatedMinutes: 0.05,
    reviewMinutes: 1.5,
    estimatedNetMinutesSaved: 28.0,
    startedAt: "2026-10-22T04:00:00.000Z",
    endedAt: "2026-10-22T04:00:02.100Z",
    status: "rolled_back",
    proposals: [
      {
        id: "p1",
        sourcePath: "/Users/dev/workspace/doc.md",
        destinationPath: "/Users/dev/workspace/Docs/doc.md",
        operationType: "categorize_move",
        status: "rolled_back",
        reason: "Categorized by type",
        provider: "deterministic"
      }
    ],
    reports: [],
    errors: []
  };

  const md = serializeExecutionToMarkdown(execution, { sanitizePaths: true });
  assert.ok(md.includes("# SlothDesk AI Execution Report"));
  assert.ok(md.includes("`exec-md-test`"));
  assert.ok(md.includes("ROLLED_BACK"));
  assert.ok(md.includes("2.100s"));
  assert.ok(md.includes("~28.0 minutes"));
  assert.ok(md.includes("Estimation Methodology:"));
  assert.ok(md.includes("heuristic estimate of 6.0 minutes per file"));
  assert.ok(md.includes("| `doc.md` | `Docs/doc.md` | Organize & Move | **ROLLED BACK** |"));
  assert.ok(!md.includes("/Users/dev"));
});

test("serializeExecutionToMarkdown handles empty and error execution records", () => {
  const failedExecution: Execution = {
    id: "exec-failed",
    workspace: "/tmp/empty",
    filesProcessed: 0,
    duplicates: 0,
    tasksExtracted: 0,
    manualMinutes: 0,
    automatedMinutes: 0,
    reviewMinutes: 0,
    estimatedNetMinutesSaved: 0,
    startedAt: "",
    endedAt: "",
    status: "failed",
    proposals: [],
    reports: [],
    errors: ["Failed to scan directory: EACCES permission denied"]
  };

  const md = serializeExecutionToMarkdown(failedExecution);
  assert.ok(md.includes("FAILED"));
  assert.ok(md.includes("EACCES permission denied"));
  assert.ok(md.includes("No proposals were staged"));
  assert.ok(md.includes("No document intelligence reports were generated"));
});

test("server API: GET /api/executions/:id returns execution details and metrics", async () => {
  const testId = `test-inspect-${Date.now()}`;
  const testExecution: Execution = {
    id: testId,
    workspace: "/tmp/test-workspace",
    filesProcessed: 4,
    duplicates: 1,
    tasksExtracted: 2,
    manualMinutes: 24,
    automatedMinutes: 0.04,
    reviewMinutes: 1,
    estimatedNetMinutesSaved: 22.0,
    startedAt: "2026-10-22T04:00:00.000Z",
    endedAt: "2026-10-22T04:00:01.500Z",
    status: "completed",
    proposals: [
      {
        id: "p1",
        sourcePath: "/tmp/test-workspace/report.txt",
        destinationPath: "/tmp/test-workspace/Text/report.txt",
        operationType: "categorize_move",
        status: "completed",
        reason: "Text document",
        provider: "deterministic"
      }
    ],
    reports: [],
    errors: []
  };

  await saveExecution(testExecution);

  const res = await fetch(`${baseUrl}/api/executions/${testId}`);
  assert.equal(res.status, 200);
  const data = await res.json() as any;
  assert.equal(data.execution.id, testId);
  assert.equal(data.metrics.durationSeconds, 1.5);
  assert.equal(data.metrics.filesProcessed, 4);
  assert.equal(data.metrics.completed, 1);
  assert.ok(data.metrics.estimationMethod);

  const notFound = await fetch(`${baseUrl}/api/executions/non-existent-id-xyz`);
  assert.equal(notFound.status, 404);
});

test("server API: GET /api/executions/:id/export exports Markdown and JSON with proper headers", async () => {
  const testId = `test-export-${Date.now()}`;
  const testExecution: Execution = {
    id: testId,
    workspace: "/tmp/export-workspace",
    filesProcessed: 2,
    duplicates: 0,
    tasksExtracted: 1,
    manualMinutes: 12,
    automatedMinutes: 0.02,
    reviewMinutes: 0.5,
    estimatedNetMinutesSaved: 11.5,
    startedAt: "2026-10-22T04:00:00.000Z",
    endedAt: "2026-10-22T04:00:00.800Z",
    status: "completed",
    proposals: [],
    reports: [],
    errors: []
  };

  await saveExecution(testExecution);

  const mdRes = await fetch(`${baseUrl}/api/executions/${testId}/export?format=markdown`);
  assert.equal(mdRes.status, 200);
  assert.equal(mdRes.headers.get("content-type"), "text/markdown; charset=utf-8");
  assert.ok(mdRes.headers.get("content-disposition")?.includes(`slothdesk-execution-${testId.slice(0, 8)}.md`));
  const mdText = await mdRes.text();
  assert.ok(mdText.includes("# SlothDesk AI Execution Report"));
  assert.ok(mdText.includes("0.800s"));

  const jsonRes = await fetch(`${baseUrl}/api/executions/${testId}/export?format=json`);
  assert.equal(jsonRes.status, 200);
  assert.equal(jsonRes.headers.get("content-type"), "application/json; charset=utf-8");
  assert.ok(jsonRes.headers.get("content-disposition")?.includes(`slothdesk-execution-${testId.slice(0, 8)}.json`));
  const jsonData = await jsonRes.json() as any;
  assert.equal(jsonData.executionId, testId);
  assert.equal(jsonData.timing.measuredDurationSeconds, 0.8);
  assert.equal(jsonData.workspace, "[authorized-workspace]");

  const unmaskedRes = await fetch(`${baseUrl}/api/executions/${testId}/export?format=json&sanitize=false`);
  assert.equal(unmaskedRes.status, 200);
  const unmaskedData = await unmaskedRes.json() as any;
  assert.equal(unmaskedData.workspace, "/tmp/export-workspace");

  const missingRes = await fetch(`${baseUrl}/api/executions/fake-id-1234/export`);
  assert.equal(missingRes.status, 404);
});
