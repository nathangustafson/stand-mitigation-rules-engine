---
description: Run backend tests, frontend type check, and ruff lint
---

Run the project's full local check, in this order, and report failures with file paths and line numbers:

1. `pytest` from the project root (activate `.venv` first if needed)
2. `cd frontend && npx tsc -b --noEmit` for the frontend type check
3. `ruff check .` and `ruff format --check .` from the project root

Stop on the first hard failure and surface the actual output. If everything passes, summarize in one line.
