from datetime import datetime

from pydantic import BaseModel
from pydantic import Field as PydanticField
from sqlmodel import Field, SQLModel


class Property(SQLModel, table=True):
    __tablename__ = "properties"

    id: int | None = Field(default=None, primary_key=True)
    street: str
    unit: str | None = None
    city: str
    state: str = Field(min_length=2, max_length=2)
    zip: str = Field(min_length=5, max_length=10)
    nickname: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


class PropertyCreate(BaseModel):
    street: str = PydanticField(min_length=1)
    unit: str | None = None
    city: str = PydanticField(min_length=1)
    state: str = PydanticField(min_length=2, max_length=2)
    zip: str = PydanticField(min_length=5, max_length=10)
    nickname: str | None = None


class PropertyUpdate(BaseModel):
    street: str | None = PydanticField(default=None, min_length=1)
    unit: str | None = None
    city: str | None = PydanticField(default=None, min_length=1)
    state: str | None = PydanticField(default=None, min_length=2, max_length=2)
    zip: str | None = PydanticField(default=None, min_length=5, max_length=10)
    nickname: str | None = None
