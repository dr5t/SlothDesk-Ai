# Deployment

## Local mode

Run `npm ci`, `npm run build`, and `npm start`. Local mode can scan only paths supplied by the user on the same machine and can connect to Ollama at `OLLAMA_BASE_URL`.

## Render

`render.yaml` is a deployment template:

```bash
render deploy
```

The template sets `HOSTED_MODE=true`. In hosted mode, `/api/cleanup` rejects local filesystem paths by design. A production hosted workflow still needs an authenticated upload endpoint, per-user workspace isolation, rate limiting, and persistent storage before it should accept user data.

The current app writes execution history to `.data/`. Render services have ephemeral disks by default, so history is not durable across restarts. Add a Render persistent disk or replace the JSON store with a managed database before claiming durable hosted history. No deployment URL is claimed because deployment has not been run from this repository.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3147` | HTTP port |
| `HOSTED_MODE` | `false` | Reject local path scanning when `true` |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama endpoint |
| `OLLAMA_MODEL` | `gemma3:4b` | Configured Gemma model identifier |
| `MAX_FILE_BYTES` | `1048576` | Per-file scan limit |
| `DATA_DIR` | `.data` | Directory for execution history and operation journals |

