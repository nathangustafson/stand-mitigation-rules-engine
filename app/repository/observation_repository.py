from datetime import datetime
from typing import Any

from sqlmodel import Session, select

from app.models.observation import Observation


class ObservationRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_for_property(self, property_id: int) -> list[Observation]:
        statement = (
            select(Observation)
            .where(Observation.property_id == property_id)
            .order_by(Observation.captured_at.desc(), Observation.id.desc())
        )
        return list(self.session.exec(statement).all())

    def get(self, observation_id: int) -> Observation | None:
        return self.session.get(Observation, observation_id)

    def create(
        self,
        property_id: int,
        values: dict[str, Any],
        captured_at: datetime | None = None,
    ) -> Observation:
        kwargs: dict[str, Any] = {"property_id": property_id, "values": values}
        if captured_at is not None:
            kwargs["captured_at"] = captured_at
        observation = Observation(**kwargs)
        self.session.add(observation)
        self.session.commit()
        self.session.refresh(observation)
        return observation

    def update(
        self,
        observation_id: int,
        values: dict[str, Any],
        captured_at: datetime | None = None,
    ) -> Observation | None:
        observation = self.get(observation_id)
        if observation is None:
            return None
        observation.values = values
        if captured_at is not None:
            observation.captured_at = captured_at
        self.session.add(observation)
        self.session.commit()
        self.session.refresh(observation)
        return observation
