import path from "node:path";
import { runCleanup } from "./workflow.js";
import { defaultProvider, type ModelProvider } from "./provider.js";
import type { Execution } from "./types.js";

export interface RecipeDefinition {
  id: string;
  name: string;
  tagline: string;
  description: string;
  inputRequirements: string;
  operationsPreview: string[];
  targetView: "review" | "csv" | "workspace";
}

export interface RecipeMetric {
  label: string;
  value: string | number;
}

export interface RecipeRunResult {
  recipeId: string;
  recipeName: string;
  workspace: string;
  execution: Execution;
  summary: {
    headline: string;
    metrics: RecipeMetric[];
    highlights: string[];
  };
  targetView: "review" | "csv" | "workspace";
}

export const AVAILABLE_RECIPES: RecipeDefinition[] = [
  {
    id: "meeting-notes",
    name: "Meeting Notes to Action Items",
    tagline: "Extract tasks, decisions, and deadlines with line-level evidence.",
    description: "Scans authorized notes and documents to extract actionable tasks, detected decisions, and upcoming deadlines with line-level source evidence, organizing notes into reviewable categories.",
    inputRequirements: "Folder with Markdown (.md, .markdown) or text (.txt) documents.",
    operationsPreview: [
      "Scan workspace for text and markdown documents",
      "Extract tasks, decisions, and deadlines with line references",
      "Differentiate deterministic heuristics from local model inference",
      "Stage non-destructive categorization proposals for review"
    ],
    targetView: "review"
  },
  {
    id: "duplicate-review",
    name: "Duplicate File Review",
    tagline: "Cryptographically audit duplicate files with SHA-256.",
    description: "Audits the workspace using SHA-256 cryptographic hashes to identify identical files and stages duplicate proposals for explicit human approval before any archival.",
    inputRequirements: "Any folder containing documents, notes, CSVs, or JSON files.",
    operationsPreview: [
      "Calculate cryptographic SHA-256 hash for every file",
      "Detect byte-for-byte duplicate content across directories",
      "Stage duplicate removal/archival proposals in Review Center",
      "Prevent silent or automated deletion"
    ],
    targetView: "review"
  },
  {
    id: "organization-preview",
    name: "Workspace Organization Preview",
    tagline: "Dry-run collision-safe categorization and directory cleanup.",
    description: "Analyzes document signals and types to generate a clean, collision-safe directory structure proposal with automated disambiguation, strictly requiring human sign-off.",
    inputRequirements: "Folder with unorganized notes, datasets, and documents.",
    operationsPreview: [
      "Classify files into category folders based on content",
      "Disambiguate destination path collisions with counter suffixes",
      "Verify all paths are safely confined within the authorized folder",
      "Generate dry-run move proposals for selective approval"
    ],
    targetView: "review"
  },
  {
    id: "csv-audit",
    name: "CSV Data Quality Audit",
    tagline: "Inspect tabular schemas, duplicate rows, and missing values.",
    description: "Inspects tabular datasets to profile row counts, detect duplicate rows, discover missing values across columns, and infer data types without cloud exposure or third-party APIs.",
    inputRequirements: "Folder containing CSV (.csv) dataset files.",
    operationsPreview: [
      "Parse CSV structure deterministically in TypeScript",
      "Profile row count, column headers, and inferred data types",
      "Audit duplicate rows and missing cell counts per column",
      "Display structured inspection in CSV Lab without model overhead"
    ],
    targetView: "csv"
  }
];

