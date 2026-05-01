import os
from collections.abc import Generator
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "app.db"
DATABASE_URL = os.environ.get("DATABASE_URL") or f"sqlite:///{DEFAULT_DB_PATH}"

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, echo=False)


def init_db() -> None:
    if DATABASE_URL.startswith("sqlite:///"):
        DEFAULT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(engine)
    _apply_idempotent_migrations()


def _apply_idempotent_migrations() -> None:
    """Add columns introduced after a table was first created.

    SQLModel's create_all is a no-op for tables that already exist, so new
    columns require an explicit ALTER. Each step here is idempotent.
    """
    with engine.connect() as conn:
        mitigation_cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(mitigations)").fetchall()}
        if mitigation_cols and "created_at" not in mitigation_cols:
            # SQLite ALTER TABLE ADD COLUMN can't take a non-constant default,
            # so we add it nullable and let the as_of filter treat NULL as
            # "ancient". Newly inserted rows get a timestamp from the model's
            # default_factory.
            conn.exec_driver_sql("ALTER TABLE mitigations ADD COLUMN created_at TEXT")
            conn.commit()

        field_cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(observation_fields)").fetchall()}
        if field_cols and "value_labels" not in field_cols:
            conn.exec_driver_sql("ALTER TABLE observation_fields ADD COLUMN value_labels JSON")
            conn.commit()

        rule_cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(rules)").fetchall()}
        if rule_cols and "severity" not in rule_cols:
            # Add nullable, then backfill from priority so existing rules
            # keep the severity they used to derive from the
            # ≥80 high / ≥50 medium / else low ladder.
            conn.exec_driver_sql("ALTER TABLE rules ADD COLUMN severity TEXT")
            conn.exec_driver_sql(
                "UPDATE rules SET severity = "
                "CASE WHEN priority >= 80 THEN 'high' "
                "WHEN priority >= 50 THEN 'medium' "
                "ELSE 'low' END "
                "WHERE severity IS NULL"
            )
            conn.commit()


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
