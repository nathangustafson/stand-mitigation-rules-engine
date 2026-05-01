# Mitigation Rules Engine

POC for the Stand Mitigation Database take-home: a tool that takes a property observation, evaluates it against a set of underwriting rules, and returns vulnerabilities + recommended mitigations split into Full vs Bridge tiers (with bridge-mitigation count tracked).

Project brief: [`docs/Stand Mitigation Database Take Home (Revised).pdf`](docs/Stand%20Mitigation%20Database%20Take%20Home%20%28Revised%29.pdf).

## Problem Framing

Stand's underwriting process relies on a growing set of parameterized rules that are:

- Complex to interpret manually
- Continuously evolving
- Difficult to evaluate consistently at scale

This POC explores a rules engine that:

1. Evaluates structured property observations against underwriting rules
2. Identifies vulnerabilities
3. Produces actionable mitigation strategies (Full vs Bridge)
4. Supports time-based rule evaluation

The goal is not just correctness, but to validate whether this system can become a scalable foundation for underwriting workflows.

## Status — POC Complete

This implementation fulfills the full POC scope:

- Processes structured property observations
- Evaluates them against a flexible rule system
- Identifies vulnerabilities
- Produces Full and Bridge mitigation strategies
- Tracks bridge mitigation counts
- Supports time-based rule evaluation (`as_of`)

Both Underwriter and Applied Sciences workflows are implemented end-to-end, including rule management, observation capture, and evaluation.

| Area                                                                          | Status        |
| ----------------------------------------------------------------------------- | ------------- |
| Project scaffolding (FastAPI + React + Docker + tests + lint + git)           | ✅ done        |
| Property CRUD with delete-confirmation modal (Underwriter)                    | ✅ done        |
| Registry-driven observation capture (Underwriter)                             | ✅ done        |
| Observation history per property + edit                                       | ✅ done        |
| Rule schema (boolean / logical / parameterized) + Rule CRUD (Applied Sciences)| ✅ done        |
| Field-registry CRUD with deprecation toggle (Applied Sciences)                | ✅ done        |
| Rule-evaluation engine producing vulnerabilities + Full/Bridge mitigations    | ✅ done        |
| Underwriter inline evaluation panel + result view with bridge count           | ✅ done        |
| Demo data: auto-seed on startup + on-demand "Load demo data" button           | ✅ done        |
| Rule testing / validation interface (Applied Sciences)                        | ✅ done        |
| Editable observation `captured_at` (editable on capture or later)             | ✅ done        |
| Time-based rule versioning (`as_of` filter on `/evaluate` + "Rules as of" picker) | ✅ done    |

68 backend pytest tests passing · 15 unit tests on the pure evaluator · ruff + tsc clean · Docker single-container build green.

## Overview of selected stack

- **Backend** — Python 3.11, FastAPI, **SQLModel** (Pydantic-native ORM on top of SQLAlchemy), SQLite (`data/app.db`). The Pydantic-native ORM lets the same class describe the SQL row, the request body, and the response schema, which keeps the rule-body discriminated unions consistent across all three layers without extra translation code.
- **Frontend** — React 18 + TypeScript, Vite, MUI v5 (pinned), `react-router-dom@6`, axios. No global state library — `useState` lifted to `App.tsx` is enough at this scope.
- **Tooling** — ruff for Python format + lint, tsc for TypeScript, pytest, Docker (multi-stage; Node 24-slim builds the bundle, Python 3.11-slim serves it).
- **Storage** — SQLite via SQLModel. The field registry, four rules, and four demo properties (each with at least one observation, covering a high-risk / compliant / every-mitigation-visible / mixed scenario) are seeded by `app/seed.py` on startup; the demo seed is idempotent on `Property.nickname` so reviewer-added properties are untouched. No Alembic — `init_db()` creates tables on lifespan startup, with idempotent `ALTER TABLE` migrations for columns added later (`Mitigation.created_at`, `ObservationField.value_labels`, `Rule.severity`).

