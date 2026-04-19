"""Async SQLAlchemy plumbing + the single ``campaigns`` table.

Campaigns own a list of "leads" (each one is the full prospect payload the
frontend already constructs in ``adaptProspectToLead``). To avoid splitting
that nested shape across multiple tables, we just store the leads list as a
JSON column on the campaign row.

Drivers:
- Production / docker-compose: ``postgresql+asyncpg`` against the ``db`` service.
- Local dev fallback: ``sqlite+aiosqlite`` if ``DATABASE_URL`` is unset, so
  ``uvicorn main:app --reload`` works without a Postgres install.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from sqlalchemy import JSON, DateTime, String, func
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

log = logging.getLogger("deal-radar.db")


def _resolve_database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if url:
        # SQLAlchemy needs the async driver scheme. Auto-upgrade the most
        # common bare ``postgresql://`` URL so envs copy-pasted from psql or
        # cloud dashboards keep working.
        if url.startswith("postgresql://"):
            url = "postgresql+asyncpg://" + url[len("postgresql://") :]
        elif url.startswith("postgres://"):
            url = "postgresql+asyncpg://" + url[len("postgres://") :]
        return url
    log.warning(
        "DATABASE_URL not set — falling back to local sqlite at ./dealradar.db. "
        "This is fine for local dev; compose deployments inject a Postgres URL."
    )
    return "sqlite+aiosqlite:///./dealradar.db"


DATABASE_URL = _resolve_database_url()

engine = create_async_engine(DATABASE_URL, echo=False, future=True, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # Each entry is a `Lead` dict identical to what the FE used to build via
    # adaptProspectToLead — keeps the existing UI working without changes.
    leads: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)

    def to_dict(self) -> dict[str, Any]:
        created_at = self.created_at
        if isinstance(created_at, datetime):
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            created_at_iso = created_at.isoformat()
        else:
            created_at_iso = str(created_at) if created_at is not None else None
        return {
            "id": self.id,
            "name": self.name,
            "createdAt": created_at_iso,
            "leads": list(self.leads or []),
        }


async def init_db() -> None:
    """Create tables if they don't exist. Idempotent and safe to run on boot."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    log.info("Database ready at %s", _safe_url(DATABASE_URL))


def _safe_url(url: str) -> str:
    """Strip the password before logging the URL."""
    if "@" not in url:
        return url
    head, tail = url.split("@", 1)
    if "//" in head and ":" in head.split("//", 1)[1]:
        scheme, rest = head.split("//", 1)
        user = rest.split(":", 1)[0]
        return f"{scheme}//{user}:***@{tail}"
    return url


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
