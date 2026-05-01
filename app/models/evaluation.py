from typing import Any

from pydantic import BaseModel

from app.models.rule import Mitigation


class Vulnerability(BaseModel):
    rule_id: int
    rule_name: str
    description: str
    severity: str  # "low" | "medium" | "high"
    detail: str | None = None  # extra context like "tree at 8ft is closer than safe distance 60ft"


class EvaluationResult(BaseModel):
    observation_id: int
    property_id: int
    evaluated_rule_count: int
    vulnerabilities: list[Vulnerability]
    full_mitigations: list[Mitigation]
    bridge_mitigations: list[Mitigation]
    bridge_mitigation_count: int
    explanation: str


class RuleTestInput(BaseModel):
    values: dict[str, Any]


class RuleTestResult(BaseModel):
    rule_id: int
    rule_name: str
    rule_type: str
    holds: bool  # True if the observation satisfies the rule
    detail: str | None = None  # if violated, why
    full_mitigations: list[Mitigation] = []
    bridge_mitigations: list[Mitigation] = []
