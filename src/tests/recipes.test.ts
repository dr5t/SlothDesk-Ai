import { strict as assert } from "node:assert";
import { test, before, after } from "node:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { AVAILABLE_RECIPES, runRecipe } from "../recipes.js";
import { server } from "../server.js";
import { approveOperations } from "../workflow.js";

let testPort: number;
let baseUrl: string;

before(async () => {
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
});

test("recipes: definitions include all 4 required recipes with full metadata", () => {
  assert.equal(AVAILABLE_RECIPES.length, 4);
  const ids = AVAILABLE_RECIPES.map((r) => r.id);
  assert.deepEqual(ids, ["meeting-notes", "duplicate-review", "organization-preview", "csv-audit"]);

  for (const recipe of AVAILABLE_RECIPES) {
    assert.ok(recipe.name.length > 0);
    assert.ok(recipe.tagline.length > 0);
    assert.ok(recipe.description.length > 0);
    assert.ok(recipe.inputRequirements.length > 0);
    assert.ok(Array.isArray(recipe.operationsPreview));
    assert.ok(recipe.operationsPreview.length >= 3);
    assert.ok(["review", "csv", "workspace"].includes(recipe.targetView));
  }
});

test("recipes: failure handling for invalid recipe ID or empty workspace", async () => {
  await assert.rejects(
    async () => runRecipe("non-existent-recipe", "/tmp"),
    /Unknown recipe: non-existent-recipe/
  );

  await assert.rejects(
    async () => runRecipe("meeting-notes", ""),
    /valid workspace path is required/
  );

  await assert.rejects(
    async () => runRecipe("meeting-notes", "   "),
    /valid workspace path is required/
  );
});

test("recipes: meeting-notes extracts tasks, decisions, and deadlines into review proposals", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "recipe-notes-"));
  try {
    await fs.writeFile(
      path.join(dir, "team-sync.md"),
      "# Team Sync\nTODO: finalize OpenAPI spec\nDecision: use TypeScript strict mode\nDeadline: Friday 5pm\n"
    );

    const result = await runRecipe("meeting-notes", dir);
    assert.equal(result.recipeId, "meeting-notes");
    assert.equal(result.targetView, "review");
    assert.ok(result.summary.headline.includes("1 document"));
    assert.ok(result.summary.metrics.some((m) => m.label === "Tasks Extracted" && Number(m.value) >= 1));
    assert.ok(result.summary.metrics.some((m) => m.label === "Decisions" && Number(m.value) >= 1));
    assert.ok(result.summary.metrics.some((m) => m.label === "Deadlines" && Number(m.value) >= 1));
    assert.ok(result.execution.proposals.length > 0);

    const originalFileExists = await fs.stat(path.join(dir, "team-sync.md")).then(() => true, () => false);
    assert.equal(originalFileExists, true);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("recipes: duplicate-review detects identical files without deleting silently", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "recipe-dup-"));
  try {
    const content = "alpha-beta-gamma-exact-duplicate-content";
    await fs.writeFile(path.join(dir, "original.txt"), content);
    await fs.writeFile(path.join(dir, "copy.txt"), content);

    const result = await runRecipe("duplicate-review", dir);
    assert.equal(result.recipeId, "duplicate-review");
    assert.equal(result.targetView, "review");
    assert.equal(result.execution.duplicates, 1);
    assert.ok(result.summary.headline.includes("1 cryptographic duplicate"));

    const origStat = await fs.stat(path.join(dir, "original.txt")).then(() => true, () => false);
    const copyStat = await fs.stat(path.join(dir, "copy.txt")).then(() => true, () => false);
    assert.equal(origStat, true);
    assert.equal(copyStat, true);

    const dupProposal = result.execution.proposals.find((p) => p.reason.includes("Duplicate of"));
    assert.ok(dupProposal);
    assert.equal(dupProposal.status, "pending");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("recipes: organization-preview generates collision-safe proposals without moving files before approval", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "recipe-org-"));
  try {
    await fs.writeFile(path.join(dir, "doc1.md"), "# Sprint Planning\nDiscuss roadmap\n");
    await fs.writeFile(path.join(dir, "doc2.md"), "# Architecture Review\nSystem boundaries\n");

    const result = await runRecipe("organization-preview", dir);
    assert.equal(result.recipeId, "organization-preview");
    assert.equal(result.targetView, "review");
    assert.ok(result.execution.proposals.length > 0);

    for (const p of result.execution.proposals) {
      assert.equal(p.status, "pending");
      const srcExists = await fs.stat(p.sourcePath).then(() => true, () => false);
      assert.equal(srcExists, true);
    }

    const firstProposal = result.execution.proposals[0];
    const approvalResult = await approveOperations(result.execution, [firstProposal.id]);
    assert.equal(approvalResult[0].status, "completed");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("recipes: csv-audit profiles tabular structure and links to csv lab", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "recipe-csv-"));
  try {
    await fs.writeFile(
      path.join(dir, "metrics.csv"),
      "id,name,value\n1,alpha,10\n2,beta,20\n3,,30\n"
    );

    const result = await runRecipe("csv-audit", dir);
    assert.equal(result.recipeId, "csv-audit");
    assert.equal(result.targetView, "csv");
    assert.ok(result.summary.headline.includes("1 tabular dataset"));

    const csvMetric = result.summary.metrics.find((m) => m.label === "CSVs Profiled");
    assert.ok(csvMetric);
    assert.equal(csvMetric.value, 1);

    const datasetReport = result.execution.reports.find((r) => r.category === "Dataset");
    assert.ok(datasetReport);
    assert.equal(datasetReport.source, "metrics.csv");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("recipes API: GET /api/recipes returns available recipes", async () => {
  const res = await fetch(`${baseUrl}/api/recipes`);
  assert.equal(res.status, 200);
  const data = await res.json() as any[];
  assert.equal(data.length, 4);
  assert.equal(data[0].id, "meeting-notes");
  assert.equal(data[3].id, "csv-audit");
});

test("recipes API: POST /api/recipes/run validation and execution", async () => {
  const noRecipe = await fetch(`${baseUrl}/api/recipes/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspace: "/tmp" })
  });
  assert.equal(noRecipe.status, 400);

  const unknownRecipe = await fetch(`${baseUrl}/api/recipes/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipeId: "fake-recipe", workspace: "/tmp" })
  });
  assert.equal(unknownRecipe.status, 400);

  const noWorkspace = await fetch(`${baseUrl}/api/recipes/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipeId: "meeting-notes" })
  });
  assert.equal(noWorkspace.status, 400);

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "recipe-api-"));
  try {
    await fs.writeFile(path.join(dir, "notes.md"), "# Project Kickoff\nTODO: write tests\n");
    const runRes = await fetch(`${baseUrl}/api/recipes/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipeId: "meeting-notes", workspace: dir })
    });
    assert.equal(runRes.status, 200);
    const runData = await runRes.json() as any;
    assert.equal(runData.recipeId, "meeting-notes");
    assert.ok(runData.execution);
    assert.ok(runData.summary);
    assert.equal(runData.targetView, "review");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("recipes API: POST /api/recipes/run enforces hosted mode rejection", async () => {
  process.env.HOSTED_MODE = "true";
  try {
    const res = await fetch(`${baseUrl}/api/recipes/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipeId: "meeting-notes", workspace: "/tmp" })
    });
    assert.equal(res.status, 403);
    const data = await res.json() as any;
    assert.match(data.error, /hosted mode accepts uploads only/i);
  } finally {
    delete process.env.HOSTED_MODE;
  }
});
