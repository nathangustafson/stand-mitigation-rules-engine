"""Pure evaluation of stored rules against an observation values dict.

This module is intentionally DB-free. The route layer fetches the observation
and the active rule list, then calls `evaluate(observation_values, rules)`.

Three rule body types are supported, matching the discriminated unions in
`app/models/rule.py`:

  - boolean       single field equality
  - logical       recursive equals/in/all_of/any_of clause tree
  - parameterized base value with multiply/divide modifiers and a comparison
                  field. Supports per-item iteration over a single list field
                  (e.g. the brief's Windows rule iterates over vegetation).

A rule "violates" when its body does NOT hold for the observation. Violations
become Vulnerability entries; the rule's mitigations are surfaced split by
tier. Conservative posture: if a referenced field is missing from the
observation, the rule is treated as violated (we can't prove satisfaction).
"""

from datetime import datetime
from typing import Any

from app.models.evaluation import EvaluationResult, Vulnerability
from app.models.observation import ObservationField
from app.models.rule import Mitigation, Rule

# --- Label resolution -------------------------------------------------------


class _Labels:
    """Resolve display labels for fields and enum values from the registry.

    Top-level paths look up `ObservationField.label` and `value_labels`.
    Bracketed paths like `vegetation[].distance_to_window_ft` descend into
    the parent's `item_schema.fields[]`. Anything missing falls back to the
    raw underscored key/value so the surface text is still meaningful.
    """

    def __init__(self, fields: list[ObservationField] | None) -> None:
        self._by_key: dict[str, ObservationField] = {}
        if fields:
            for f in fields:
                self._by_key[f.key] = f

    def field_label(self, path: str) -> str:
        if not path:
            return path
        if "[]." in path:
            head, _, leaf = path.partition("[].")
            return self._child(head, leaf, "label") or leaf
        f = self._by_key.get(path)
        return (f.label if f else None) or path

    def value_label(self, path: str, value: Any) -> str:
        if value is None:
            return ""
        if "[]." in path:
            head, _, leaf = path.partition("[].")
            labels = self._child(head, leaf, "value_labels") or {}
            return labels.get(value, str(value)) if isinstance(labels, dict) else str(value)
        f = self._by_key.get(path)
        if f and f.value_labels:
            return f.value_labels.get(value, str(value))
        return str(value)

    def child_field_label(self, parent_key: str, child_key: str) -> str:
        return self._child(parent_key, child_key, "label") or child_key

    def child_value_label(self, parent_key: str, child_key: str, value: Any) -> str:
        if value is None:
            return ""
        labels = self._child(parent_key, child_key, "value_labels") or {}
        return labels.get(value, str(value)) if isinstance(labels, dict) else str(value)

    def list_label(self, parent_key: str) -> str:
        f = self._by_key.get(parent_key)
        return (f.label if f else None) or parent_key.replace("_", " ").capitalize()

    def _child(self, parent_key: str, child_key: str, attr: str) -> Any:
        parent = self._by_key.get(parent_key)
        if not parent or not parent.item_schema:
            return None
        for child in parent.item_schema.get("fields", []) or []:
            if child.get("key") == child_key:
                return child.get(attr)
        return None


# --- Public API -------------------------------------------------------------


