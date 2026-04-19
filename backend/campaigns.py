"""Campaign persistence: REST endpoints + Pydantic schemas.

The frontend builds rich lead payloads (see ``src/hooks/useCampaigns.js``
``adaptProspectToLead``) and passes them in verbatim. We treat each lead as
an opaque dict and only enforce the small set of fields we actually mutate
server-side: ``prospectId``, ``status``, ``statusUpdatedAt``, ``notes``.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from db import Campaign, SessionLocal, get_session

log = logging.getLogger("deal-radar.campaigns")

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


DEFAULT_LEAD_STATUS = "Not Started"


# Seeded on first boot so the dashboard isn't empty for new deployments.
# Mirrors src/data/mockCampaigns.js — kept in sync intentionally.
SEED_CAMPAIGNS: list[dict[str, Any]] = [
    {"id": "camp_001", "name": "SEA Hotel Outreach Q2", "createdAt": "2025-04-01T00:00:00+00:00"},
    {"id": "camp_002", "name": "Corporate TMC AI Signal", "createdAt": "2025-03-18T00:00:00+00:00"},
    {"id": "camp_003", "name": "APAC Loyalty Partnerships", "createdAt": "2025-03-05T00:00:00+00:00"},
]


# --- Pydantic request/response shapes -----------------------------------------


class CreateCampaignRequest(BaseModel):
    # Client-generated ids are accepted so the FE can do optimistic creation
    # and not have to re-key its in-memory state once the server responds.
    id: str | None = None
    name: str


class AddLeadsRequest(BaseModel):
    leads: list[dict[str, Any]]


class UpdateLeadRequest(BaseModel):
    status: str | None = None
    notes: str | None = None


class BulkStatusRequest(BaseModel):
    prospectIds: list[str] = Field(default_factory=list)
    status: str


class DeleteLeadsRequest(BaseModel):
    prospectIds: list[str] = Field(default_factory=list)


# --- Helpers ------------------------------------------------------------------


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _get_or_404(session: AsyncSession, campaign_id: str) -> Campaign:
    obj = await session.get(Campaign, campaign_id)
    if obj is None:
        raise HTTPException(status_code=404, detail=f"campaign {campaign_id} not found")
    return obj


def _normalize_lead(lead: dict[str, Any]) -> dict[str, Any] | None:
    """Strip clearly-broken leads and ensure required fields."""
    if not isinstance(lead, dict):
        return None
    prospect_id = lead.get("prospectId") or lead.get("name")
    if not prospect_id:
        return None
    out = dict(lead)
    out["prospectId"] = prospect_id
    out.setdefault("status", DEFAULT_LEAD_STATUS)
    out.setdefault("statusUpdatedAt", _now_iso())
    out.setdefault("addedAt", _now_iso())
    out.setdefault("notes", "")
    return out


# --- Seed (one-shot on boot) --------------------------------------------------


async def seed_if_empty() -> None:
    """Insert SEED_CAMPAIGNS only when the table is completely empty.

    Once a deployment has any campaign (real or seeded), we never touch
    the table again — users can safely delete the seed campaigns.
    """
    async with SessionLocal() as session:
        existing = await session.scalar(select(Campaign).limit(1))
        if existing is not None:
            return
        for seed in SEED_CAMPAIGNS:
            session.add(
                Campaign(
                    id=seed["id"],
                    name=seed["name"],
                    leads=[],
                )
            )
        await session.commit()
    log.info("Seeded %d initial campaigns", len(SEED_CAMPAIGNS))


# --- Endpoints ----------------------------------------------------------------


@router.get("")
async def list_campaigns(session: AsyncSession = Depends(get_session)) -> list[dict[str, Any]]:
    result = await session.scalars(select(Campaign).order_by(Campaign.created_at.desc()))
    return [c.to_dict() for c in result.all()]


@router.post("", status_code=201)
async def create_campaign(
    req: CreateCampaignRequest, session: AsyncSession = Depends(get_session)
) -> dict[str, Any]:
    name = (req.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    campaign_id = req.id or f"camp_{uuid.uuid4().hex[:12]}"
    existing = await session.get(Campaign, campaign_id)
    if existing is not None:
        # Idempotent: if the FE retries an optimistic create, just return
        # what we already have.
        return existing.to_dict()
    campaign = Campaign(id=campaign_id, name=name, leads=[])
    session.add(campaign)
    await session.commit()
    await session.refresh(campaign)
    return campaign.to_dict()


@router.post("/{campaign_id}/leads")
async def add_leads(
    campaign_id: str,
    req: AddLeadsRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    campaign = await _get_or_404(session, campaign_id)
    existing_ids = {l.get("prospectId") for l in (campaign.leads or [])}
    additions: list[dict[str, Any]] = []
    for lead in req.leads or []:
        normalized = _normalize_lead(lead)
        if normalized is None:
            continue
        if normalized["prospectId"] in existing_ids:
            continue
        additions.append(normalized)
        existing_ids.add(normalized["prospectId"])
    if additions:
        campaign.leads = [*(campaign.leads or []), *additions]
        # Plain JSON columns don't track in-place mutations, and even a fresh
        # list assignment can be skipped under some configurations; flagging
        # the attribute makes the UPDATE deterministic.
        flag_modified(campaign, "leads")
        await session.commit()
        await session.refresh(campaign)
    return campaign.to_dict()


@router.patch("/{campaign_id}/leads/{prospect_id}")
async def update_lead(
    campaign_id: str,
    prospect_id: str,
    req: UpdateLeadRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    campaign = await _get_or_404(session, campaign_id)
    leads = list(campaign.leads or [])
    changed = False
    for lead in leads:
        if lead.get("prospectId") != prospect_id:
            continue
        if req.status is not None:
            lead["status"] = req.status
            lead["statusUpdatedAt"] = _now_iso()
            changed = True
        if req.notes is not None:
            lead["notes"] = req.notes
            changed = True
    if not changed:
        return campaign.to_dict()
    campaign.leads = leads
    flag_modified(campaign, "leads")
    await session.commit()
    await session.refresh(campaign)
    return campaign.to_dict()


@router.post("/{campaign_id}/leads/bulk-status")
async def bulk_update_status(
    campaign_id: str,
    req: BulkStatusRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    campaign = await _get_or_404(session, campaign_id)
    target_ids = set(req.prospectIds or [])
    if not target_ids:
        return campaign.to_dict()
    now = _now_iso()
    leads = list(campaign.leads or [])
    for lead in leads:
        if lead.get("prospectId") in target_ids:
            lead["status"] = req.status
            lead["statusUpdatedAt"] = now
    campaign.leads = leads
    flag_modified(campaign, "leads")
    await session.commit()
    await session.refresh(campaign)
    return campaign.to_dict()


@router.post("/{campaign_id}/leads/delete")
async def delete_leads(
    campaign_id: str,
    req: DeleteLeadsRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    campaign = await _get_or_404(session, campaign_id)
    target_ids = set(req.prospectIds or [])
    if not target_ids:
        return campaign.to_dict()
    campaign.leads = [
        l for l in (campaign.leads or []) if l.get("prospectId") not in target_ids
    ]
    flag_modified(campaign, "leads")
    await session.commit()
    await session.refresh(campaign)
    return campaign.to_dict()
