from typing import Any

from app.models.observation import ObservationField


class ObservationValidationError(Exception):
    def __init__(self, errors: list[dict[str, str]]) -> None:
        super().__init__("observation validation failed")
        self.errors = errors


def validate_values(
    values: dict[str, Any],
    fields: list[ObservationField],
) -> None:
    """Walk values dict, look each key up in the registry, type-check.

    Raises ObservationValidationError with a list of `{key, error}` dicts. All
    fields are optional for the POC — missing keys are fine — but unknown keys
    are rejected so reviewers see a clear signal when their fixture drifts.
    """
    by_key = {f.key: f for f in fields if f.deprecated_at is None}
    errors: list[dict[str, str]] = []

    for key, value in values.items():
        spec = by_key.get(key)
        if spec is None:
            errors.append({"key": key, "error": "unknown field"})
            continue
        err = _validate_one(value, spec)
        if err is not None:
            errors.append({"key": key, "error": err})

    if errors:
        raise ObservationValidationError(errors)


def _validate_one(value: Any, spec: ObservationField) -> str | None:
    if value is None:
        return None
    if spec.type == "enum":
        if not isinstance(value, str):
            return f"expected string, got {type(value).__name__}"
        if spec.allowed_values and value not in spec.allowed_values:
            return f"value '{value}' not in allowed_values {spec.allowed_values}"
        return None
    if spec.type == "number":
        if isinstance(value, bool) or not isinstance(value, int | float):
            return f"expected number, got {type(value).__name__}"
        return None
    if spec.type == "boolean":
        if not isinstance(value, bool):
            return f"expected boolean, got {type(value).__name__}"
        return None
    if spec.type == "string":
        if not isinstance(value, str):
            return f"expected string, got {type(value).__name__}"
        return None
    if spec.type == "list_of_object":
        if not isinstance(value, list):
            return f"expected list, got {type(value).__name__}"
        return _validate_list_of_object(value, spec)
    return f"unsupported field type '{spec.type}'"


def _validate_list_of_object(items: list[Any], spec: ObservationField) -> str | None:
    schema = (spec.item_schema or {}).get("fields", [])
    schema_by_key = {f["key"]: f for f in schema}
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            return f"item {index}: expected object, got {type(item).__name__}"
        for k, v in item.items():
            child = schema_by_key.get(k)
            if child is None:
                return f"item {index}: unknown sub-field '{k}'"
            err = _validate_scalar(v, child)
            if err is not None:
                return f"item {index}.{k}: {err}"
    return None


def _validate_scalar(value: Any, schema: dict[str, Any]) -> str | None:
    if value is None:
        return None
    t = schema.get("type")
    if t == "enum":
        allowed = schema.get("allowed_values") or []
        if not isinstance(value, str):
            return f"expected string, got {type(value).__name__}"
        if allowed and value not in allowed:
            return f"value '{value}' not in allowed_values {allowed}"
        return None
    if t == "number":
        if isinstance(value, bool) or not isinstance(value, int | float):
            return f"expected number, got {type(value).__name__}"
        return None
    if t == "boolean":
        if not isinstance(value, bool):
            return f"expected boolean, got {type(value).__name__}"
        return None
    if t == "string":
        if not isinstance(value, str):
            return f"expected string, got {type(value).__name__}"
        return None
    return f"unsupported sub-field type '{t}'"
