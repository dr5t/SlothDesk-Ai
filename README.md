# SlothDesk AI

SlothDesk AI is a local-first productivity automation workbench. It scans only a folder the user explicitly supplies, produces deterministic document/CSV reports, and optionally uses a locally running Ollama Gemma model for richer analysis. File changes are proposals first and require explicit approval.

## Run locally

```bash
npm install
npm test
npm run build
npm start
```

Open <http://localhost:3147>. To enable open-weight inference, install [Ollama](https://ollama.com), then run `ollama pull gemma3:4b` and start Ollama. The app continues with deterministic local analysis when Ollama or the configured model is unavailable.

Environment variables are documented in [.env.example](./.env.example). The default model is configurable; no proprietary API is required. `HOSTED_MODE=true` disables local path scanning so a public deployment cannot be used to probe its server filesystem; hosted uploads need a separate authenticated upload endpoint.

## Safety model

The server reads only the explicitly entered workspace. It validates all derived paths against that workspace, hashes files with SHA-256 for duplicate detection, skips oversized files, never deletes files, and never overwrites an existing destination. The workflow stores an execution journal under `.data/`. Treat document text as untrusted data: it cannot grant the model or application additional permissions.

The current prototype supports TXT, Markdown, CSV, and JSON. PDF extraction, durable rollback, authentication, hosted uploads, TabPFN, Sentry, and Render deployment configuration remain intentionally unimplemented until their runtime and security contracts are tested.

## Architecture

- `src/core.ts`: deterministic file classification, workspace boundary checks, hashing, and CSV profiling.
- `src/provider.ts`: `ModelProvider` adapter and Ollama/Gemma integration with schema-checked JSON and deterministic fallback.
- `src/workflow.ts`: dry-run workflow, proposal journal, approval-gated moves, and transparent time estimates.
- `src/server.ts`: small local HTTP API and static UI.
- `public/`: responsive editorial UI with real health, scan, report, and approval states.

## Limitations and roadmap

This is a functional foundation for the five-minute demo, not a hosted multi-user product. It intentionally does not expose arbitrary local filesystem access from a public deployment. Next steps are authenticated hosted uploads, SQLite persistence, richer rollback journaling, PDF extraction, cancellation, request rate limiting, and an independently tested optional TabPFN adapter. Predictions are never fabricated when TabPFN is unavailable.

## License

No license has been selected yet. Add one after the project owner confirms the intended permissions and contribution policy.
