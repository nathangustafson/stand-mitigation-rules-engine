from sqlmodel import Session, select

from app.models.observation import ObservationField


class ObservationFieldRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list(self, include_deprecated: bool = False) -> list[ObservationField]:
        statement = select(ObservationField).order_by(ObservationField.sort_order, ObservationField.id)
        rows = list(self.session.exec(statement).all())
        if include_deprecated:
            return rows
        return [r for r in rows if r.deprecated_at is None]

    def by_key(self, key: str) -> ObservationField | None:
        return self.session.exec(select(ObservationField).where(ObservationField.key == key)).first()
