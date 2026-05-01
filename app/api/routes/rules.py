from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.db import get_session
from app.models.evaluation import RuleTestInput, RuleTestResult
from app.models.rule import Mitigation, MitigationInput, RuleCreate, RuleRead, RuleUpdate
from app.repository.observation_field_repository import ObservationFieldRepository
from app.repository.rule_repository import RuleRepository
from app.services.rule_evaluator import evaluate_single_rule

router = APIRouter(prefix="/rules", tags=["rules"])


def get_repository(session: Annotated[Session, Depends(get_session)]) -> RuleRepository:
    return RuleRepository(session)


RepoDep = Annotated[RuleRepository, Depends(get_repository)]


@router.get("", response_model=list[RuleRead])
def list_rules(repo: RepoDep) -> list[RuleRead]:
    return [RuleRead.model_validate(r) for r in repo.list()]


@router.post("", response_model=RuleRead, status_code=status.HTTP_201_CREATED)
def create_rule(payload: RuleCreate, repo: RepoDep) -> RuleRead:
    return RuleRead.model_validate(repo.create(payload))


@router.get("/{rule_id}", response_model=RuleRead)
def get_rule(rule_id: int, repo: RepoDep) -> RuleRead:
    rule = repo.get(rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail=f"rule {rule_id} not found")
    return RuleRead.model_validate(rule)


@router.patch("/{rule_id}", response_model=RuleRead)
def update_rule(rule_id: int, payload: RuleUpdate, repo: RepoDep) -> RuleRead:
    rule = repo.update(rule_id, payload)
    if rule is None:
        raise HTTPException(status_code=404, detail=f"rule {rule_id} not found")
    return RuleRead.model_validate(rule)


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(rule_id: int, repo: RepoDep) -> None:
    if not repo.delete(rule_id):
        raise HTTPException(status_code=404, detail=f"rule {rule_id} not found")


# --- per-mitigation endpoints -----------------------------------------------


@router.post(
    "/{rule_id}/mitigations",
    response_model=Mitigation,
    status_code=status.HTTP_201_CREATED,
)
def add_mitigation(rule_id: int, payload: MitigationInput, repo: RepoDep) -> Mitigation:
    mitigation = repo.add_mitigation(rule_id, payload)
    if mitigation is None:
        raise HTTPException(status_code=404, detail=f"rule {rule_id} not found")
    return mitigation


@router.patch("/{rule_id}/mitigations/{mitigation_id}", response_model=Mitigation)
def update_mitigation(rule_id: int, mitigation_id: int, payload: MitigationInput, repo: RepoDep) -> Mitigation:
    mitigation = repo.update_mitigation(rule_id, mitigation_id, payload)
    if mitigation is None:
        raise HTTPException(
            status_code=404,
            detail=f"mitigation {mitigation_id} not found on rule {rule_id}",
        )
    return mitigation


@router.delete(
    "/{rule_id}/mitigations/{mitigation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_mitigation(rule_id: int, mitigation_id: int, repo: RepoDep) -> None:
    if not repo.delete_mitigation(rule_id, mitigation_id):
        raise HTTPException(
            status_code=404,
            detail=f"mitigation {mitigation_id} not found on rule {rule_id}",
        )


@router.post("/{rule_id}/test", response_model=RuleTestResult)
def test_rule(
    rule_id: int,
    payload: RuleTestInput,
    repo: RepoDep,
    session: Annotated[Session, Depends(get_session)],
) -> RuleTestResult:
    """Evaluate a single rule against an observation values dict.

    Used by Applied Sciences to validate a rule's behavior against a known
    observation (or hypothetical values) without running the whole rule set.
    """
    rule = repo.get(rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail=f"rule {rule_id} not found")
    fields = ObservationFieldRepository(session).list()
    detail = evaluate_single_rule(rule, payload.values, fields=fields)
    holds = detail is None
    full = [m for m in rule.mitigations if m.tier == "full"] if not holds else []
    bridge = [m for m in rule.mitigations if m.tier == "bridge"] if not holds else []
    return RuleTestResult(
        rule_id=rule.id or 0,
        rule_name=rule.name,
        rule_type=rule.type,
        holds=holds,
        detail=detail,
        full_mitigations=full,
        bridge_mitigations=bridge,
    )