def evaluate(
    observation_values: dict[str, Any],
    rules: list[Rule],
    *,
    observation_id: int = 0,
    property_id: int = 0,
    as_of: datetime | None = None,
    fields: list[ObservationField] | None = None,
) -> EvaluationResult:
    """Evaluate every enabled rule and aggregate vulnerabilities + mitigations.

    When `as_of` is set, rules created after it are skipped, and within each
    surviving rule mitigations created after it are excluded from the
    aggregated lists. Rows with `created_at = None` (pre-existing rows from
    before the column existed) are treated as ancient and always retained.

    When `fields` is provided (the registry list), violation strings render
    field names + enum values via the registered display labels. When
    omitted, the raw underscored keys/values are used.
    """
    labels = _Labels(fields)
    vulnerabilities: list[Vulnerability] = []
    full: list[Mitigation] = []
    bridge: list[Mitigation] = []
    evaluated_count = 0

    for rule in rules:
        if not rule.enabled:
            continue
        if as_of is not None and rule.created_at is not None and rule.created_at > as_of:
            continue
        evaluated_count += 1
        violation = evaluate_single_rule(rule, observation_values, _labels=labels)
        if violation is None:
            continue
        vulnerabilities.append(
            Vulnerability(
                rule_id=rule.id or 0,
                rule_name=rule.name,
                description=rule.description,
                severity=rule.severity or "medium",
                detail=violation,
            )
        )
        for m in rule.mitigations:
            if as_of is not None and m.created_at is not None and m.created_at > as_of:
                continue
            if m.tier == "full":
                full.append(m)
            elif m.tier == "bridge":
                bridge.append(m)

    if vulnerabilities:
        explanation = (
            f"Evaluated {evaluated_count} rule(s); "
            f"{len(vulnerabilities)} produced vulnerabilities. "
            f"{len(full)} full mitigation(s) and {len(bridge)} bridge mitigation(s) recommended."
        )
    else:
        explanation = f"Evaluated {evaluated_count} rule(s); no vulnerabilities found."

    return EvaluationResult(
        observation_id=observation_id,
        property_id=property_id,
        evaluated_rule_count=evaluated_count,
        vulnerabilities=vulnerabilities,
        full_mitigations=full,
        bridge_mitigations=bridge,
        bridge_mitigation_count=len(bridge),
        explanation=explanation,
    )


# --- Rule dispatch ----------------------------------------------------------


def evaluate_single_rule(
    rule: Rule,
    values: dict[str, Any],
    *,
    fields: list[ObservationField] | None = None,
    _labels: "_Labels | None" = None,
) -> str | None:
    """Return None if the rule holds, or a short detail string if it violates.

    Public so the rule-testing endpoint can evaluate one rule in isolation
    without aggregating mitigations across the whole rule set. Pass `fields`
    to render labels in the violation string; without it, raw keys/values
    are used as a fallback.
    """
    lab = _labels or _Labels(fields)
    body = rule.body or {}
    body_type = body.get("type") or rule.type
    if body_type == "boolean":
        return _evaluate_boolean(body, values, lab)
    if body_type == "logical":
        return _evaluate_logical(body, values, lab)
    if body_type == "parameterized":
        return _evaluate_parameterized(body, values, lab)
    return f"unsupported rule type: {body_type}"


# --- Boolean ----------------------------------------------------------------


def _evaluate_boolean(body: dict[str, Any], values: dict[str, Any], lab: "_Labels") -> str | None:
    field = body.get("field")
    expected = body.get("must_equal")
    if not isinstance(field, str):
        return "Rule body is missing 'field'."
    actual = values.get(field)
    if actual is None:
        return f"Missing observation field '{lab.field_label(field)}'."
    if actual == expected:
        return None
    return (
        f"{lab.field_label(field)} is '{lab.value_label(field, actual)}' "
        f"— required: '{lab.value_label(field, expected)}'."
    )


# --- Logical ----------------------------------------------------------------


def _evaluate_logical(body: dict[str, Any], values: dict[str, Any], lab: "_Labels") -> str | None:
    clause = body.get("clause") or {}
    holds, detail = _evaluate_clause(clause, values, lab)
    return None if holds else (detail or "logical rule did not hold")


