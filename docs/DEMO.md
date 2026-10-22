# SlothDesk AI: Five-Minute Reproducible Demo Guide

This guide walks through the 9 key capabilities of SlothDesk AI using the bundled synthetic demo workspace.

---

## Preparation: Safe Isolated Workspace Setup

To protect your personal files, copy the synthetic demo workspace to a temporary directory:

```bash
# 1. Copy demo workspace to a fresh isolated temporary folder
rm -rf /tmp/slothdesk-demo && cp -r demo-workspace /tmp/slothdesk-demo

# 2. Verify the 4 initial demo files
ls -la /tmp/slothdesk-demo
```

Initial files:
- `meeting-notes.md` (123 bytes: launch sync notes with tasks, decisions, and deadlines)
- `duplicate-notes.txt` (123 bytes: byte-for-byte cryptographic duplicate of `meeting-notes.md`)
- `project-notes.txt` (92 bytes: onboarding tasks and scope decision)
- `sales.csv` (56 bytes: small tabular dataset with a duplicate row)

---

## Starting the Application

```bash
# 1. Build TypeScript and start local server
npm run build
npm start
```

Open `http://localhost:3147` in your browser.

---

## 9-Step Verification Walkthrough

### Step 1: Application Startup and Actual AI Availability
- **Observation in UI:** Look at the top navigation bar and **Workspace** tab.
  - If Ollama is running locally with `gemma3:4b`: status shows `LOCAL-FIRST · gemma3:4b (STANDBY/VERIFIED)`.
  - If Ollama is offline or uninstalled: status badge immediately displays `FALLBACK · DETERMINISTIC ENGINE ACTIVE`.
- **API Verification:**
  ```bash
  curl -s http://localhost:3147/api/health
  ```
  Expected JSON: returns `connected`, `available`, `model: "gemma3:4b"`, and `inferenceVerified`.

### Step 2: Workspace Scan and File Inventory
- **Action:** In the **Workspace** tab, enter `/tmp/slothdesk-demo` into the **Authorized folder path** input (or click **Use Demo Workspace preset**), then click **Run dry-run scan**.
- **Observation:**
  - 4 files discovered, scanned, and categorized.
  - Measured runtime displayed in seconds.
  - Safe boundary check verifies all files reside strictly inside the authorized path.

### Step 3: Cryptographic Duplicate Detection
- **Observation:**
  - SlothDesk AI identifies that `meeting-notes.md` is identical to `duplicate-notes.txt` via streaming SHA-256 cryptographic hashing.
  - A `duplicate_review` proposal is created with reason: `Duplicate of duplicate-notes.txt; review before removal.`
  - A prominent safety notice confirms that file deletion is **never automated**.

### Step 4: Document Task and Decision Extraction
- **Observation:**
  - Action items extracted across text and markdown notes:
    - Task: `TODO: Send the revised agenda to the team.` (from `meeting-notes.md` and `duplicate-notes.txt`)
    - Task: `Task: Review the onboarding copy.` (from `project-notes.txt`)
    - Decision: `Decision: Keep local inference as the default.`
    - Decision: `Decision: Use a smaller demo workspace for the recording.`
    - Deadline: `Deadline: Friday.`
  - Line numbers and grounded evidence are recorded for each signal.

### Step 5: Deterministic CSV Profiling
- **Action:** Click the **CSV Lab** tab in the navigation bar.
- **Observation:**
  - Profiles `sales.csv` deterministically in pure TypeScript without model overhead or cloud leaks:
    - **Rows:** 3 (including 1 duplicate row: `Mina,84,East`)
    - **Columns:** 3 (`name`, `score`, `region`)
    - **Missing cells:** 0
    - **Inferred column data types:** `name` (string), `score` (number), `region` (string)

### Step 6: Dry-Run Reversible Proposals
- **Observation:**
  - In **Review Center**, 4 staged proposals are displayed:
    1. `duplicate-notes.txt` → `actionable/duplicate-notes.txt` (`categorize_move`)
    2. `project-notes.txt` → `actionable/project-notes.txt` (`categorize_move`)
    3. `sales.csv` → `dataset/sales.csv` (`categorize_move`)
    4. `meeting-notes.md` → `meeting-notes.md` (`duplicate_review`)
  - **Verify on disk:** Check `/tmp/slothdesk-demo`: no files have moved. All files remain in their original positions.

