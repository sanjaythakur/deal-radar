"""Campaigns CRUD persisted in MongoDB.

The frontend previously kept campaigns in localStorage. Same shape is preserved
here so the existing React components read the response unchanged:

    {
      "id":         "camp_...",
      "name":       str,
      "createdAt":  ISO8601 str,
      "leads":      [ lead, ... ]   # prospect-shaped dict + status/notes/provenance
    }

We store documents with ``_id`` set to the campaign id (string) so we never
return the Mongo ObjectId to the client.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from db import campaigns_collection

DEFAULT_LEAD_STATUS = "Not Started"

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


# ---------- request/response models ----------


class CreateCampaignRequest(BaseModel):
    name: str


class AddLeadsRequest(BaseModel):
    prospects: list[dict[str, Any]] = Field(default_factory=list)
    provenance_context: Optional[dict[str, Any]] = Field(default=None, alias="provenanceContext")

    model_config = {"populate_by_name": True}


class UpdateLeadRequest(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None


class BulkStatusRequest(BaseModel):
    prospect_ids: list[str] = Field(default_factory=list, alias="prospectIds")
    status: str

    model_config = {"populate_by_name": True}


class RemoveLeadsRequest(BaseModel):
    prospect_ids: list[str] = Field(default_factory=list, alias="prospectIds")

    model_config = {"populate_by_name": True}


# ---------- helpers ----------


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _serialize(doc: dict[str, Any]) -> dict[str, Any]:
    """Translate Mongo ``_id`` -> ``id`` for the client."""
    if not doc:
        return doc
    out = dict(doc)
    out["id"] = out.pop("_id")
    return out


def _adapt_prospect_to_lead(
    prospect: dict[str, Any],
    provenance_context: Optional[dict[str, Any]],
) -> dict[str, Any]:
    """Mirror the frontend's ``adaptProspectToLead`` so campaigns created via
    the API look identical to ones created on the client."""
    now = _now_iso()
    score = prospect.get("score")
    lead = dict(prospect)
    lead.update(
        {
            "prospectId": prospect.get("name"),
            "name": prospect.get("name"),
            "title": prospect.get("title", "") or "",
            "company": prospect.get("company", "") or "",
            "location": prospect.get("location", "") or "",
            "score": score if isinstance(score, (int, float)) else 0,
            "addedAt": now,
            "status": DEFAULT_LEAD_STATUS,
            "statusUpdatedAt": now,
            "notes": "",
            "provenance": {
                "addedAt": now,
                "query": (provenance_context or {}).get("query"),
                "pipelineStats": (provenance_context or {}).get("pipelineStats"),
                "totalCandidates": (provenance_context or {}).get("totalCandidates"),
                "signal": {
                    "hook": prospect.get("hook"),
                    "companyNews": prospect.get("companyNews"),
                    "recentPost": prospect.get("recentPost"),
                    "painPoint": prospect.get("painPoint"),
                    "talkingPoints": prospect.get("talkingPoints"),
                    "rawSignals": prospect.get("raw_signals"),
                },
                "ranking": {
                    "score": score if isinstance(score, (int, float)) else None,
                },
            },
        }
    )
    return lead


# ---------- routes ----------


@router.get("")
async def list_campaigns() -> list[dict[str, Any]]:
    col = campaigns_collection()
    # Newest first, matches the client-side prepend behaviour.
    docs = await col.find({}).sort("createdAt", -1).to_list(length=None)
    return [_serialize(d) for d in docs]


@router.post("")
async def create_campaign(req: CreateCampaignRequest) -> dict[str, Any]:
    name = (req.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Campaign name is required")
    doc = {
        "_id": f"camp_{uuid4().hex[:12]}",
        "name": name,
        "createdAt": _now_iso(),
        "leads": [],
    }
    await campaigns_collection().insert_one(doc)
    return _serialize(doc)


@router.post("/{campaign_id}/leads")
async def add_leads(campaign_id: str, req: AddLeadsRequest) -> dict[str, Any]:
    col = campaigns_collection()
    campaign = await col.find_one({"_id": campaign_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    existing_ids = {lead.get("prospectId") for lead in campaign.get("leads", [])}
    additions = [
        _adapt_prospect_to_lead(p, req.provenance_context)
        for p in req.prospects
        if p and p.get("name") and p.get("name") not in existing_ids
    ]
    if additions:
        await col.update_one(
            {"_id": campaign_id},
            {"$push": {"leads": {"$each": additions}}},
        )
    updated = await col.find_one({"_id": campaign_id})
    return _serialize(updated)


@router.patch("/{campaign_id}/leads/{prospect_id}")
async def update_lead(
    campaign_id: str, prospect_id: str, req: UpdateLeadRequest
) -> dict[str, Any]:
    if req.status is None and req.notes is None:
        raise HTTPException(status_code=400, detail="Nothing to update")

    set_fields: dict[str, Any] = {}
    if req.status is not None:
        set_fields["leads.$.status"] = req.status
        set_fields["leads.$.statusUpdatedAt"] = _now_iso()
    if req.notes is not None:
        set_fields["leads.$.notes"] = req.notes

    col = campaigns_collection()
    result = await col.update_one(
        {"_id": campaign_id, "leads.prospectId": prospect_id},
        {"$set": set_fields},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Campaign or lead not found")

    updated = await col.find_one({"_id": campaign_id})
    return _serialize(updated)


@router.post("/{campaign_id}/leads/bulk-status")
async def bulk_update_status(
    campaign_id: str, req: BulkStatusRequest
) -> dict[str, Any]:
    if not req.prospect_ids:
        raise HTTPException(status_code=400, detail="prospectIds is required")

    col = campaigns_collection()
    now = _now_iso()
    await col.update_one(
        {"_id": campaign_id},
        {
            "$set": {
                "leads.$[elem].status": req.status,
                "leads.$[elem].statusUpdatedAt": now,
            }
        },
        array_filters=[{"elem.prospectId": {"$in": req.prospect_ids}}],
    )
    updated = await col.find_one({"_id": campaign_id})
    if not updated:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return _serialize(updated)


@router.post("/{campaign_id}/leads/remove")
async def remove_leads(campaign_id: str, req: RemoveLeadsRequest) -> dict[str, Any]:
    if not req.prospect_ids:
        raise HTTPException(status_code=400, detail="prospectIds is required")

    col = campaigns_collection()
    result = await col.update_one(
        {"_id": campaign_id},
        {"$pull": {"leads": {"prospectId": {"$in": req.prospect_ids}}}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Campaign not found")

    updated = await col.find_one({"_id": campaign_id})
    return _serialize(updated)
