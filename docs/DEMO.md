# Five-Minute Demo Guide

Follow these exact steps to reproduce the demo:

### 1. Prepare the Demo Workspace

Copy the bundled synthetic workspace to a temporary folder to preserve the source files:

```bash
cp -r demo-workspace /tmp/slothdesk-demo
```

### 2. Build and Start the Application

```bash
npm run build
npm start
```

Open `http://localhost:3147` in your browser.

### 3. Check Inference Status

In the header and Workspace view, check the status badge:
- **`READY · Local model is ready.`** (if Ollama is running with `gemma3:4b`).
- **`FALLBACK · Ollama is unavailable; deterministic local analysis is active.`** (if Ollama is not running).

### 4. Execute the Dry-Run Scan

1. Navigate to the **Workspace** tab.
2. Enter `/tmp/slothdesk-demo` into the **Authorized folder path** input.
3. Click **Run dry-run scan**.
4. Observe the results:
   - 4 files inventoried.
   - 1 SHA-256 duplicate identified (`meeting-notes.md` is identical to `duplicate-notes.txt`).
   - 3 actionable tasks extracted.
   - Transparent time savings estimate calculated from actual execution duration.
   - 4 proposals generated (3 category moves into `actionable/` and `dataset/`, and 1 duplicate review flag).

### 5. Inspect CSV Profiling

Click the **CSV Lab** tab to see deterministic tabular profiling for `sales.csv` (rows, columns, duplicate rows, missing values, column data types) without sending data to any external service.

### 6. Review and Approve Proposals

1. Navigate to **Review Center**.
2. Deselect any proposal you wish to exclude, or keep all selected.
3. Click **Approve selected operations**.
4. Verify on disk: files are cleanly relocated to their categorized subdirectories (`actionable/` and `dataset/`).

### 7. Test Safe Rollback

1. Click **Rollback completed operations** in Review Center.
2. Verify on disk: all moved files are safely restored to `/tmp/slothdesk-demo/`.
3. Check the **Activity & Settings** tab to view the persisted execution record.

