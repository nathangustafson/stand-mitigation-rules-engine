"""Rule + Mitigation schema.

Three rule types matching the brief's three example shapes:
  - boolean       single field equality (e.g. attic_vent_screen == ember_resistant)
  - logical       recursive AND / OR / IN / equals tree (e.g. the Roof rule)
  - parameterized base value with multiply/divide modifiers and a comparison
                  field (e.g. the Windows safe-distance rule)

Bodies are stored as JSON in SQLite; on write we validate them through the
Pydantic discriminated unions defined here. Slice D will use these to actually
evaluate observations — Slice C just persists and edits them.
"""

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel
from pydantic import Field as PydanticField
from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, Relationship, SQLModel

# --- Rule body shapes --------------------------------------------------------


class BooleanRuleBody(BaseModel):
    """Single field-equality check."""

    type: Literal["boolean"] = "boolean"
    field: str
    must_equal: Any


class EqualsClause(BaseModel):
    type: Literal["equals"] = "equals"
    field: str
    value: Any


class InClause(BaseModel):
    type: Literal["in"] = "in"
    field: str
    values: list[Any]


class AllOfClause(BaseModel):
    type: Literal["all_of"] = "all_of"
    clauses: list["Clause"]


class AnyOfClause(BaseModel):
    type: Literal["any_of"] = "any_of"
    clauses: list["Clause"]


Clause = Annotated[
    EqualsClause | InClause | AllOfClause | AnyOfClause,
    PydanticField(discriminator="type"),
]
AllOfClause.model_rebuild()
AnyOfClause.model_rebuild()


class LogicalRuleBody(BaseModel):
    type: Literal["logical"] = "logical"
    clause: Clause


class WhenCondition(BaseModel):
    field: str
    equals: Any


class Modifier(BaseModel):
    when: WhenCondition
    multiply_by: float | None = None
    divide_by: float | None = None


class ParameterizedRuleBody(BaseModel):
    """Compute a numeric threshold from a base + modifiers, then compare.

    `compare_field` may use bracket notation like "vegetation[].distance_to_window_ft"
    to indicate "evaluate for each item in the list." The engine interprets that
    in Slice D; for now it's just structured text that the editor preserves.
    """

    type: Literal["parameterized"] = "parameterized"
    base: float
    unit: str | None = None
    modifiers: list[Modifier] = []
    compare_field: str
    compare_op: Literal["<", "<=", ">", ">=", "==", "!="]


RuleBody = Annotated[
    BooleanRuleBody | LogicalRuleBody | ParameterizedRuleBody,
    PydanticField(discriminator="type"),
]


# --- SQL tables --------------------------------------------------------------


class Mitigation(SQLModel, table=True):
    __tablename__ = "mitigations"

    id: int | None = Field(default=None, primary_key=True)
    rule_id: int = Field(foreign_key="rules.id", index=True)
    tier: str  # "full" | "bridge"
    name: str
    description: str
    effect: str | None = None
    sort_order: int = 0
    # Nullable for back-compat with rows seeded before the column existed.
    # The /evaluate as_of filter treats NULL as "ancient" (always included).
    created_at: datetime | None = Field(default_factory=datetime.utcnow, nullable=True)


class Rule(SQLModel, table=True):
    __tablename__ = "rules"

    id: int | None = Field(default=None, primary_key=True)
    name: str
    description: str
    type: str  # boolean | logical | parameterized — mirrors body.type
    body: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    enabled: bool = True
    priority: int = 0
    # "low" | "medium" | "high". Independent of priority — priority is
    # evaluation order / weight, severity is "how bad is this finding for the
    # homeowner." Validated by the API DTO; persisted as TEXT so the column
    # is forward-compatible with new severity buckets.
    severity: str = Field(default="medium")
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    mitigations: list[Mitigation] = Relationship(
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan",
            "order_by": "Mitigation.sort_order, Mitigation.id",
        }
    )


# --- API DTOs ---------------------------------------------------------------


class MitigationInput(BaseModel):
    tier: Literal["full", "bridge"]
    name: str
    description: str
    effect: str | None = None
    sort_order: int = 0


Severity = Literal["low", "medium", "high"]


class RuleCreate(BaseModel):
    name: str
    description: str
    body: RuleBody
    enabled: bool = True
    priority: int = 0
    severity: Severity = "medium"
    mitigations: list[MitigationInput] = []


class RuleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    body: RuleBody | None = None
    enabled: bool | None = None
    priority: int | None = None
    severity: Severity | None = None
    # If provided, the entire mitigations list is replaced. To leave alone, omit.
    mitigations: list[MitigationInput] | None = None


class MitigationRead(BaseModel):
    id: int
    rule_id: int
    tier: str
    name: str
    description: str
    effect: str | None = None
    sort_order: int = 0
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class RuleRead(BaseModel):
    id: int
    name: str
    description: str
    type: str
    body: dict[str, Any]
    enabled: bool
    priority: int
    severity: str
    created_at: datetime
    updated_at: datetime
    mitigations: list[MitigationRead]

    model_config = {"from_attributes": True}
