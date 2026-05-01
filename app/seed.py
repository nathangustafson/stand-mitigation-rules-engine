from datetime import datetime, timedelta

from sqlmodel import Session, select

from app.db import engine
from app.models.observation import Observation, ObservationField
from app.models.property import Property
from app.models.rule import Mitigation, Rule

# Field registry seed taken from the take-home brief's example observation hash.
DEFAULT_OBSERVATION_FIELDS: list[dict] = [
    {
        "key": "attic_vent_screen",
        "label": "Attic Vent Screens",
        "type": "enum",
        "allowed_values": ["none", "standard", "ember_resistant"],
        "value_labels": {
            "none": "None",
            "standard": "Standard",
            "ember_resistant": "Ember-resistant",
        },
        "group_label": "Building",
        "sort_order": 10,
    },
    {
        "key": "roof_type",
        "label": "Roof Type",
        "type": "enum",
        "allowed_values": ["class_a", "class_b", "class_c"],
        "value_labels": {
            "class_a": "Class A",
            "class_b": "Class B",
            "class_c": "Class C",
        },
        "group_label": "Building",
        "sort_order": 20,
    },
    {
        "key": "window_type",
        "label": "Window Type",
        "type": "enum",
        "allowed_values": ["single", "double", "tempered_glass"],
        "value_labels": {
            "single": "Single-pane",
            "double": "Double-pane",
            "tempered_glass": "Tempered glass",
        },
        "group_label": "Building",
        "sort_order": 30,
    },
    {
        "key": "wildfire_risk_category",
        "label": "Wildfire Risk Category",
        "type": "enum",
        "allowed_values": ["a", "b", "c", "d"],
        "value_labels": {
            "a": "A — low",
            "b": "B — moderate",
            "c": "C — high",
            "d": "D — extreme",
        },
        "group_label": "Site",
        "sort_order": 40,
    },
    {
        # Distance from this dwelling's footprint to the nearest neighboring
        # dwelling's footprint. The brief defines this as a polygon-edge
        # geometry calculation; we store the resolved distance directly so
        # the rule can be a simple threshold check. Polygon math is a Future
        # Work in the README.
        "key": "home_to_home_distance_ft",
        "label": "Home-to-home distance",
        "type": "number",
        "unit": "ft",
        "group_label": "Site",
        "sort_order": 45,
    },
    {
        "key": "vegetation",
        "label": "Vegetation",
        "type": "list_of_object",
        "group_label": "Site",
        "sort_order": 50,
        "item_schema": {
            "fields": [
                {
                    "key": "type",
                    "label": "Type",
                    "type": "enum",
                    "allowed_values": ["tree", "shrub", "grass"],
                    "value_labels": {
                        "tree": "Tree",
                        "shrub": "Shrub",
                        "grass": "Grass",
                    },
                },
                {
                    "key": "distance_to_window_ft",
                    "label": "Distance to window",
                    "type": "number",
                    "unit": "ft",
                },
            ]
        },
    },
]


