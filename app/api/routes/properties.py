from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session

from app.db import get_session
from app.models.property import Property, PropertyCreate, PropertyUpdate
from app.repository.property_repository import PropertyRepository
from app.repository.rule_repository import RuleRepository
from app.services.observation_chain import build_chain
from app.services.rule_evaluator import evaluate as run_evaluation

router = APIRouter(prefix="/properties", tags=["properties"])


SessionDep = Annotated[Session, Depends(get_session)]


def get_repository(session: SessionDep) -> PropertyRepository:
    return PropertyRepository(session)


RepoDep = Annotated[PropertyRepository, Depends(get_repository)]


class PropertyListItem(BaseModel):
    """Property row enriched with the outstanding-evaluation summary so the
    underwriter can scan their portfolio at a glance.

    Outstanding counts are computed by evaluating the property's most recent
    observation (with effective values merged through history) against the
    active rule set. When a property has no observations yet, the counts are
    zero and `latest_observation_at` is null."""

    id: int
    street: str
    unit: str | None = None
    city: str
    state: str
    zip: str
    nickname: str | None = None
    created_at: datetime
    updated_at: datetime
    observation_count: int
    latest_observation_at: datetime | None
    outstanding_vulnerability_count: int
    outstanding_full_mitigation_count: int
    outstanding_bridge_mitigation_count: int


@router.get("", response_model=list[PropertyListItem])
def list_properties(session: SessionDep) -> list[PropertyListItem]:
    properties = PropertyRepository(session).list()
    rules = RuleRepository(session).list()
    out: list[PropertyListItem] = []
    for prop in properties:
        chain = build_chain(session, prop.id or 0)  # oldest-first
        if chain:
            latest_obs, effective = chain[-1]
            result = run_evaluation(effective, rules)
            out.append(
                PropertyListItem(
                    **prop.model_dump(),
                    observation_count=len(chain),
                    latest_observation_at=latest_obs.captured_at,
                    outstanding_vulnerability_count=len(result.vulnerabilities),
                    outstanding_full_mitigation_count=len(result.full_mitigations),
                    outstanding_bridge_mitigation_count=result.bridge_mitigation_count,
                )
            )
        else:
            out.append(
                PropertyListItem(
                    **prop.model_dump(),
                    observation_count=0,
                    latest_observation_at=None,
                    outstanding_vulnerability_count=0,
                    outstanding_full_mitigation_count=0,
                    outstanding_bridge_mitigation_count=0,
                )
            )
    return out


@router.post("", response_model=Property, status_code=status.HTTP_201_CREATED)
def create_property(payload: PropertyCreate, repo: RepoDep) -> Property:
    return repo.create(payload)


@router.get("/{property_id}", response_model=Property)
def get_property(property_id: int, repo: RepoDep) -> Property:
    prop = repo.get(property_id)
    if prop is None:
        raise HTTPException(status_code=404, detail=f"property {property_id} not found")
    return prop


@router.patch("/{property_id}", response_model=Property)
def update_property(property_id: int, payload: PropertyUpdate, repo: RepoDep) -> Property:
    prop = repo.update(property_id, payload)
    if prop is None:
        raise HTTPException(status_code=404, detail=f"property {property_id} not found")
    return prop


@router.delete("/{property_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_property(property_id: int, repo: RepoDep) -> None:
    if not repo.delete(property_id):
        raise HTTPException(status_code=404, detail=f"property {property_id} not found")
    return None
