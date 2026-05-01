from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import Session

from app.db import get_session
from app.models.evaluation import EvaluationResult
from app.models.observation import Observation, ObservationCreate
from app.repository.observation_field_repository import ObservationFieldRepository
from app.repository.observation_repository import ObservationRepository
from app.repository.property_repository import PropertyRepository
from app.repository.rule_repository import RuleRepository
from app.services.observation_chain import build_chain
from app.services.observation_validation import (
    ObservationValidationError,
    validate_values,
)
from app.services.rule_evaluator import evaluate as run_evaluation

router = APIRouter(prefix="/properties/{property_id}/observations", tags=["observations"])


SessionDep = Annotated[Session, Depends(get_session)]


class ObservationRead(BaseModel):
    """Observation with both raw + effective values.

    `values` is what the user captured at this point in time — possibly sparse,
    holding only the fields that changed since the previous observation.
    `effective_values` is the merged state after applying every observation up
    to and including this one (oldest-first overlay), so it represents what
    was actually true about the property as of `captured_at`.
    """

    id: int
    property_id: int
    captured_at: datetime
    values: dict[str, Any]
    effective_values: dict[str, Any]


def _to_read(obs: Observation, effective: dict[str, Any]) -> ObservationRead:
    return ObservationRead(
        id=obs.id or 0,
        property_id=obs.property_id,
        captured_at=obs.captured_at,
        values=obs.values or {},
        effective_values=effective,
    )


@router.get("", response_model=list[ObservationRead])
def list_observations(property_id: int, session: SessionDep) -> list[ObservationRead]:
    if PropertyRepository(session).get(property_id) is None:
        raise HTTPException(status_code=404, detail=f"property {property_id} not found")
    chain = build_chain(session, property_id)  # oldest-first
    reads = [_to_read(o, e) for o, e in chain]
    reads.reverse()  # newest-first to match prior behavior
    return reads


@router.post("", response_model=ObservationRead, status_code=status.HTTP_201_CREATED)
def create_observation(
    property_id: int,
    payload: ObservationCreate,
    session: SessionDep,
) -> ObservationRead:
    if PropertyRepository(session).get(property_id) is None:
        raise HTTPException(status_code=404, detail=f"property {property_id} not found")

    fields = ObservationFieldRepository(session).list()
    try:
        validate_values(payload.values, fields)
    except ObservationValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors) from exc

    if not payload.values:
        raise HTTPException(status_code=422, detail="no changes to record")

    created = ObservationRepository(session).create(property_id, payload.values, captured_at=payload.captured_at)
    chain = build_chain(session, property_id)
    effective = next(e for o, e in chain if o.id == created.id)
    return _to_read(created, effective)


@router.patch("/{observation_id}", response_model=ObservationRead)
def update_observation(
    property_id: int,
    observation_id: int,
    payload: ObservationCreate,
    session: SessionDep,
) -> ObservationRead:
    if PropertyRepository(session).get(property_id) is None:
        raise HTTPException(status_code=404, detail=f"property {property_id} not found")

    repo = ObservationRepository(session)
    existing = repo.get(observation_id)
    if existing is None or existing.property_id != property_id:
        raise HTTPException(status_code=404, detail=f"observation {observation_id} not found")

    fields = ObservationFieldRepository(session).list()
    try:
        validate_values(payload.values, fields)
    except ObservationValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors) from exc

    updated = repo.update(observation_id, payload.values, captured_at=payload.captured_at)
    assert updated is not None
    chain = build_chain(session, property_id)
    effective = next(e for o, e in chain if o.id == updated.id)
    return _to_read(updated, effective)


@router.post("/{observation_id}/evaluate", response_model=EvaluationResult)
def evaluate_observation(
    property_id: int,
    observation_id: int,
    session: SessionDep,
    as_of: Annotated[
        datetime | None,
        Query(description="If set, ignore rules + mitigations created after this timestamp."),
    ] = None,
) -> EvaluationResult:
    if PropertyRepository(session).get(property_id) is None:
        raise HTTPException(status_code=404, detail=f"property {property_id} not found")

    # Normalize tz-aware as_of (the frontend sends UTC ISO strings ending in `Z`)
    # to naive UTC, since `Rule.created_at` and `Mitigation.created_at` are
    # stored naive (via `datetime.utcnow()`). Mixing aware + naive raises
    # TypeError in the comparator. Strip the tzinfo *after* converting to UTC
    # so the wall-clock value stays correct.
    if as_of is not None and as_of.tzinfo is not None:
        as_of = as_of.astimezone(UTC).replace(tzinfo=None)

    chain = build_chain(session, property_id)
    target_pair = next((p for p in chain if p[0].id == observation_id), None)
    if target_pair is None:
        raise HTTPException(status_code=404, detail=f"observation {observation_id} not found")
    target, effective = target_pair

    rules = RuleRepository(session).list()
    fields = ObservationFieldRepository(session).list()
    return run_evaluation(
        effective,
        rules,
        observation_id=target.id or 0,
        property_id=target.property_id,
        as_of=as_of,
        fields=fields,
    )
