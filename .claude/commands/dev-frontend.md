---
description: Start the Vite frontend dev server on port 5173
---

Start the frontend dev server in the background:

```bash
cd frontend && npm run dev
```

Use Bash with `run_in_background: true`. After it's up, poll `http://127.0.0.1:5173/` until it returns 200, then report the background task ID.

The frontend proxies `/api/*` to `http://localhost:8001`, so the backend should be running first — if it isn't, mention that and offer to run `/dev-backend`.