## Architecture overview

```
app/
  main.py                          FastAPI app + lifespan that calls init_db() and seed_all()
  db.py                            engine + Session factory + init_db() + idempotent migrations
  seed.py                          idempotent seed for the field registry and brief rules
  api/routes/                      one router per resource, composed in routes/__init__.py
    health.py
    properties.py                  GET/POST/PATCH/DELETE /api/properties
    observation_fields.py          GET/POST/GET-by-id/PATCH/DELETE /api/observation-fields
    observations.py                GET/POST/PATCH /api/properties/{id}/observations[/{oid}]
    rules.py                       GET/POST/GET-by-id/PATCH/DELETE /api/rules
  models/
    property.py                    Property SQLModel + create/update DTOs
    observation.py                 ObservationField + Observation SQLModels (values is JSON)
    rule.py                        Rule + Mitigation SQLModels + Pydantic discriminated
                                   union for rule.body (boolean | logical | parameterized)
  repository/                      thin per-resource session-backed CRUD
  services/
    observation_validation         walks observation values against the registry on write
    rule_evaluator                 pure DB-free evaluator over rule + field registry
    observation_chain              merges sparse observations into effective values
data/
  app.db                           SQLite (instance state, gitignored)
docs/                              the project brief
frontend/src/
  api/client.ts                    axios wrapper + all typed CRUD calls
  pages/                           HomePage, PropertiesListPage, PropertyDetailPage,
                                   manage/RulesListPage, manage/RuleDetailPage,
                                   manage/FieldsManagePage
  components/                      ConfirmDialog, PropertyFormDialog, Breadcrumbs,
                                   ObservationCaptureForm, EvaluationResultView,
                                   PropertyEvaluationPanel, PropertyObservationsView,
                                   manage/RuleFormDialog, manage/ClauseEditor,
                                   manage/FieldFormDialog, manage/JsonEditor,
                                   manage/RuleTestCard, manage/MitigationCard
  App.tsx                          AppBar + role-aware nav + Routes
  types.ts                         UserType union + labels
tests/                             pytest with in-memory SQLite fixture per test
.github/workflows/ci.yml           CI: pytest + ruff + tsc + vite build + docker build
```

**Patterns**
- *Repository per resource* — each route module receives a session, instantiates a repository, and never calls SQLAlchemy directly. Keeps routes readable.
- *Registry-driven observation schema* — `ObservationField` rows define which keys exist, their types, allowed values, units, group labels, and (for `list_of_object` types) child item schemas. The capture form on the Underwriter side renders dynamically from the registry. **A reviewer can add a new observation key by inserting a registry row — no code change.**
- *Discriminated-union rule bodies* — `Rule.body` is a JSON column; on write the API parses through a `BooleanRuleBody | LogicalRuleBody | ParameterizedRuleBody` discriminated union, so malformed bodies 422 before they're stored. Logical clauses recurse arbitrarily deep through `equals | in | all_of | any_of`.
- *Role-gated routes, not auth* — `userType` is a single piece of `App.tsx` state with two values (`underwriter`, `applied_sciences`). The AppBar has two role nav buttons that switch the role and navigate home. Routes for the wrong role redirect home. There is no real auth; the role buttons are a view toggle.
- *Cascade delete* on Rule→Mitigation. Mitigation lists are replaced wholesale on PATCH, not diffed.
- *SPA-friendly Docker serve* — FastAPI serves the built frontend at `/`, with a catch-all that returns `index.html` for any non-`/api/*` path so deep links survive reload. The catch-all only activates if `frontend_dist/` exists, so local dev is unaffected.

## Key Design Insight

The system is **registry-driven**:

- Observation schema is defined in the database, not code
- Rules operate over dynamic fields
- New inputs can be introduced without redeploying the system

This allows the rules engine to evolve alongside underwriting requirements without engineering bottlenecks.

