"""Helpers for walking a property's observation history with merged values.

Pure DB-aware functions used by both /api/observations (for the read response
that exposes `effective_values`) and /api/properties (for the list endpoint
that surfaces outstanding-mitigation counts per property).
"""

from typing import Any

from sqlmodel import Session

from app.models.observation import Observation
from app.repository.observation_repository import ObservationRepository


def build_chain(session: Session, property_id: int) -> list[tuple[Observation, dict[str, Any]]]:
    """Return all observations for a property paired with their effective values.

    Output is oldest-first. Each effective dict accumulates predecessor values
    plus the row's own values. An empty list is returned when the property has
    no observations.
    """
    rows = ObservationRepository(session).list_for_property(property_id)  # newest-first
    chronological = sorted(rows, key=lambda o: o.captured_at)
    accumulated: dict[str, Any] = {}
    out: list[tuple[Observation, dict[str, Any]]] = []
    for obs in chronological:
        if obs.values:
            accumulated.update(obs.values)
        out.append((obs, dict(accumulated)))
    return out
