"""Tests for the pure rule evaluator (no FastAPI / TestClient)."""

from app.models.rule import Mitigation, Rule
from app.services.rule_evaluator import evaluate


def _rule(**kwargs) -> Rule:
    defaults = dict(
        id=1,
        name="r",
        description="",
        type="boolean",
        body={},
        enabled=True,
        priority=50,
        mitigations=[],
    )
    defaults.update(kwargs)
    rule = Rule(**{k: v for k, v in defaults.items() if k != "mitigations"})
    rule.mitigations = list(defaults.get("mitigations", []))
    return rule


# ---- boolean rules ----------------------------------------------------------


def test_boolean_holds_when_field_matches():
    rule = _rule(
        type="boolean",
        body={"type": "boolean", "field": "attic_vent_screen", "must_equal": "ember_resistant"},
    )
    result = evaluate({"attic_vent_screen": "ember_resistant"}, [rule])
    assert result.vulnerabilities == []


def test_boolean_violates_when_field_does_not_match():
    rule = _rule(
        type="boolean",
        body={"type": "boolean", "field": "attic_vent_screen", "must_equal": "ember_resistant"},
        mitigations=[
            Mitigation(rule_id=1, tier="full", name="Install ember vents", description="..."),
        ],
    )
    result = evaluate({"attic_vent_screen": "none"}, [rule])
    assert len(result.vulnerabilities) == 1
    assert "ember_resistant" in result.vulnerabilities[0].detail
    assert len(result.full_mitigations) == 1
    assert result.bridge_mitigation_count == 0


def test_boolean_violates_when_field_missing():
    rule = _rule(
        type="boolean",
        body={"type": "boolean", "field": "attic_vent_screen", "must_equal": "ember_resistant"},
    )
    result = evaluate({}, [rule])
    assert len(result.vulnerabilities) == 1


# ---- logical rules (the brief's Roof rule) ---------------------------------


ROOF_RULE_BODY = {
    "type": "logical",
    "clause": {
        "type": "any_of",
        "clauses": [
            {"type": "equals", "field": "roof_type", "value": "class_a"},
            {
                "type": "all_of",
                "clauses": [
                    {"type": "equals", "field": "wildfire_risk_category", "value": "a"},
                    {"type": "in", "field": "roof_type", "values": ["class_a", "class_b"]},
                ],
            },
        ],
    },
}


def test_logical_holds_when_class_a():
    rule = _rule(type="logical", body=ROOF_RULE_BODY)
    result = evaluate({"roof_type": "class_a", "wildfire_risk_category": "d"}, [rule])
    assert result.vulnerabilities == []


def test_logical_holds_when_class_b_in_low_risk_zone():
    rule = _rule(type="logical", body=ROOF_RULE_BODY)
    result = evaluate({"roof_type": "class_b", "wildfire_risk_category": "a"}, [rule])
    assert result.vulnerabilities == []


def test_logical_violates_class_b_in_high_risk_zone():
    rule = _rule(type="logical", body=ROOF_RULE_BODY)
    result = evaluate({"roof_type": "class_b", "wildfire_risk_category": "d"}, [rule])
    assert len(result.vulnerabilities) == 1


def test_logical_violates_when_class_c_anywhere():
    rule = _rule(type="logical", body=ROOF_RULE_BODY)
    result = evaluate({"roof_type": "class_c", "wildfire_risk_category": "a"}, [rule])
    assert len(result.vulnerabilities) == 1


# ---- parameterized rules (the brief's Windows rule) ------------------------


WINDOWS_RULE_BODY = {
    "type": "parameterized",
    "base": 30,
    "unit": "ft",
    "modifiers": [
        {"when": {"field": "window_type", "equals": "single"}, "multiply_by": 3},
        {"when": {"field": "window_type", "equals": "double"}, "multiply_by": 2},
        {"when": {"field": "vegetation[].type", "equals": "shrub"}, "divide_by": 2},
        {"when": {"field": "vegetation[].type", "equals": "grass"}, "divide_by": 3},
    ],
    "compare_field": "vegetation[].distance_to_window_ft",
    "compare_op": ">=",
}


def test_parameterized_holds_no_vegetation_is_vacuous():
    rule = _rule(type="parameterized", body=WINDOWS_RULE_BODY)
    result = evaluate({"window_type": "tempered_glass", "vegetation": []}, [rule])
    assert result.vulnerabilities == []


