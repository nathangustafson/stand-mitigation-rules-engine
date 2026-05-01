---
description: Start the FastAPI backend on port 8001 with --reload
---

Start the backend dev server in the background:

```bash
source .venv/bin/activate && uvicorn app.main:app --reload --port 8001
```

Use Bash with `run_in_background: true`. After it's up, poll `http://127.0.0.1:8001/api/health` until it returns 200, then report the background task ID and the URL so I can stop it later.

Do not run this if a process is already listening on 8001 — surface that and ask before killing it.