### Step 7: Server-Authoritative Human Approval Gate
- **Action:**
  - In **Review Center**, keep the 3 categorization proposals selected (duplicate review is unchecked by default).
  - Click **Approve selected operations**.
- **Observation:**
  - The server verifies execution UUID and proposal UUIDs before executing filesystem moves.
  - **Verify on disk:**
    ```bash
    ls -R /tmp/slothdesk-demo
    ```
    - `actionable/duplicate-notes.txt`
    - `actionable/project-notes.txt`
    - `dataset/sales.csv`
    - `meeting-notes.md` (safely preserved in place)

### Step 8: Execution History and Inspector Export
- **Action:**
  - Navigate to **Activity & Settings**.
  - In the **Execution History** card, click **Inspect Details ↘**.
- **Observation:**
  - The **Execution Inspector** opens displaying verified data:
    - Execution ID
    - Start time and measured duration in seconds
    - Files processed (4), Duplicates (1), Proposals (4)
    - Operations: 3 completed, 0 failed, 0 rolled back
    - Actual processing provider (`Local Model (Gemma)` or `Deterministic Heuristic Engine`)
    - Transparent human time savings estimate (~22.5 min) with explicit calculation methodology
  - **Exporting Reports:**
    - Click **Export Markdown (.md) ⤓** to download the sanitized markdown report.
    - Click **Export JSON (.json) ⤓** to download the structured machine-readable payload.
    - Unchecking "Sanitize local filesystem paths" allows local users to view raw paths when needed.

### Step 9: Tamper-Resistant Rollback and Verification
- **Action:**
  - Return to **Review Center** (or open the execution in Review Center from the Inspector) and click **Rollback completed operations**.
- **Observation:**
  - The rollback engine verifies destination SHA-256 hashes against original journal entries to ensure files were not modified after the move.
  - Files are moved back to their original root locations.
  - **Verify on disk:**
    ```bash
    ls -la /tmp/slothdesk-demo
    ```
    All 4 files (`duplicate-notes.txt`, `meeting-notes.md`, `project-notes.txt`, `sales.csv`) are restored byte-for-byte to `/tmp/slothdesk-demo/`.
  - Execution status transitions to `ROLLED_BACK`.

---

## Headless CLI Verification (Single Command)

To verify the entire 9-step sequence automatically in under 2 seconds:

```bash
node -e '
const { server } = require("./dist/server.js");
const fs = require("node:fs/promises");
const path = require("node:path");

async function verify() {
  await fs.rm("/tmp/slothdesk-demo", { recursive: true, force: true });
  await fs.cp("demo-workspace", "/tmp/slothdesk-demo", { recursive: true });
  await new Promise(r => server.listen(3992, "127.0.0.1", r));
  const base = "http://127.0.0.1:3992";

  const health = await (await fetch(`${base}/api/health`)).json();
  console.log("1. Health OK:", health.ok, "Model:", health.model.model);

  const scan = await (await fetch(`${base}/api/cleanup`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspace: "/tmp/slothdesk-demo" })
  })).json();
  console.log("2-6. Scan OK. Files:", scan.filesProcessed, "Duplicates:", scan.duplicates, "Tasks:", scan.tasksExtracted, "Proposals:", scan.proposals.length);

  const toApprove = scan.proposals.filter(p => p.sourcePath !== p.destinationPath).map(p => p.id);
  const approve = await (await fetch(`${base}/api/approve`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ executionId: scan.id, approvedIds: toApprove })
  })).json();
  console.log("7. Approved operations:", approve.results.length);

  const inspect = await (await fetch(`${base}/api/executions/${scan.id}`)).json();
  console.log("8. Inspector metrics:", inspect.metrics.completed, "completed, Provider:", inspect.metrics.providerName);

  const rollback = await (await fetch(`${base}/api/rollback`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ executionId: scan.id })
  })).json();
  console.log("9. Rollback completed:", rollback.results.length, "operations rolled back.");

  const restored = await fs.readdir("/tmp/slothdesk-demo");
  console.log("Restored files on disk:", restored.filter(f => !f.startsWith(".")));
  server.close();
}
verify();
'
```
