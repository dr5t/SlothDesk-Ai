# SlothDesk AI — Video Production & Engineering Notes

**Project:** SlothDesk AI  
**Event:** Hacktoberfest 2026 Open-Source AI Challenge — Week 3: Slow and Steady  
**Target Audience:** Open-source developers, productivity hackers, AI engineers, and hackathon judges  
**Output Deliverables Directory:** `artifacts/slothdesk-demo/`  

---

## 1. Video Specifications & Final Metrics

| Metric | Specification | Final Verified Value | Status |
| :--- | :--- | :--- | :--- |
| **File Name** | `SlothDesk-AI-Demo.mp4` | `SlothDesk-AI-Demo.mp4` | Verified |
| **Duration** | 90–120 seconds | **106.43 seconds (01:46.43)** | **Pass (Optimal)** |
| **Resolution** | 1920×1080 (16:9 Landscape) | 1920×1080 | Pass |
| **Video Codec** | H.264 (High Profile, progressive) | H.264 (`avc1`) | Pass |
| **Frame Rate** | 30.00 FPS | 30.00 FPS (3,190 frames) | Pass |
| **Video Bitrate** | High-definition web streaming | 397 kb/s (Variable Bitrate) | Pass |
| **Audio Codec** | AAC-LC Stereo | AAC-LC (2 channels, 44.1 kHz) | Pass |
| **Audio Bitrate** | Broadcast standard (192 kbps) | 192 kb/s | Pass |
| **Audio Mix** | Foreground Voice + Ducked Music | Dynamic ducking (-24dB speech, -17dB outro) | Pass |
| **Captions** | Burned-in Neo-Brutalist + Soft Track | Burned-in + `mov_text` Subtitle Track | Pass |
| **File Size** | Optimized web distribution | **7.60 MB** | Pass |

---

## 2. Production Pipeline & Tooling

The production was executed automatically using a headless pipeline:

1. **Browser Automation & Screen Recording:**
   - **Engine:** Puppeteer (running on Node.js v25.2.1) driving Google Chrome in headless mode at a locked 1920×1080 viewport.
   - **Cursor Emulation:** Virtual neo-brutalist mouse pointer with cubic easing curve interpolation, click ripple pulse effects, and dynamic coordinate tracking.
   - **Frame Capture & Encoding:** Uncompressed frame buffer streaming directly into a spawned `ffmpeg` 9.0.2 pipe at exact 30 FPS (`image2pipe`), eliminating dropped frames, desktop distractions, and window borders.

2. **Voice-Over Generation:**
   - **TTS Engine:** Microsoft Neural Text-to-Speech (`edge-tts`).
   - **Voice Model:** `en-US-ChristopherNeural` (warm, authoritative, confident developer-tool tone).
   - **Pacing:** Custom +3% rate adjustment for crisp, articulate technical narration.
   - **Alignment:** Microsecond-precision `WordBoundary` and `SentenceBoundary` extraction directly from the speech synthesis stream.

3. **Background Music & Sound Design:**
   - **Composition:** 100% original, royalty-free calm lo-fi instrumental bed synthesized using Python standard library `wave` and `struct`.
   - **Instrumentation:** Warm electric piano chord progression (Fmaj7 – Em7 – Dm7 – Cmaj7) at 80 BPM, acoustic sub-bass with natural second harmonics, and gentle organic woodblock percussion.
   - **Dynamic Ducking:** Programmatically ducked to 13% volume (-24dB) while speech is active, with a gentle opening fade-in and a warm outro swell (+11dB) fading into the closing frame.
   - **Licensing:** Fully original, public-safe, zero copyright or DMCA risk.

4. **Synchronized Captioning:**
   - **Burned-In Overlay:** Custom neo-brutalist caption banner rendered directly into the viewport during screen recording (`#demo-captions-overlay`). Styled with charcoal background (`#252321`), cream text (`#fffaf2`), and an orange hard shadow (`#f25c2a`).
   - **Subtitle File:** Exported `captions.srt` containing 22 short, readable cues matching spoken phrases with millisecond accuracy.
   - **Soft Subtitles:** Simultaneously multiplexed as an MPEG-4 `mov_text` subtitle stream for compatibility with QuickTime, VLC, and video platforms.

---

## 3. Shot-by-Shot Storyboard & Verification Timeline

### Scene 1 — Hook (00:00:00 → 00:00:11.33 | 11.33s)
- **Visuals:** Opening neo-brutalist hook card featuring the SlothDesk AI logo, Hacktoberfest 2026 challenge badge, core value proposition pill tags (*Streaming SHA-256 Hashing*, *Non-Destructive Dry Runs*, *Tamper-Resistant Rollback*), and a smooth transition into the live application hero.
- **Narration:** *"Stop doing the busywork. Keep control of your files. Every developer battles cluttered downloads, untracked duplicates, and messy workspace chaos."*
- **Verification:** Verified brand colors (`#f5f0e8`, `#252321`, `#f25c2a`), correct challenge naming, clear typography.

### Scene 2 — Meet SlothDesk AI (00:00:11.33 → 00:00:21.12 | 9.79s)
- **Visuals:** SlothDesk AI Dashboard. Top navigation bar showing verified runtime status (`LOCAL-FIRST · DETERMINISTIC ENGINE ACTIVE`), hero lede, and verified runtime activity cards. Smooth cursor glide and click on "Open workspace ↘".
- **Narration:** *"Meet SlothDesk AI: a calm, local-first productivity automation workbench that prepares inspectable workflow proposals while keeping you firmly in control."*
- **Verification:** Real application UI running live on `http://localhost:3147`.