## High-level functionality overview

### Underwriter
- See a list of properties.
- Create a new property (street / unit / city / state / ZIP, optional nickname).
- Edit a property; delete a property with a confirmation modal.
- On a property detail page, capture observation data through a form rendered dynamically from the field registry. Six fields seed automatically — the brief's five (Attic Vent screen, Roof type, Window type, Wildfire risk category, Vegetation as a list of `{type, distance_to_window_ft}`) plus `home_to_home_distance_ft` to support the Home-to-home rule.
- See an observation history for the property, expand any entry to view the captured values, edit any prior entry. Both the values *and* `captured_at` are editable on PATCH — useful for recording observations after the fact, or correcting a date.

### Applied Sciences (click "Applied Sciences" in the AppBar)
- See a list of rules; type chip indicates boolean/logical/parameterized; severity chip indicates low/medium/high; toggle enabled inline.
- Create / edit / delete rules. Editor has structured inputs for name / description / priority / severity / enabled, a Visual editor for logical clauses (recursive AND/OR with field+value pickers sourced from the registry) plus a JSON tab for the raw shape, a JSON editor for boolean and parameterized bodies, and a structured mitigations sub-editor (tier select, name, description, optional effect).
- On the rule detail page, a **Rule test card** lets the AS user paste an observation `values` dict and run the single rule against it without touching real observations or the full rule set — fast feedback while authoring.
- See a list of observation fields; add new fields, edit labels / groups / sort order / allowed values / value labels / item schema, deprecate (soft-hide) or delete (hard).
- Four rules are seeded: Attic Vent ember-rated (boolean), Roof class (logical with nested `any_of` / `all_of` / `equals` / `in`), Home-to-home distance (parameterized `≥ 15 ft` threshold, no mitigations — the brief flags this as an unmitigatable property characteristic), and Windows safe distance (parameterized with the modifier table from the brief — base 30ft, ×3 single, ×2 double, ÷2 shrubs, ÷3 grass, plus all five mitigations).

### Evaluation (Underwriter)
- The property detail page has an **Evaluation panel** that auto-runs whenever an observation is selected from the history — no button to click. The panel shows count chips (rules evaluated, vulnerabilities, bridge count), an optional **"Rules as of"** date picker for time-based evaluation (rules and mitigations created after the chosen date are excluded), and one card per vulnerability.
- Each vulnerability card shows: rule name + severity chip + the rule's description, a severity-tinted **"Why it failed"** callout with the specific reason (e.g. *"Vegetation #1 (Type=Shrub, Distance to window=5 ft): Distance to window is 5 ft — required: at least 45 ft."*), and the rule's recommended mitigations indented underneath — full and bridge tiers as separate groups inside the card so each action is visually attached to the vulnerability it addresses.
- The evaluator handles all three brief rule shapes: boolean equality, recursive logical clauses (with a clear `"None of the alternatives held — needed any of: (a) ...; (b) ..."` message when an `any_of` group fails), and parameterized rules with multiply/divide modifiers and per-list-item iteration (the Windows safe-distance rule).
- Severity is set per-rule (low / medium / high), independent of priority. Disabled rules are skipped.

## Development Approach

This project was executed as a timeboxed spike, following a structured progression:

1. **Requirement Review**
   - Identified core system responsibilities: observation ingestion, rule evaluation, mitigation output
   - Scoped to support multiple rule types (boolean, logical, parameterized)

2. **Project Setup**
   - Established backend (FastAPI + SQLModel) and frontend (React + Vite)
   - Configured testing, linting, and Docker early to avoid late-stage integration issues

3. **Initial Shell**
   - Defined core models and API structure
   - Stubbed routes and UI navigation to validate system shape

4. **Data & Schema Design**
   - Introduced registry-driven observation schema
   - Designed rule bodies as discriminated unions

