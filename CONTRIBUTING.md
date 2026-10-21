# Contributing to SlothDesk AI

Thank you for your interest in contributing to SlothDesk AI. This project adheres to high standards of code quality, security verification, and defensive engineering.

---

## Development Setup

1. **Prerequisites:** Install Node.js (version 20 or higher) and npm.
2. **Clone and Install:**
   ```bash
   git clone https://github.com/shauryatiwari/SlothDesk-Ai.git
   cd SlothDesk-Ai
   npm install
   ```
3. **Run the Test Suite:**
   ```bash
   npm test
   ```
4. **Build the Project:**
   ```bash
   npm run build
   ```

---

## Engineering Standards

- **Strict Type Safety:** All code must pass TypeScript compilation (`tsc`) with zero errors and no implicit `any` types.
- **Defensive Filesystem Operations:** Any new file operation must be verified against directory traversal (`safeWorkspacePath`), symlink escapes (`realpath`), and path occupation (`lstat`).
- **No In-Code Comments:** Write clean, self-documenting code with descriptive function and variable names. Place technical explanations and architectural rationales in Markdown documentation rather than source comments.
- **Server-Authoritative Control:** Client inputs must always be validated against server-persisted records. Never trust client-supplied paths or IDs.
- **Crash Resilience:** Ensure all persistence operations use atomic file replacement to prevent data corruption.

---

## Pull Request Guidelines

1. Include automated tests with every bug fix or feature addition.
2. Verify all existing tests continue to pass (`npm test`).
3. Never commit personal file paths, real user documents, `.env` files, or `.data/` directories.
4. Maintain truthful documentation. Never claim benchmarks, inference speeds, or integrations that cannot be independently reproduced.
