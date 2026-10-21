# SlothDesk AI: A Local-First Open-Weight Agent That Does the Busywork

> Draft only. No live URL, public repository URL, deployment result, benchmark, or external integration is claimed here.

## What I Built

SlothDesk AI is a local-first productivity workbench for turning a folder of notes and datasets into a reviewable action plan. The core demo scans a user-authorized workspace, summarizes supported documents, extracts explicit tasks and decisions, profiles CSV data, detects SHA-256 duplicates, and proposes reversible organization moves.

## Demo

Run `npm ci`, `npm test`, `npm start`, then use the synthetic files in `demo-workspace/`. The demo is local because hosted execution intentionally rejects arbitrary server filesystem paths.

## Code

Repository URL: to be added after the repository is published.

## How I Built It

The TypeScript server separates deterministic file safety from optional model inference. `core.ts` handles classification, workspace boundaries, hashing, and CSV profiling. `provider.ts` exposes an Ollama adapter configured for Gemma and falls back to deterministic extraction when the model is unavailable. `workflow.ts` records proposals, requires approval, journals completed moves, and supports rollback when the original path is free.

## Why Does Open Innovation Matter?

Local Ollama inference keeps document contents on the user's machine when the user has downloaded the model. The adapter is replaceable, the configured model is visible, and the app reports fallback mode rather than pretending a model was used.

## My Agent Session

This section should contain only genuine, permitted agent-session evidence added by the author.

## The Lazy Payoff

The application records measured workflow duration and labels manual-time assumptions as estimates. It calculates estimated net time saved as manual estimate minus measured processing and review estimates; it does not claim an independently verified benchmark.

## Prize Categories

Add only categories confirmed by the current challenge rules and the actual submitted implementation.

Tags: `devchallenge`, `hf26challenge`
