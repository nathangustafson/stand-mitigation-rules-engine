from datetime import datetime

from sqlmodel import Session, select

from app.models.property import Property, PropertyCreate, PropertyUpdate


class PropertyRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list(self) -> list[Property]:
        return list(self.session.exec(select(Property).order_by(Property.created_at.desc())).all())

    def get(self, property_id: int) -> Property | None:
        return self.session.get(Property, property_id)

    def create(self, data: PropertyCreate) -> Property:
        prop = Property(**data.model_dump())
        self.session.add(prop)
        self.session.commit()
        self.session.refresh(prop)
        return prop

    def update(self, property_id: int, data: PropertyUpdate) -> Property | None:
        prop = self.get(property_id)
        if prop is None:
            return None
        patch = data.model_dump(exclude_unset=True)
        for key, value in patch.items():
            setattr(prop, key, value)
        prop.updated_at = datetime.utcnow()
        self.session.add(prop)
        self.session.commit()
        self.session.refresh(prop)
        return prop

    def delete(self, property_id: int) -> bool:
        prop = self.get(property_id)
        if prop is None:
            return False
        self.session.delete(prop)
        self.session.commit()
        return True
