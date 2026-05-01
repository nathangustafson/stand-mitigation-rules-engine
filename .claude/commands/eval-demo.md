---
description: POST a canned high-risk observation to /api/evaluate and pretty-print the response
---

Send a canned high-risk observation to the running backend and pretty-print the JSON response.

Try the Vite proxy at `http://127.0.0.1:5173/api/evaluate` first (so it also exercises the proxy). If the frontend isn't running, fall back to `http://127.0.0.1:8001/api/evaluate` directly. If neither is up, tell me which I should start.

Payload:

```json
{
  "roof_type": "wood_shake",
  "wildfire_risk": "high",
  "window_type": "single_pane",
  "attic_vent_screen": "none",
  "vegetation": [
    {"type": "shrub", "distance_ft": 10},
    {"type": "tree", "distance_ft": 50}
  ]
}
```

Use `curl -fsS -X POST ... | python3 -m json.tool` so the output is readable.