# Three rules from the brief. These are stored as JSON bodies validated by the
# Pydantic discriminated unions in app.models.rule on write.
DEFAULT_RULES: list[dict] = [
    {
        "name": "Attic Vent ember-rated",
        "description": ("Vents, chimneys, and screens must be able to withstand embers — they should be ember-rated."),
        "type": "boolean",
        "priority": 100,
        "severity": "high",
        "body": {
            "type": "boolean",
            "field": "attic_vent_screen",
            "must_equal": "ember_resistant",
        },
        "mitigations": [
            {
                "tier": "full",
                "name": "Install ember-rated vents",
                "description": "Replace vents with WUI-listed ember-resistant assemblies.",
                "sort_order": 10,
            }
        ],
    },
    {
        "name": "Roof class",
        "description": (
            "Roof must be Class A by assembly, free of gaps, and well maintained. "
            "In low-risk wildfire areas (Category A) Class B is also acceptable."
        ),
        "type": "logical",
        "priority": 90,
        "severity": "high",
        "body": {
            "type": "logical",
            "clause": {
                "type": "any_of",
                "clauses": [
                    {"type": "equals", "field": "roof_type", "value": "class_a"},
                    {
                        "type": "all_of",
                        "clauses": [
                            {
                                "type": "equals",
                                "field": "wildfire_risk_category",
                                "value": "a",
                            },
                            {
                                "type": "in",
                                "field": "roof_type",
                                "values": ["class_a", "class_b"],
                            },
                        ],
                    },
                ],
            },
        },
        "mitigations": [
            {
                "tier": "full",
                "name": "Replace roof with Class A material",
                "description": "Install a Class A fire-rated roof assembly (metal, tile, or rated asphalt).",
                "sort_order": 10,
            }
        ],
    },
    {
        "name": "Home-to-home distance",
        "description": (
            "Neighboring homes must be at least 15 ft away (edge-to-edge). "
            "This is typically an unmitigatable property characteristic, so the "
            "rule has no mitigations attached — when it fires, the property is "
            "structurally non-conforming."
        ),
        "type": "parameterized",
        "priority": 80,
        "severity": "high",
        "body": {
            "type": "parameterized",
            "base": 15,
            "unit": "ft",
            "modifiers": [],
            "compare_field": "home_to_home_distance_ft",
            "compare_op": ">=",
        },
        # Brief: "None (This is typically an unmitigatable property characteristic)".
        "mitigations": [],
    },
    {
        "name": "Windows safe distance",
        "description": (
            "Windows must withstand heat exposure from surrounding combustibles and vegetation. "
            "Computed safe distance is 30ft for tempered glass + trees, scaled by window and "
            "vegetation type modifiers."
        ),
        "type": "parameterized",
        "priority": 70,
        "severity": "medium",
        "body": {
            "type": "parameterized",
            "base": 30,
            "unit": "ft",
            "modifiers": [
                {
                    "when": {"field": "window_type", "equals": "single"},
                    "multiply_by": 3,
                },
                {
                    "when": {"field": "window_type", "equals": "double"},
                    "multiply_by": 2,
                },
                {
                    "when": {"field": "vegetation[].type", "equals": "shrub"},
                    "divide_by": 2,
                },
                {
                    "when": {"field": "vegetation[].type", "equals": "grass"},
                    "divide_by": 3,
                },
            ],
            "compare_field": "vegetation[].distance_to_window_ft",
            "compare_op": ">=",
        },
        "mitigations": [
            {
                "tier": "full",
                "name": "Remove vegetation",
                "description": "Eliminate vegetation in the affected zone.",
                "sort_order": 10,
            },
            {
                "tier": "full",
                "name": "Replace window with tempered glass",
                "description": "Install tempered, dual-pane windows rated for wildfire-prone areas.",
                "sort_order": 20,
            },
            {
                "tier": "bridge",
                "name": "Apply window film",
                "description": "Apply approved fire-rated film to windows.",
                "effect": "decreases minimum safe distance by 20%",
                "sort_order": 30,
            },
            {
                "tier": "bridge",
                "name": "Apply flame retardants to shrubs",
                "description": "Treat surrounding shrubs with flame retardant.",
                "effect": "decreases minimum safe distance by 25%",
                "sort_order": 40,
            },
            {
                "tier": "bridge",
                "name": "Prune trees",
                "description": "Prune trees to a safe height.",
                "effect": "decreases minimum safe distance by 50%",
                "sort_order": 50,
            },
        ],
    },
]


def seed_observation_fields(session: Session) -> int:
    if session.exec(select(ObservationField)).first() is not None:
        return 0
    for spec in DEFAULT_OBSERVATION_FIELDS:
        session.add(ObservationField(**spec))
    session.commit()
    return len(DEFAULT_OBSERVATION_FIELDS)


def seed_rules(session: Session) -> int:
    if session.exec(select(Rule)).first() is not None:
        return 0
    for spec in DEFAULT_RULES:
        mitigation_specs = spec.get("mitigations", [])
        rule = Rule(**{k: v for k, v in spec.items() if k != "mitigations"})
        rule.mitigations = [Mitigation(**m) for m in mitigation_specs]
        session.add(rule)
    session.commit()
    return len(DEFAULT_RULES)


def seed_all() -> None:
    """Idempotent startup seeding. Safe to call on every container start.

    - The field registry and rule tables only seed when empty (cold-start
      bootstrapping the brief's reference data).
    - Demo properties + observations are seeded by nickname, so deleted demo
      rows are restored on the next container restart but user-created
      properties are left alone. Lets a fresh `docker run` always show the
      demo state without baking it into the image.
    """
    with Session(engine) as session:
        seed_observation_fields(session)
        seed_rules(session)
        seed_demo_data(session)