5. **Core Functionality & Iteration**
   - Implemented rule evaluation engine
   - Built Underwriter and Applied Sciences workflows
   - Iterated on flexibility and evaluation clarity

6. **Validation, Testing & Cleanup**
   - Added unit and integration tests
   - Refined validation and error handling
   - Cleaned up structure for demo readiness

## Scope Decisions

This POC intentionally goes slightly beyond the minimal requirement to:

- Validate end-to-end usability (not just backend correctness)
- Pressure-test rule flexibility through real UI interaction
- Demonstrate how non-engineers can manage rules

Tradeoffs made:

- SQLite instead of a production database
- No authentication (role toggle only)
- Simplified geometry handling

## Future Works

**Selected highlights** — key areas to evolve this system:

- Spatial modeling (polygons, GIS integration)
- Rule versioning with audit history
- Actionable mitigation workflows
- Mitigation prioritization
- Structured rule editors

**Detail:**

- **Actionable steps per mitigation.** Today each mitigation carries a free-text `description` and an optional `effect`. A richer model would attach a structured checklist (`{ step, owner, evidence_required, est_cost, est_time }`) so the underwriter can issue the recommendation as a workflow rather than copy/paste. The data shape is small; the bigger lift is building the assignment / sign-off UI. Lands cleanly on the existing Mitigation row.
- **Polygon-based geometry for Home-to-home distance.** The brief defines this as the minimum Euclidean distance between building-footprint polygons. The current implementation captures the resolved distance directly as a numeric observation field (`home_to_home_distance_ft`) and the rule is a simple `≥ 15 ft` threshold, which keeps the engine simple and consistent with the other rule shapes. A real system would ingest footprint polygons from a parcel/GIS source and compute the distance server-side. That requires a new field type (geometry), a polygon library (e.g. Shapely), and probably PostGIS or a similar spatial backend — out of scope for the POC, but a clean follow-up because the rule body shape stays the same; only the value resolution changes.
- **Exact coordinates for vegetation (and other point assets).** Today the registry's `vegetation` field stores items as `{type, distance_to_window_ft}` — a pre-resolved scalar that the engine compares against a computed safe distance. A richer model would capture each plant/tree/shrub at its actual lat/lng (or property-relative coordinates), letting rules evaluate distance to *any* dwelling face rather than a single resolved distance, support relocation suggestions ("move this shrub 5ft further from the bay window"), and feed visual property maps. Same dependency as the home-to-home polygon work — a `point` / `geometry` observation field type, a spatial backend, and a coordinate-aware rule comparator. Pairs naturally with that effort.
- **Structured editors for boolean and parameterized rule bodies.** Logical clauses now have a recursive visual editor; boolean and parameterized still use a JSON textarea. Boolean is trivial (two dropdowns); parameterized is more involved because of the modifiers list, the `[]` iteration syntax in `compare_field`, and the comparison operator. Both are safe to ship as JSON for engineering-fluent AS users today; they'd benefit from the same treatment as logical when an analyst-facing audience matters.
- **Versioned rule edits (true effective_from / effective_to).** The `as_of` filter on `/evaluate` uses `Rule.created_at`, which is the right shape for "rules introduced before X" but not for "the rule body that was active on X" — edits to a rule overwrite its body in place with no audit history. Versioning rule + mitigation rows on edit (or shadowing them in a `rule_versions` table) closes this gap and gives Applied Sciences a real audit trail. Same instinct applies to mitigation edits.
- **Mitigation ranking when aggregated across rules.** A property with four firing rules can surface a flat list of 12 mitigations with no signal for "what to do first." Sorting by parent rule severity then tier then `sort_order` gets us 80% of the way there; a real product would also let mitigations carry an estimated risk reduction so the underwriter can target the highest-impact action.
- **Property bulk operations** — search, filter, pagination, import. Single-screen list works for the POC; the brief's "100s of rules" framing implies a comparable property scale eventually.
- **Auth.** The role toggle is a UX placeholder — anyone can flip to Applied Sciences and edit rules. A real system gates by user identity and groups, with audit-log tie-in.
- **Bundle code-splitting.** The frontend ships as a single ~600 KB bundle (Vite warns about it on every build). Lazy-loading the `/manage/*` routes is one dynamic import and meaningfully shrinks the underwriter-only payload.