def _evaluate_clause(clause: dict[str, Any], values: dict[str, Any], lab: "_Labels") -> tuple[bool, str | None]:
    ctype = clause.get("type")
    if ctype == "equals":
        field = clause.get("field")
        expected = clause.get("value")
        actual = values.get(field) if isinstance(field, str) else None
        if actual is None:
            return False, f"Missing observation field '{lab.field_label(field) if isinstance(field, str) else field}'."
        if actual == expected:
            return True, None
        return False, (
            f"{lab.field_label(field)} is '{lab.value_label(field, actual)}' "
            f"— required: '{lab.value_label(field, expected)}'."
        )
    if ctype == "in":
        field = clause.get("field")
        allowed = clause.get("values") or []
        actual = values.get(field) if isinstance(field, str) else None
        if actual is None:
            return False, f"Missing observation field '{lab.field_label(field) if isinstance(field, str) else field}'."
        if actual in allowed:
            return True, None
        choices = ", ".join(f"'{lab.value_label(field, v)}'" for v in allowed)
        return False, (f"{lab.field_label(field)} is '{lab.value_label(field, actual)}' — required: one of {choices}.")
    if ctype == "all_of":
        for sub in clause.get("clauses", []):
            ok, detail = _evaluate_clause(sub, values, lab)
            if not ok:
                return False, detail
        return True, None
    if ctype == "any_of":
        # Collect every alternative's failure reason so the user sees ALL the
        # paths to satisfaction, not just the last one. Short-circuit on the
        # first match (a single satisfied clause makes the whole group hold).
        sub_details: list[str] = []
        for sub in clause.get("clauses", []):
            ok, detail = _evaluate_clause(sub, values, lab)
            if ok:
                return True, None
            sub_details.append(detail or "condition not described")
        if not sub_details:
            return False, "No matching clause for this rule."
        if len(sub_details) == 1:
            return False, sub_details[0]
        # Trim each sub-detail's trailing period so the joined message reads
        # as one sentence rather than a run-on of stitched sentences.
        cleaned = [d.rstrip(".") for d in sub_details]
        bullets = "; ".join(f"({chr(ord('a') + i)}) {d}" for i, d in enumerate(cleaned))
        return False, f"None of the alternatives held — needed any of: {bullets}."
    return False, f"Unsupported clause type '{ctype}'."


# --- Parameterized ----------------------------------------------------------


def _evaluate_parameterized(body: dict[str, Any], values: dict[str, Any], lab: "_Labels") -> str | None:
    base_raw = body.get("base")
    if not isinstance(base_raw, int | float):
        return "Rule body is missing numeric 'base'."
    base = float(base_raw)
    modifiers = body.get("modifiers") or []
    compare_field = body.get("compare_field")
    compare_op = body.get("compare_op")
    unit = body.get("unit") if isinstance(body.get("unit"), str) else None
    if not isinstance(compare_field, str) or not isinstance(compare_op, str):
        return "Rule body is missing 'compare_field' or 'compare_op'."

    # Identify the (single) list-iteration field, if any.
    list_name = _detect_list_iteration(modifiers, compare_field)
    if list_name is None:
        threshold = _apply_modifiers(base, modifiers, values, item=None, list_name=None)
        actual = _resolve(compare_field, values, item=None, list_name=None)
        return _compare_or_detail(actual, compare_op, threshold, compare_field, unit=unit, lab=lab)

    items_raw = values.get(list_name) or []
    if not isinstance(items_raw, list) or not items_raw:
        # No items to compare against — vacuously satisfied.
        return None

    for index, item in enumerate(items_raw):
        if not isinstance(item, dict):
            continue
        threshold = _apply_modifiers(base, modifiers, values, item=item, list_name=list_name)
        actual = _resolve(compare_field, values, item=item, list_name=list_name)
        violation = _compare_or_detail(
            actual,
            compare_op,
            threshold,
            compare_field,
            item_index=index,
            item=item,
            list_name=list_name,
            unit=unit,
            lab=lab,
        )
        if violation is not None:
            return violation
    return None


def _detect_list_iteration(modifiers: list[dict[str, Any]], compare_field: str) -> str | None:
    """Return the list-field name if any modifier or compare_field uses bracket notation."""
    candidates: list[str] = []
    for mod in modifiers:
        when_field = (mod.get("when") or {}).get("field", "")
        if "[]." in when_field:
            candidates.append(when_field.split("[].", 1)[0])
    if "[]." in compare_field:
        candidates.append(compare_field.split("[].", 1)[0])
    if not candidates:
        return None
    # POC scope: assume one list field per rule. If multiple referenced, take the first.
    return candidates[0]