### Scene 3 — Workspace Analysis (00:00:21.12 → 00:00:41.11 | 19.99s)
- **Visuals:** Cursor clicks `demo-workspace` preset chip, auto-filling `/tmp/slothdesk-demo`, then clicks `Run dry-run scan`. Millisecond scan output renders:
  - 4 files discovered and cataloged.
  - **Cryptographic Duplicate Detection:** Streaming SHA-256 hash match flags `meeting-notes.md` as identical to `duplicate-notes.txt`.
  - Prominent safety notice: *"Duplicate detected · Never deleted automatically"*.
  - **Grounded Signal Extraction:** Extracted tasks (e.g., `TODO: Send the revised agenda to the team.`), decisions, and deadlines with exact line numbers (`L4`, `L6`).
- **Narration:** *"Point SlothDesk to an authorized directory and launch a dry-run scan. In milliseconds, files are inventoried. Streaming SHA-256 hashing detects cryptographic duplicates without silent deletion, while grounded NLP extracts tasks, decisions, and deadlines with exact line numbers."*
- **Verification:** Zero fabrication. Real files scanned from the synthetic workspace; grounded quotes match exact file contents.

### Scene 4 — Automation Studio (00:00:41.11 → 00:00:56.59 | 15.48s)
- **Visuals:** Navigation to Automation Studio. Displays 4 active pipeline recipes:
  1. `Meeting Notes Action Item Extractor`
  2. `Cryptographic Duplicate Reviewer`
  3. `Safe Project Organization Preview`
  4. `CSV Tabular Data Auditor`
  Cursor runs dry-run on Recipe 03. Shows staged proposal summary. Scroll down shows planned roadmap capabilities (Git Commit History Auditor, OCR Receipt Triage) clearly badged as *"PLANNED FOR V0.2"*.
- **Narration:** *"In Automation Studio, four verified recipes turn routine file triage into dry-run previews, with future tools clearly marked for version zero point two. The rule is simple: AI proposes, but nothing executes until you say so."*
- **Verification:** Roadmap features are transparently disclosed; no mockups or false claims.

### Scene 5 — Review Center and Safety (00:00:56.59 → 00:01:14.52 | 17.93s)
- **Visuals:** Review Center approval gate. Staged proposals display explicit source and destination paths (e.g., `duplicate-notes.txt` → `actionable/duplicate-notes.txt`). Cursor clicks `Approve selected operations`. Server executes categorized moves. Cursor moves to `Rollback completed operations` and clicks it. Engine verifies destination SHA-256 hashes against original journal entries and restores files byte-for-byte to workspace root.
- **Narration:** *"In the Review Center, every proposed file move is staged with explicit source and destination paths. You select which operations to approve. Need to undo? A single click triggers tamper-resistant rollback, verifying hashes and restoring files byte-for-byte."*
- **Verification:** Real operations verified on disk; rollback restores original state with SHA-256 integrity check.

### Scene 6 — CSV Lab and Diagnostics (00:01:14.52 → 00:01:32.88 | 18.36s)
- **Visuals:** CSV Lab profiling `sales.csv` deterministically in pure TypeScript: 3 rows, 3 columns, 0 missing cells, 1 duplicate row detected (`Mina,84,East`), and inferred data types. Cursor navigates to Activity & Settings: AI Runtime & Provider Diagnostics card shows Ollama status, configured model `gemma3:4b`, and active fallback engine disclosure.
- **Narration:** *"CSV Lab profiles tabular data deterministically in pure TypeScript—surfacing row counts, duplicate entries, and data types with zero cloud leaks. Under Settings, transparent diagnostics clearly disclose whether local Gemma is active, or our deterministic engine is running."*
- **Verification:** Accurately states that deterministic local analysis was active, adhering strictly to model disclosure rules.

### Scene 7 — Closing & Call to Action (00:01:32.88 → 00:01:46.43 | 13.55s)
- **Visuals:** Polished branded closing frame featuring the SlothDesk AI mascot, neo-brutalist logo, live demo URL (`https://slothdesk-ai-o4mk.onrender.com/`), and GitHub repository URL (`https://github.com/dr5t/SlothDesk-Ai`). Smooth fade to black.
- **Narration:** *"Built for Hacktoberfest Week Three: Slow and Steady. Explore the live web demo on Render, run the workbench locally, and make automation safer. SlothDesk AI: calm automation."*
- **Verification:** Readable URL links, matching palette, smooth audio fade-out.

---

## 4. Technical Quality Assurance Audit

- [x] **File Existence:** Final video exists at `artifacts/slothdesk-demo/SlothDesk-AI-Demo.mp4` (7,780 KB).
- [x] **Container & Streams:** Valid MP4 container with H.264 video, AAC stereo audio, and `mov_text` subtitle track.
- [x] **Resolution & Frame Rate:** 1920×1080 resolution at continuous 30.00 FPS.
- [x] **Duration Alignment:** Video duration (106.43s) and audio duration (106.49s) match within 0.06s.
- [x] **Caption Accuracy:** 22 timestamped subtitle cues verified against spoken words in `captions.srt` and burned-in visual overlay.
- [x] **Audio Mixing:** Narration clearly audible in foreground; background music ducked to -24dB during speech, swelling to -17dB in outro; gentle 2-second fade-out.
- [x] **Safety & Disclosure:** No private paths, credentials, or personal data exposed; deterministic engine accurately identified; no false Gemma claims.
- [x] **Repository Integrity:** No application source code modified; git working tree clean.
