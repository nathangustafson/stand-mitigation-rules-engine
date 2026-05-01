from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session

from app.db import get_session
from app.models.observation import ObservationField
from app.repository.observation_field_repository import ObservationFieldRepository

router = APIRouter(prefix="/observation-fields", tags=["observation-fields"])


def get_repository(
    session: Annotated[Session, Depends(get_session)],
) -> ObservationFieldRepository:
    return ObservationFieldRepository(session)


RepoDep = Annotated[ObservationFieldRepository, Depends(get_repository)]


class ObservationFieldCreate(BaseModel):
    key: str
    label: str
    type: str
    allowed_values: list[str] | None = None
    value_labels: dict[str, str] | None = None
    unit: str | None = None
    group_label: str | None = None
    sort_order: int = 0
    item_schema: dict[str, Any] | None = None


class ObservationFieldUpdate(BaseModel):
    label: str | None = None
    type: str | None = None
    allowed_values: list[str] | None = None
    value_labels: dict[str, str] | None = None
    unit: str | None = None
    group_label: str | None = None
    sort_order: int | None = None
    item_schema: dict[str, Any] | None = None
    deprecated: bool | None = None


@router.get("", response_model=list[ObservationField])
def list_fields(repo: RepoDep) -> list[ObservationField]:
    return repo.list(include_deprecated=True)


@router.post("", response_model=ObservationField, status_code=status.HTTP_201_CREATED)
def create_field(payload: ObservationFieldCreate, repo: RepoDep) -> ObservationField:
    if repo.by_key(payload.key) is not None:
        raise HTTPException(status_code=409, detail=f"field key '{payload.key}' already exists")
    field = ObservationField(**payload.model_dump())
    repo.session.add(field)
    repo.session.commit()
    repo.session.refresh(field)
    return field


@router.get("/{field_id}", response_model=ObservationField)
def get_field(field_id: int, repo: RepoDep) -> ObservationField:
    field = repo.session.get(ObservationField, field_id)
    if field is None:
        raise HTTPException(status_code=404, detail=f"field {field_id} not found")
    return field


@router.patch("/{field_id}", response_model=ObservationField)
def update_field(field_id: int, payload: ObservationFieldUpdate, repo: RepoDep) -> ObservationField:
    field = repo.session.get(ObservationField, field_id)
    if field is None:
        raise HTTPException(status_code=404, detail=f"field {field_id} not found")
    patch = payload.model_dump(exclude_unset=True)
    if "deprecated" in patch:
        field.deprecated_at = datetime.utcnow() if patch.pop("deprecated") else None
    for key, value in patch.items():
        setattr(field, key, value)
    repo.session.add(field)
    repo.session.commit()
    repo.session.refresh(field)
    return field


@router.delete("/{field_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_field(field_id: int, repo: RepoDep) -> None:
    field = repo.session.get(ObservationField, field_id)
    if field is None:
        raise HTTPException(status_code=404, detail=f"field {field_id} not found")
    repo.session.delete(field)
    repo.session.commit()