def _apply_modifiers(
    base: float,
    modifiers: list[dict[str, Any]],
    values: dict[str, Any],
    *,
    item: dict[str, Any] | None,
    list_name: str | None,
) -> float:
    threshold = base
    for mod in modifiers:
        when = mod.get("when") or {}
        field = when.get("field")
        expected = when.get("equals")
        if not isinstance(field, str):
            continue
        actual = _resolve(field, values, item=item, list_name=list_name)
        if actual != expected:
            continue
        if isinstance(mod.get("multiply_by"), int | float):
            threshold *= float(mod["multiply_by"])
        if isinstance(mod.get("divide_by"), int | float):
            divisor = float(mod["divide_by"])
            if divisor != 0:
                threshold /= divisor
    return threshold


def _resolve(
    path: str,
    values: dict[str, Any],
    *,
    item: dict[str, Any] | None,
    list_name: str | None,
) -> Any:
    """Resolve a (possibly bracketed) field path. Top-level fields read from `values`;
    `<list>[]` segments read from the supplied `item` dict instead."""
    if "[]." in path:
        head, _, rest = path.partition("[].")
        if head == list_name and item is not None:
            return _walk(item, rest)
        # Bracketed path with no item context — treat as missing.
        return None
    return _walk(values, path)


def _walk(obj: Any, path: str) -> Any:
    cur: Any = obj
    for part in path.split("."):
        if isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
    return cur


def _compare_or_detail(
    actual: Any,
    op: str,
    threshold: float,
    compare_field: str,
    *,
    item_index: int | None = None,
    item: dict[str, Any] | None = None,
    list_name: str | None = None,
    unit: str | None = None,
    lab: "_Labels | None" = None,
) -> str | None:
    lab = lab or _Labels(None)
    if actual is None or not isinstance(actual, int | float):
        return f"Missing or non-numeric '{lab.field_label(compare_field)}'."
    actual_f = float(actual)
    if _check(actual_f, op, threshold):
        return None

    actual_str = _format_number(actual_f, unit)
    threshold_str = _format_number(threshold, unit)
    op_phrase = _OP_PHRASES.get(op, f"{op}")

    if item_index is not None and item is not None and list_name is not None:
        # Iteration case — surface the offending item and which leaf field
        # of it failed the comparison.
        leaf = compare_field.split("[].", 1)[1] if "[]." in compare_field else compare_field
        bits = ", ".join(
            f"{lab.child_field_label(list_name, k)}={_format_item_value(v, k, unit, leaf, list_name, lab)}"
            for k, v in item.items()
        )
        return (
            f"{lab.list_label(list_name)} #{item_index + 1} ({bits}): "
            f"{lab.child_field_label(list_name, leaf)} is {actual_str} "
            f"— required: {op_phrase} {threshold_str}."
        )

    return f"{lab.field_label(compare_field)} is {actual_str} — required: {op_phrase} {threshold_str}."


_OP_PHRASES = {
    "<": "less than",
    "<=": "at most",
    ">": "more than",
    ">=": "at least",
    "==": "exactly",
    "!=": "not exactly",
}


def _format_number(n: float, unit: str | None) -> str:
    """Format a number without a trailing .0, with an optional unit suffix."""
    if n == int(n):
        text = str(int(n))
    else:
        # Trim insignificant trailing zeros after rounding to 4dp.
        text = f"{n:.4f}".rstrip("0").rstrip(".")
    return f"{text} {unit}" if unit else text


def _format_item_value(
    value: Any,
    key: str,
    unit: str | None,
    unit_key: str,
    list_name: str,
    lab: "_Labels",
) -> str:
    """Format a value for inclusion in an item summary. Apply the unit only to
    the field we're actually comparing against, and resolve enum values via
    the registry's value_labels when available."""
    if isinstance(value, int | float) and not isinstance(value, bool):
        return _format_number(float(value), unit if key == unit_key else None)
    return lab.child_value_label(list_name, key, value)


def _check(actual: float, op: str, threshold: float) -> bool:
    if op == "<":
        return actual < threshold
    if op == "<=":
        return actual <= threshold
    if op == ">":
        return actual > threshold
    if op == ">=":
        return actual >= threshold
    if op == "==":
        return actual == threshold
    if op == "!=":
        return actual != threshold
    return False
