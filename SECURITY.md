# Security

Please do not report security-sensitive issues in public issues. Until a private reporting channel is configured, contact the repository owner directly with a minimal reproduction and do not include private document contents.

The application is local-first by default. Do not expose the local server to an untrusted network without adding authentication, CSRF protection, request rate limiting, and an explicit hosted upload model. Keep `.env` and `.data/` out of version control.
