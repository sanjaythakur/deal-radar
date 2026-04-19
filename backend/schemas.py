from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class Filters(BaseModel):
    raw: str = ""
    titles: list[str] = Field(default_factory=list)
    industries: list[str] = Field(default_factory=list)
    regions: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    country_iso3: Optional[str] = None
    companies: list[str] = Field(default_factory=list)


class Prospect(BaseModel):
    name: str
    title: str = ""
    company: str = ""
    location: str = ""
    profile_url: Optional[str] = None
    company_domain: Optional[str] = None
    crustdata_company_id: Optional[int] = None
    score: int = 0
    hook: str = ""
    company_news: str = Field(default="", alias="companyNews")
    recent_post: str = Field(default="", alias="recentPost")
    pain_point: str = Field(default="", alias="painPoint")
    talking_points: list[str] = Field(default_factory=list, alias="talkingPoints")
    email_subject: str = Field(default="", alias="emailSubject")
    email_body: str = Field(default="", alias="emailBody")
    raw_signals: dict[str, Any] = Field(default_factory=dict)

    model_config = {
        "populate_by_name": True,
    }


class ParseQueryRequest(BaseModel):
    query: str


class EnrichRequest(BaseModel):
    filters: Filters


class WebSignalsRequest(BaseModel):
    prospects: list[Prospect]


class ScoreRequest(BaseModel):
    prospect: Prospect
    signals: dict[str, Any] = Field(default_factory=dict)


class ScoreResponse(BaseModel):
    score: int


class OutreachRequest(BaseModel):
    prospect: Prospect


class OutreachResponse(BaseModel):
    subject: str
    body: str
