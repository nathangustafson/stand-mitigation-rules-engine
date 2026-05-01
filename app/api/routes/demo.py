from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from app.db import get_session
from app.seed import seed_demo_data

router = APIRouter(prefix="/demo", tags=["demo"])


class DemoSeedResult(BaseModel):
    properties_created: int
    observations_created: int
    properties_skipped: int


@router.post("/seed", response_model=DemoSeedResult)
def post_seed(session: Annotated[Session, Depends(get_session)]) -> DemoSeedResult:
    """Idempotent — re-clicking does not duplicate properties."""
    result = seed_demo_data(session)
    return DemoSeedResult(**result)
