---
title: "SlothDesk AI: The Calm, Local-First Open-Weight Agent That Does the Desktop Busywork"
published: false
description: "A local-first productivity workbench that sorts files, extracts tasks, detects duplicates, profiles tabular data, and stages reversible moves using local Gemma 3 and deterministic safety."
tags: devchallenge, hf26challenge
---

> **Challenge Submission:** Hacktoberfest Open-Source AI Challenge — Week 3: Slow and Steady  
> **Repository:** [https://github.com/shauryatiwari/SlothDesk-Ai](https://github.com/shauryatiwari/SlothDesk-Ai)  
> **Prize Track Consideration:** Overall Winner & Best Use of Gemma  

---

## 1. What I Built & The Problem It Solves

Every knowledge worker has an unruly desktop or workspace directory: forgotten meeting notes, unorganized downloads, duplicate drafts, CSV exports, and ad-hoc scripts. We keep putting off organizing it because manually reading every document, deduplicating files, and sorting folders is tedious, repetitive busywork.

October 20 is **International Sloth Day**, and the theme for Week 3 of Hacktoberfest is **"Slow and Steady"**: *build something with open-source AI that rewards laziness and does the work so you don't have to*.

**SlothDesk AI** channels that philosophy into a calm, local-first automation workbench. It does the organizing you have been avoiding:

1. **Scans authorized folders only:** Strictly confined to a folder you explicitly designate.
2. **Detects cryptographic duplicates:** Identifies identical files via streaming SHA-256 hashes without deleting anything automatically.
3. **Extracts tasks, decisions, and deadlines:** Uses on-device open-weight AI (Google Gemma 3 via Ollama) or deterministic heuristics to pull action items with source line evidence.
4. **Profiles tabular datasets:** Audits CSV schemas, row counts, duplicate rows, and missing values directly in TypeScript without sending numbers to an LLM.
5. **Stages dry-run proposals:** Generates clean, collision-safe reorganization proposals with auto-disambiguating suffixes, then pauses.
6. **Requires human sign-off:** Server-authoritative approval gates prevent any unreviewed filesystem changes.
7. **Tamper-resistant rollback:** Every approved operation is journaled with pre-move file hashes, enabling safe, one-click reversal.
8. **Execution Inspector & Exportable Reports:** Lets you inspect every run's verified metrics and download audit reports in Markdown or JSON with path sanitization.

---

## 2. Why Open-Weight Models & Local Inference Matter

Desktop organization routinely involves confidential meeting transcripts, personal financial sheets, legal agreements, and unreleased source code. 

Sending an entire desktop folder to a remote proprietary cloud LLM API introduces severe privacy risks, variable cloud latency, recurring token fees, and vendor lock-in.

SlothDesk AI proves that modern **open-weight foundation models**—specifically Google's **Gemma 3 (4B)**—running locally on Ollama are the ideal architecture for desktop productivity:

- **Zero Data Egress:** Your files never leave your local storage drive. There are no outbound cloud calls transmitting document contents.
- **Inspectable Structured Schema:** By prompting Gemma with a strict JSON format constraint (`summary`, `tasks`, `decisions`, `deadlines`, `category`, `suggestedName`), output structure is guaranteed.
- **Offline Reliability:** Whether you are traveling on an airplane, working in a restricted corporate intranet, or disconnected from the internet, your desktop automation operates seamlessly.
- **Zero Token Billing:** Run scans on hundreds of notes without worrying about API quotas or monthly subscription costs.

---

## 3. Actual Model Inference vs. Deterministic Fallback

SlothDesk AI maintains complete transparency about which engine generated each finding. We strictly distinguish between **actual local model inference** and **deterministic heuristic extraction**:

| Capability | Actual Model Inference (Ollama / Gemma 3:4b) | Deterministic Fallback Heuristic |
| :--- | :--- | :--- |
| **Trigger** | Ollama daemon active on localhost with `gemma3:4b` installed. | Ollama daemon offline, unreachable, or missing configured model. |
| **Document Summaries** | Semantic synthesis of core document concepts into concise prose. | Structured extraction of document headlines and key sentences. |
| **Task & Decision Signals** | Contextual understanding of action items, decisions, and commitments. | Fast AST/regex pattern matching for `TODO:`, `Task:`, `Decision:`, `Deadline:`. |
| **Line-Level Evidence** | Grounded line reference matching verified against source document text. | Exact line number and textual excerpt matching. |
| **CSV Data Profiling** | *Delegated directly to deterministic profiler (LLM is bypassed).* | Pure TypeScript streaming parser (row counts, null counts, duplicate rows). |
| **UI & Export Labeling** | Badged as `Local Model (Gemma)` in Inspector and exported reports. | Badged as `Deterministic Heuristic Engine` in Inspector and reports. |

When Ollama is unavailable, SlothDesk AI does not fail or hang; it seamlessly transitions to deterministic mode and explicitly informs the user in the UI header and execution reports.

---

## 4. The "Lazy Payoff": Measured Runtime vs. Transparent Time Savings

Instead of fabricating artificial benchmark numbers, token counts, or speculative cost savings, SlothDesk AI records actual measured clock runtime and calculates estimated human time saved transparently:

```
Estimated Net Minutes Saved = Max(0, (Files Processed × 6.0) - Automated Minutes - (Proposals × 0.5))
```

- **Measured Automated Duration:** Clock time measured directly between scan start and completion (`(endedAt - startedAt) / 1000` seconds).
- **Manual Baseline:** Assumes a conservative human baseline of 6.0 minutes per document to open, read, deduplicate, and relocate files manually.
- **Review Overhead:** Deducts 0.5 minutes per staged proposal to account for human review before approval.
- **Clear Distinction:** The Execution Inspector and exported reports prominently distinguish between **measured clock duration** (seconds) and **projected human time saved** (minutes), explicitly citing the methodology.

---

## 5. Defensive Safety Engineering & Architecture

SlothDesk AI was engineered with defense-in-depth principles to prevent data loss:

```
[User Browser Interface]
        │
        ▼ (HTTP API / JSON)
[src/server.ts: Gateway & Inspector Endpoint]
        │
        ▼ (Boundary Check: safeWorkspacePath & realpath)
[src/workflow.ts: Execution Orchestrator]
        │
        ├───► [src/core.ts: Streaming SHA-256 Duplicate Detector]
        ├───► [src/core.ts: Pure TypeScript CSV Profiler]
        ├───► [src/provider.ts: Ollama Gemma 3 / Deterministic Fallback]
        │
        ▼ (Collision Disambiguation: auto -1, -2 suffixes)
[src/store.ts: Atomic JSON Store (.data/executions.json)]
        │
        ▼ (Explicit Review in Review Center)
[Server-Authoritative Approval Gate (/api/approve)]
        │
        ▼ (Destination Conflict & Symlink Checks)
[Filesystem Rename & Atomic Operations Journal (.data/operations.json)]
        │
        ▼ (One-Click User Rollback (/api/rollback))
[Rollback Engine: SHA-256 Hash Verification & Restored File Validation]
```

### Key Security Safeguards
1. **Path Traversal & Symlink Defense:** `safeWorkspacePath` rejects relative traversal (`../`, null bytes, absolute escapes). `approveOperations` and `rollbackExecution` verify canonical `fs.realpath` against the authorized workspace root to block symlink escapes.
2. **Server-Authoritative Approvals:** The client sends only execution UUID and approved proposal UUIDs. File paths are resolved from the server's atomic execution store, eliminating client path forgery.
3. **Collision Disambiguation:** Destination paths that already exist are automatically disambiguated with sequential suffixes (`notes-1.md`, `notes-2.md`) before proposals are staged.
4. **Tamper-Resistant Rollback:** Before restoring a file, the rollback engine verifies that the destination file matches its pre-move SHA-256 hash and confirms the original location is unoccupied, preventing accidental overwrites.
5. **Path Sanitization in Reports:** Exported reports mask private filesystem paths (`[authorized-workspace]`, relative filenames) and unconditionally redact API keys and stack traces.

---

## 6. Reproducible Demo Walkthrough

The repository includes a bundled synthetic workspace in `demo-workspace/`. Follow these verified steps to run the demo in under 2 minutes:

### Setup Isolated Demo Workspace
```bash
# 1. Clone repository and install dependencies
git clone https://github.com/shauryatiwari/SlothDesk-Ai.git
cd SlothDesk-Ai
npm install

# 2. Copy demo workspace to a fresh temporary directory
rm -rf /tmp/slothdesk-demo && cp -r demo-workspace /tmp/slothdesk-demo

# 3. Build and launch
npm run build
npm start
```

### The 9 Demonstration Steps
1. **Startup & AI Availability:** Open `http://localhost:3147`. The navigation bar shows the model status (`gemma3:4b` standby/verified or deterministic fallback).
2. **Workspace Scan:** In **Workspace**, enter `/tmp/slothdesk-demo` and click **Run dry-run scan**. Scans all 4 files in ~15 ms.
3. **Duplicate Detection:** Identifies that `meeting-notes.md` is a byte-for-byte cryptographic duplicate of `duplicate-notes.txt`.
4. **Task Extraction:** Pulls actionable items (`TODO: Send the revised agenda to the team.`, `Task: Review the onboarding copy.`, `Decision: Keep local inference as the default.`, `Deadline: Friday.`).
5. **CSV Profiling:** Open the **CSV Lab** tab to inspect `sales.csv` (3 rows, 3 columns, 1 duplicate row, 0 nulls).
6. **Dry-Run Proposals:** Inspect **Review Center**: 4 proposals staged (`actionable/`, `dataset/`, and duplicate review). On disk, no files have moved.
7. **Human Approval:** Select the 3 relocation proposals and click **Approve selected operations**. Verify on disk: files are relocated into `actionable/` and `dataset/`, while the duplicate remains safe in place.
8. **Execution History & Inspector:** Open **Activity & Settings**, click **Inspect Details ↘** to view verified metrics, and click **Export Markdown (.md) ⤓** or **Export JSON (.json) ⤓**.
9. **Rollback & Verification:** Return to **Review Center** and click **Rollback completed operations**. Verify on disk: all files are restored byte-for-byte to `/tmp/slothdesk-demo/`.

---

## 7. Automated Verification & Adversarial Test Suite

The codebase includes **63 automated unit, integration, and adversarial tests** that run in ~600 ms via Node.js native test runner:

```bash
npm test
```

Test coverage includes:
- **Workspace Bounds & Traversal:** Rejection of `../`, symlinks pointing outside workspace root, and escaping paths.
- **Tamper-Resistant Rollback:** Proof that rollback halts if a destination file was modified after the move or if the original path is occupied.
- **Server-Authoritative Approval:** Rejection of forged IDs, duplicate-review IDs, and replayed approvals.
- **Collision Safety:** Preservation of files with identical names across subdirectories.
- **Provider Status & Error Sanitization:** Verification that secrets (`sk-...`, `ghp_...`) and call stacks are never leaked.
- **Report Serialization & Missing Fields:** Verification of JSON and Markdown export stability on partial, malformed, or error execution records.

---

## 8. Honest Disclosures & Current Limitations

In adherence to challenge guidelines:
1. **Inference Verification:** Gemma 3:4b local model parsing was verified against Ollama API contracts and integration fixtures; when Ollama is offline or uninstalled, deterministic fallback runs end-to-end.
2. **Deployment Status:** Deployment configuration for Render (`render.yaml`) and hosted mode restrictions (`HOSTED_MODE=true` rejects local filesystem operations with HTTP 403) have been tested and verified locally; no public production URL is currently claimed as live.
3. **File Format Support:** Currently supports plain text (`.txt`), Markdown (`.md`, `.markdown`), CSV (`.csv`), and JSON (`.json`). PDF and DOCX parsing are reserved for future releases.
4. **No Fabricated Data:** Token usage, inference latencies, benchmarks, and sponsor tools are not fabricated.

---

## 9. Conclusion

SlothDesk AI proves that local open-weight AI and defensive engineering can work together to solve everyday desktop friction. By combining **Gemma 3**, **streaming SHA-256 deduplication**, **deterministic CSV profiling**, and **human-in-the-loop review gates**, it delivers calm, inspectable automation that respects user privacy and data ownership.