# Demo properties + observations for the "Load demo data" button. Idempotent
# on nickname — clicking twice doesn't duplicate. Each observation uses a
# `days_ago` offset so the timeline view on the property detail page has
# meaningful spacing — captured_at is set explicitly rather than defaulting
# to "now". The mountain cabin shows a multi-step remediation journey, which
# makes the timeline diff view useful.
DEMO_PROPERTIES: list[dict] = [
    {
        "property": {
            "street": "12 Ridgeline Rd",
            "city": "Truckee",
            "state": "CA",
            "zip": "96161",
            "nickname": "Demo: Mountain cabin (high risk)",
        },
        "observations": [
            {
                "days_ago": 120,
                "values": {
                    "attic_vent_screen": "none",
                    "roof_type": "class_c",
                    "window_type": "single",
                    "wildfire_risk_category": "d",
                    # Too close to neighbor — fires the home-to-home rule and
                    # there's nothing the underwriter can do about it. Stays
                    # this way through every subsequent observation because
                    # it's not in any of the sparse follow-up updates.
                    "home_to_home_distance_ft": 8,
                    "vegetation": [
                        {"type": "shrub", "distance_to_window_ft": 5},
                        {"type": "tree", "distance_to_window_ft": 12},
                    ],
                },
            },
            {
                # Vents replaced with ember-rated; everything else still bad.
                "days_ago": 75,
                "values": {
                    "attic_vent_screen": "ember_resistant",
                    "roof_type": "class_c",
                    "window_type": "single",
                    "wildfire_risk_category": "d",
                    "vegetation": [
                        {"type": "shrub", "distance_to_window_ft": 5},
                        {"type": "tree", "distance_to_window_ft": 12},
                    ],
                },
            },
            {
                # Roof + windows replaced; vegetation cleared. Now compliant.
                "days_ago": 14,
                "values": {
                    "attic_vent_screen": "ember_resistant",
                    "roof_type": "class_a",
                    "window_type": "tempered_glass",
                    "wildfire_risk_category": "d",
                    "vegetation": [{"type": "tree", "distance_to_window_ft": 60}],
                },
            },
        ],
    },
    {
        "property": {
            "street": "405 Oak St",
            "unit": "B",
            "city": "Boulder",
            "state": "CO",
            "zip": "80301",
            "nickname": "Demo: Suburban home (compliant)",
        },
        "observations": [
            {
                "days_ago": 30,
                "values": {
                    "attic_vent_screen": "ember_resistant",
                    "roof_type": "class_a",
                    "window_type": "tempered_glass",
                    "wildfire_risk_category": "b",
                    "home_to_home_distance_ft": 30,
                    "vegetation": [{"type": "tree", "distance_to_window_ft": 100}],
                },
            },
        ],
    },
    {
        # Designed so the latest observation fires every rule and surfaces
        # every mitigation the brief defines — useful for a single-screen
        # demo of the engine output. Math:
        #   Attic Vent: "none" != "ember_resistant" → fires (1 full)
        #   Roof: "class_c" → fires (1 full)
        #   Home-to-home: 7 < 15 → fires (0 mitigations, brief: unmitigatable)
        #   Windows: base 30 × 3 (single) ÷ 2 (shrub) = 45 for shrub at 4ft → fires
        #            base 30 × 3 (single) for tree at 18ft = 90 → fires
        #            (2 full + 3 bridge mitigations)
        # Total: 4 vulns, 4 full + 3 bridge mitigations on the latest evaluation.
        "property": {
            "street": "1 Hazard Way",
            "city": "Paradise",
            "state": "CA",
            "zip": "95969",
            "nickname": "Demo: Every mitigation visible",
        },
        "observations": [
            {
                "days_ago": 7,
                "values": {
                    "attic_vent_screen": "none",
                    "roof_type": "class_c",
                    "window_type": "single",
                    "wildfire_risk_category": "d",
                    "home_to_home_distance_ft": 7,
                    "vegetation": [
                        {"type": "shrub", "distance_to_window_ft": 4},
                        {"type": "tree", "distance_to_window_ft": 18},
                    ],
                },
            },
        ],
    },
    {
        "property": {
            "street": "88 Lakeshore Dr",
            "city": "Reno",
            "state": "NV",
            "zip": "89509",
            "nickname": "Demo: Mixed (one rule fires)",
        },
        "observations": [
            {
                # Windows: base 30 × 2 (double) ÷ 2 (shrub) = 30; 10 < 30 fires.
                "days_ago": 90,
                "values": {
                    "attic_vent_screen": "ember_resistant",
                    "roof_type": "class_b",
                    "window_type": "double",
                    "wildfire_risk_category": "a",
                    "home_to_home_distance_ft": 22,
                    "vegetation": [{"type": "shrub", "distance_to_window_ft": 10}],
                },
            },
            {
                # Vegetation pushed back, but vents downgraded — Attic Vent rule fires.
                "days_ago": 21,
                "values": {
                    "attic_vent_screen": "standard",
                    "roof_type": "class_b",
                    "window_type": "double",
                    "wildfire_risk_category": "a",
                    "vegetation": [{"type": "tree", "distance_to_window_ft": 70}],
                },
            },
        ],
    },
]


def seed_demo_data(session: Session) -> dict[str, int]:
    """Idempotent demo seed. Skips a property if a property with the same
    nickname already exists. Returns counts so the UI can confirm what
    happened."""
    now = datetime.utcnow()
    created_props = 0
    created_obs = 0
    skipped_props = 0
    for spec in DEMO_PROPERTIES:
        prop_data = spec["property"]
        existing = session.exec(select(Property).where(Property.nickname == prop_data["nickname"])).first()
        if existing is not None:
            skipped_props += 1
            continue
        prop = Property(**prop_data)
        session.add(prop)
        session.flush()  # populate prop.id before children
        for obs_spec in spec.get("observations", []):
            captured_at = now - timedelta(days=obs_spec.get("days_ago", 0))
            session.add(
                Observation(
                    property_id=prop.id,
                    values=obs_spec["values"],
                    captured_at=captured_at,
                )
            )
            created_obs += 1
        created_props += 1
    session.commit()
    return {
        "properties_created": created_props,
        "observations_created": created_obs,
        "properties_skipped": skipped_props,
    }