export async function runRecipe(
  recipeId: string,
  workspace: string,
  provider: ModelProvider = defaultProvider
): Promise<RecipeRunResult> {
  const recipe = AVAILABLE_RECIPES.find((r) => r.id === recipeId);
  if (!recipe) {
    throw new Error(`Unknown recipe: ${recipeId}. Supported recipes: ${AVAILABLE_RECIPES.map((r) => r.id).join(", ")}`);
  }
  if (!workspace || typeof workspace !== "string" || !workspace.trim()) {
    throw new Error("A valid workspace path is required.");
  }

  const execution = await runCleanup(workspace, provider);

  let headline = "";
  const metrics: RecipeMetric[] = [];
  const highlights: string[] = [];

  switch (recipe.id) {
    case "meeting-notes": {
      const textReports = execution.reports.filter((r) => r.category !== "Dataset");
      const totalTasks = textReports.reduce((sum, r) => sum + r.tasks.length, 0);
      const totalDecisions = textReports.reduce((sum, r) => sum + r.decisions.length, 0);
      const totalDeadlines = textReports.reduce((sum, r) => sum + r.deadlines.length, 0);
      headline = `Inventoried ${textReports.length} document${textReports.length === 1 ? "" : "s"} and extracted ${totalTasks} actionable task${totalTasks === 1 ? "" : "s"}.`;
      metrics.push(
        { label: "Notes Scanned", value: textReports.length },
        { label: "Tasks Extracted", value: totalTasks },
        { label: "Decisions", value: totalDecisions },
        { label: "Deadlines", value: totalDeadlines }
      );
      if (textReports.length === 0) {
        highlights.push("No text or Markdown documents found in the authorized workspace.");
      } else {
        for (const rep of textReports.slice(0, 5)) {
          if (rep.tasks.length > 0) {
            highlights.push(`${rep.source}: ${rep.tasks.length} task(s) detected`);
          } else {
            highlights.push(`${rep.source}: No actionable tasks detected`);
          }
        }
      }
      break;
    }
    case "duplicate-review": {
      headline = `Audited ${execution.filesProcessed} files; identified ${execution.duplicates} cryptographic duplicate${execution.duplicates === 1 ? "" : "s"}.`;
      metrics.push(
        { label: "Files Audited", value: execution.filesProcessed },
        { label: "Duplicates Found", value: execution.duplicates },
        { label: "Proposals Staged", value: execution.proposals.length },
        { label: "Est. Min Saved", value: execution.estimatedNetMinutesSaved.toFixed(1) }
      );
      const dupProposals = execution.proposals.filter((p) => p.reason.includes("Duplicate of"));
      if (dupProposals.length === 0) {
        highlights.push("Zero cryptographic duplicates detected. All scanned files are unique.");
      } else {
        for (const p of dupProposals.slice(0, 5)) {
          const filename = path.basename(p.sourcePath);
          highlights.push(`${filename}: ${p.reason}`);
        }
      }
      break;
    }
    case "organization-preview": {
      headline = `Generated ${execution.proposals.length} organization proposal${execution.proposals.length === 1 ? "" : "s"} across ${execution.filesProcessed} files.`;
      metrics.push(
        { label: "Files Processed", value: execution.filesProcessed },
        { label: "Move Proposals", value: execution.proposals.length },
        { label: "Categories", value: new Set(execution.reports.map((r) => r.category)).size },
        { label: "Est. Min Saved", value: execution.estimatedNetMinutesSaved.toFixed(1) }
      );
      if (execution.proposals.length === 0) {
        highlights.push("No file relocations proposed. Workspace is already organized or empty.");
      } else {
        for (const p of execution.proposals.slice(0, 5)) {
          const src = path.basename(p.sourcePath);
          const destRel = path.relative(execution.workspace, p.destinationPath);
          highlights.push(`Proposed: ${src} → ${destRel}`);
        }
      }
      break;
    }
    case "csv-audit": {
      const csvReports = execution.reports.filter((r) => r.category === "Dataset");
      headline = `Profiled ${csvReports.length} tabular dataset${csvReports.length === 1 ? "" : "s"} with deterministic verification.`;
      metrics.push(
        { label: "CSVs Profiled", value: csvReports.length },
        { label: "Total Files", value: execution.filesProcessed },
        { label: "Duplicates", value: execution.duplicates },
        { label: "Errors", value: execution.errors.length }
      );
      if (csvReports.length === 0) {
        highlights.push("No CSV files found in the specified workspace path.");
      } else {
        for (const rep of csvReports) {
          highlights.push(`${rep.source}: ${rep.summary}`);
        }
      }
      break;
    }
  }

  return {
    recipeId: recipe.id,
    recipeName: recipe.name,
    workspace,
    execution,
    summary: { headline, metrics, highlights },
    targetView: recipe.targetView
  };
}
