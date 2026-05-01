# CLAUDE.md

Guidance for Claude Code working in this repository.

## Project context

POC for the Stand Mitigation Database take-home — a wildfire-mitigation rules engine. Brief: `docs/Stand Mitigation Database Take Home (Revised).pdf`. Read it before non-trivial design decisions.

Two surfaces: FastAPI backend (`app/`) and a React + MUI single-page frontend (`frontend/`). SQLite via SQLModel; no Alembic. No auth. The role toggle (Underwriter / Applied Sciences) is a view-state switch, not a permission system.

**Status:** Slices A through D complete. The brief's POC objective — process an observation, identify vulnerabilities, suggest Full + Bridge mitigations with bridge count tracked — is fulfilled end-to-end. Remaining items (rule testing UI, time-based versioning) are explicit Future Works.

## Ports (non-default — keep in sync on both sides)

- Backend: **8001**, all routes under `/api`.
- Frontend dev server: **5173**, with Vite proxy `/api/*` → `http://localhost:8001`.

## Common commands

```bash
# backend
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
pytest                                              # 29 tests
pytest tests/test_rules.py::test_create_logical_rule_with_nested_clauses
ruff format . && ruff check .

# frontend (from frontend/)
npm install
npm run dev                                         # 5173
npx tsc -b --noEmit                                 # type check
npm run build                                       # tsc + vite build

# docker (single container, full app at :8001)
docker build -t mitigation-rules-engine .
docker run --rm -p 8001:8001 mitigation-rules-engine
```

Project slash commands: `/dev-backend`, `/dev-frontend`, `/test`, `/eval-demo`.

## Architecture

```
app/
  main.py                   FastAPI app + lifespan (init_db + seed_all)
  db.py                     SQLite engine + Session + init_db()
  seed.py                   idempotent seed for the field registry and the
                            three brief rules; only runs when tables empty
  api/routes/               one module per resource, composed in __init__.py
    health.py
    properties.py           CRUD on /api/properties
    observation_fields.py   CRUD on /api/observation-fields (the registry)
    observations.py         GET / POST history; PATCH replaces values;
                            POST /{oid}/evaluate runs the engine
    rules.py                CRUD on /api/rules with nested mitigations
  models/
    property.py             Property SQLModel + create/update DTOs
    observation.py          ObservationField (registry) + Observation
                            (values is a JSON column)
    rule.py                 Rule + Mitigation SQLModels +
                            BooleanRuleBody | LogicalRuleBody |
                            ParameterizedRuleBody Pydantic discriminated
                            union for body validation on write
    evaluation.py           Vulnerability + EvaluationResult response models
  repository/               session-backed CRUD per resource
  services/
    observation_validation  walks observation values against the registry;
                            422s on unknown keys / wrong types
    rule_evaluator          DB-free pure evaluator. evaluate(values, rules) →
                            EvaluationResult covering all three rule body
                            types, including per-list-item iteration for the
                            parameterized Windows-style rule
data/app.db                 SQLite (gitignored, instance state)
docs/                       project brief
frontend/src/
  api/client.ts             axios + every typed CRUD function
  pages/                    HomePage, PropertiesListPage, PropertyDetailPage,
                            manage/RulesListPage, manage/FieldsManagePage
  components/               ConfirmDialog, PropertyFormDialog, UserTypeMenu,
                            ObservationCaptureForm, EvaluationResultView,
                            manage/RuleFormDialog (Visual + JSON tabs),
                            manage/ClauseEditor (recursive logical-clause UI),
                            manage/FieldFormDialog,
                            manage/JsonEditor
  App.tsx                   AppBar + role-aware nav + Routes
  types.ts                  UserType union + labels
tests/                      pytest with conftest in-memory SQLite + seed
```

## Key patterns and gotchas

- **Registry-driven observation schema.** `ObservationField` rows define fields; observations store their values as a JSON dict, validated on write against the registry. The Underwriter capture form renders entirely from `GET /api/observation-fields` — adding a new field via Applied Sciences (or a SQL insert) makes it appear in the form on next page load with no code changes. Demonstrating that is a key differentiator. Don't hardcode field names in the form.
- **Rule.body is a discriminated union by `type`.** `boolean | logical | parameterized`. Logical clauses recurse: `equals | in | all_of | any_of`. Parameterized has `base + modifiers + compare_field + compare_op` matching the brief's Windows rule. Bodies are stored as JSON; validated by Pydantic on write only.
- **The rule editor has Visual + JSON tabs for `logical` rules.** The Visual tab is a recursive `ClauseEditor` that composes `equals / in / all_of / any_of` with field/value dropdowns sourced from the registry; the JSON tab is the same syntax-validated textarea used for `boolean` and `parameterized`. Boolean and parameterized bodies are JSON-only today (Future Works has the structured-editor follow-up for them).
- **Mitigations are children of rules**, with `tier: 'full' | 'bridge'`. PATCH on a rule replaces the entire mitigations list (cascade-delete-orphan). Don't try to diff mitigations partially.
- **Time on observations.** `captured_at` is the data's "as of" timestamp. PATCHing values does not change `captured_at` — that's intentional for the brief's time-based-versioning user story.
- **Routes go under `/api`.** The prefix is on the composed router in `app/api/routes/__init__.py`. The `routes/` package is split per resource; new endpoints add a module + include it in `__init__.py`.
- **Role gating.** `userType` lives in `App.tsx` `useState`, default `'underwriter'`. Manage routes (`/manage/*`) redirect home if the role is wrong. Underwriter routes (`/properties/*`) are accessible to either role today — that may tighten later.
- **SPA fallback in Docker.** `app/main.py` adds a catch-all `GET /{full_path:path}` that returns `frontend_dist/index.html` when the bundle is present. `/api/*` is registered before it so APIs always win. The fallback is skipped in local dev because `frontend_dist/` doesn't exist there.
- **Pinned versions.** React 18.3 + MUI 5.x + `react-router-dom@6`. The Vite scaffold defaults to React 19 / MUI 9 — we explicitly downgraded. Don't bump.
- **Docker uses `npm install`, not `npm ci`.** macOS-generated lock files strip Linux-only optional deps (`@emnapi/*`); `npm install` tolerates the mismatch and lets cross-platform builds work without regenerating the lock.
- **Don't kill the user's running Docker instance during verification.** The user keeps a container alive on port 8001 between turns to refresh the browser. When you need to verify a Docker change, rebuild the image and restart the container detached (no `--rm` removal at the end), leave it running, and let the user know it's been restarted with the new image. If you stop a container at the end of verification, the user has to manually `docker run` again — that's friction they explicitly want avoided.

## Testing

`tests/conftest.py` builds an in-memory SQLite per test, seeds the field registry and the three rules, overrides FastAPI's `get_session`, and yields a `TestClient`. New endpoint tests follow the existing pattern — no fixtures needed beyond `client`.

## Out of scope (Future Works in README)

See README's "Future works" section. Headlines: structured editors for boolean / parameterized bodies, severity decoupled from priority, clearer `any_of` failure messaging, versioned rule edits (true effective_from/effective_to), mitigation ranking + actionable steps, polygon geometry, auth, CI, bundle splitting.