## Setup and run

### Local dev (recommended for iteration)

Backend:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

Frontend (separate terminal):

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api/*` → `http://localhost:8001`.

### Docker (single-container demo)

```bash
docker build -t mitigation-rules-engine .
docker run --rm -p 8001:8001 mitigation-rules-engine
```

Open <http://localhost:8001>. Frontend bundle is baked in; one URL serves the whole app.

### Tests

Backend (68 pytest tests + 15 evaluator unit tests):

```bash
pytest
ruff check .
ruff format --check .
```

Frontend (type check + production build):

```bash
cd frontend
npx tsc -b --noEmit
npm run build
```

CI mirrors the same checks on every push (`.github/workflows/ci.yml`).

## URLs after `docker run`

| URL                                                  | What you see                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| <http://localhost:8001/>                             | Welcome card                                                            |
| <http://localhost:8001/properties>                   | Underwriter — property list, create, edit, delete                       |
| <http://localhost:8001/properties/{id}>              | Underwriter — property detail + observation capture / edit / history + auto-running evaluation panel |
| <http://localhost:8001/manage/rules>                 | Applied Sciences — rule list (click "Applied Sciences" in the AppBar first) |
| <http://localhost:8001/manage/rules/{id}>            | Applied Sciences — rule detail with Visual/JSON body editor + rule test card |
| <http://localhost:8001/manage/fields>                | Applied Sciences — field-registry CRUD                                  |
| <http://localhost:8001/docs>                         | FastAPI Swagger                                                         |
| <http://localhost:8001/redoc>                        | ReDoc                                                                   |
| <http://localhost:8001/api/health>                   | `{"status":"ok"}`                                                       |
| <http://localhost:8001/api/properties>               | properties JSON                                                         |
| <http://localhost:8001/api/observation-fields>       | field registry JSON                                                     |
| <http://localhost:8001/api/rules>                    | rules + nested mitigations JSON                                         |

## API summary

All endpoints under `/api`.

| Method | Path                                                     | Description                                                                |
| ------ | -------------------------------------------------------- | -------------------------------------------------------------------------- |
| GET    | `/health`                                                | Liveness                                                                   |
| GET/POST   | `/properties`                                        | List / create properties                                                   |
| GET/PATCH/DELETE | `/properties/{id}`                             | Get / update / delete a property                                           |
| GET/POST   | `/properties/{id}/observations`                      | History (newest first) / create with registry validation                   |
| PATCH      | `/properties/{id}/observations/{oid}`                | Replace values and/or `captured_at` on an existing observation             |
| POST       | `/properties/{id}/observations/{oid}/evaluate`       | Run all enabled rules against an observation. Optional `?as_of=<datetime>` to filter to rules + mitigations created on or before that timestamp |
| GET/POST   | `/observation-fields`                                | List / create field-registry entries                                       |
| GET/PATCH/DELETE | `/observation-fields/{id}`                     | Get / update / delete a field entry (`{deprecated: true}` to soft-hide)    |
| GET/POST   | `/rules`                                             | List / create rules with nested mitigations                                |
| GET/PATCH/DELETE | `/rules/{id}`                                  | Get / update / delete a rule (PATCH replaces mitigations wholesale)        |

## Closing Thoughts

This POC demonstrates that a flexible, registry-driven rules engine can:

- Adapt to evolving underwriting logic
- Provide consistent, explainable evaluations
- Enable non-engineers to manage rule complexity

The primary challenge is not rule evaluation itself, but building a system that can evolve safely as rules grow in complexity — this design is intended to support that.
