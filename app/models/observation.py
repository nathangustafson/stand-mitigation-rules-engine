from datetime import datetime
from typing import Any

from pydantic import BaseModel
from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel


class ObservationField(SQLModel, table=True):
    """Registry entry describing one capturable observation field.

    type values:
      - "enum"            allowed_values: list[str]; value_labels: dict[str, str] (optional)
      - "number"          unit may apply
      - "boolean"
      - "string"
      - "list_of_object"  item_schema: { fields: [ {key, label, type, value_labels?, ...}, ... ] }

    `value_labels` maps each enum code to its display label
    (e.g. {"ember_resistant": "Ember-resistant"}). When absent for a given
    code, callers fall back to the raw underscored code.
    """

    __tablename__ = "observation_fields"

    id: int | None = Field(default=None, primary_key=True)
    key: str = Field(unique=True, index=True)
    label: str
    type: str
    allowed_values: list[str] | None = Field(default=None, sa_column=Column(JSON))
    value_labels: dict[str, str] | None = Field(default=None, sa_column=Column(JSON))
    unit: str | None = None
    group_label: str | None = None
    sort_order: int = 0
    item_schema: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    deprecated_at: datetime | None = None


class Observation(SQLModel, table=True):
    __tablename__ = "observations"

    id: int | None = Field(default=None, primary_key=True)
    property_id: int = Field(foreign_key="properties.id", index=True)
    captured_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    values: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class ObservationCreate(BaseModel):
    values: dict[str, Any]
    # Optional override for the captured_at timestamp. Lets the underwriter
    # backdate / future-date an observation — a lightweight workaround for the
    # full time-based-rule-versioning user story (which would also add
    # effective_from/_to on rules and an as_of evaluation parameter).
    captured_at: datetime | None = None