def test_parameterized_holds_when_far_enough():
    rule = _rule(type="parameterized", body=WINDOWS_RULE_BODY)
    # tempered_glass + tree → base 30; tree at 50ft passes
    result = evaluate(
        {"window_type": "tempered_glass", "vegetation": [{"type": "tree", "distance_to_window_ft": 50}]},
        [rule],
    )
    assert result.vulnerabilities == []


def test_parameterized_violates_single_pane_amplifies_threshold():
    rule = _rule(type="parameterized", body=WINDOWS_RULE_BODY)
    # single-pane × 3 = 90ft threshold; tree at 50ft fails
    result = evaluate(
        {"window_type": "single", "vegetation": [{"type": "tree", "distance_to_window_ft": 50}]},
        [rule],
    )
    assert len(result.vulnerabilities) == 1


def test_parameterized_holds_when_grass_divides_threshold_below_distance():
    rule = _rule(type="parameterized", body=WINDOWS_RULE_BODY)
    # tempered_glass (base 30) ÷ 3 (grass) = 10ft; grass at 12ft passes
    result = evaluate(
        {"window_type": "tempered_glass", "vegetation": [{"type": "grass", "distance_to_window_ft": 12}]},
        [rule],
    )
    assert result.vulnerabilities == []


def test_parameterized_violates_first_offending_item():
    rule = _rule(type="parameterized", body=WINDOWS_RULE_BODY)
    result = evaluate(
        {
            "window_type": "double",  # base × 2 = 60
            "vegetation": [
                {"type": "tree", "distance_to_window_ft": 80},  # 80 >= 60 ok
                {"type": "shrub", "distance_to_window_ft": 5},  # 60 / 2 = 30; 5 < 30 fail
            ],
        },
        [rule],
    )
    assert len(result.vulnerabilities) == 1
    assert "shrub" in result.vulnerabilities[0].detail


# ---- engine-level concerns -------------------------------------------------


def test_disabled_rules_not_evaluated():
    rule = _rule(
        type="boolean",
        body={"type": "boolean", "field": "roof_type", "must_equal": "class_a"},
        enabled=False,
    )
    result = evaluate({"roof_type": "class_c"}, [rule])
    assert result.vulnerabilities == []
    assert result.evaluated_rule_count == 0


def test_severity_passed_through_from_rule():
    """Severity is set explicitly on the Rule and surfaced verbatim — it's no
    longer derived from priority. The two are independent: a low-priority rule
    can still be high-severity for the homeowner."""
    high = _rule(
        type="boolean",
        priority=10,  # low priority, deliberately
        severity="high",
        body={"type": "boolean", "field": "x", "must_equal": "y"},
    )
    medium = _rule(
        id=2,
        type="boolean",
        priority=100,  # high priority, deliberately
        severity="medium",
        body={"type": "boolean", "field": "x", "must_equal": "y"},
    )
    low = _rule(
        id=3,
        type="boolean",
        priority=50,
        severity="low",
        body={"type": "boolean", "field": "x", "must_equal": "y"},
    )
    result = evaluate({"x": "z"}, [high, medium, low])
    # Aggregation order follows DB priority (highest first); we ordered the
    # input list to match here so the assertion stays simple.
    severities = [v.severity for v in result.vulnerabilities]
    assert severities == ["high", "medium", "low"]


def test_aggregates_mitigations_per_tier():
    r1 = _rule(
        id=1,
        type="boolean",
        body={"type": "boolean", "field": "a", "must_equal": "x"},
        mitigations=[
            Mitigation(rule_id=1, tier="full", name="A", description=""),
            Mitigation(rule_id=1, tier="bridge", name="B", description=""),
        ],
    )
    r2 = _rule(
        id=2,
        type="boolean",
        body={"type": "boolean", "field": "b", "must_equal": "x"},
        mitigations=[
            Mitigation(rule_id=2, tier="bridge", name="C", description=""),
        ],
    )
    result = evaluate({"a": "no", "b": "no"}, [r1, r2])
    assert len(result.full_mitigations) == 1
    assert result.bridge_mitigation_count == 2
    assert [m.name for m in result.bridge_mitigations] == ["B", "C"]
