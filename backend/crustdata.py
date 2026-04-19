"""Async client for Crustdata REST endpoints.

Covers the subset Deal-Radar needs:
- /company/identify     (free company resolution)
- /company/search       (build account lists)
- /company/enrich       (news, hiring, funding sections)
- /person/search        (decision-maker discovery)
- /person/enrich        (profile + contact, batch up to 25)
- /web/search           (recent web mentions per prospect)

All requests send the standard auth + version headers.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

import httpx

log = logging.getLogger("crustdata")

BASE_URL = "https://api.crustdata.com"
API_VERSION = "2025-11-01"
DEFAULT_TIMEOUT = 30.0


class CrustdataError(RuntimeError):
    def __init__(self, status: int, body: Any):
        super().__init__(f"Crustdata {status}: {body}")
        self.status = status
        self.body = body


class CrustdataClient:
    def __init__(self, api_key: Optional[str] = None, timeout: float = DEFAULT_TIMEOUT):
        self.api_key = api_key or os.getenv("CRUSTDATA_API_KEY", "")
        if not self.api_key:
            raise RuntimeError("CRUSTDATA_API_KEY is not set")
        self._client = httpx.AsyncClient(
            base_url=BASE_URL,
            timeout=timeout,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "x-api-version": API_VERSION,
                "Content-Type": "application/json",
            },
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "CrustdataClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.aclose()

    async def _post(self, path: str, payload: dict[str, Any]) -> Any:
        log.debug("POST %s %s", path, payload)
        try:
            r = await self._client.post(path, json=payload)
        except httpx.HTTPError as e:
            raise CrustdataError(0, str(e)) from e
        if r.status_code >= 400:
            try:
                body = r.json()
            except Exception:
                body = r.text
            raise CrustdataError(r.status_code, body)
        return r.json()

    # --- company ---------------------------------------------------------

    async def identify_companies(
        self,
        *,
        names: list[str] | None = None,
        domains: list[str] | None = None,
        profile_urls: list[str] | None = None,
        crustdata_company_ids: list[int] | None = None,
        exact_match: bool = False,
    ) -> list[dict[str, Any]]:
        payload: dict[str, Any] = {}
        if names:
            payload["names"] = names
        if domains:
            payload["domains"] = domains
        if profile_urls:
            payload["professional_network_profile_urls"] = profile_urls
        if crustdata_company_ids:
            payload["crustdata_company_ids"] = crustdata_company_ids
        if exact_match:
            payload["exact_match"] = True
        if not payload:
            return []
        return await self._post("/company/identify", payload)

    async def search_companies(
        self,
        *,
        filters: dict[str, Any],
        fields: list[str] | None = None,
        sorts: list[dict[str, Any]] | None = None,
        limit: int = 20,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"filters": filters, "limit": limit}
        if fields:
            payload["fields"] = fields
        if sorts:
            payload["sorts"] = sorts
        return await self._post("/company/search", payload)

    async def enrich_companies(
        self,
        *,
        crustdata_company_ids: list[int] | None = None,
        domains: list[str] | None = None,
        names: list[str] | None = None,
        fields: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        payload: dict[str, Any] = {}
        if crustdata_company_ids:
            payload["crustdata_company_ids"] = crustdata_company_ids
        elif domains:
            payload["domains"] = domains
        elif names:
            payload["names"] = names
        else:
            return []
        if fields:
            payload["fields"] = fields
        return await self._post("/company/enrich", payload)

    # --- person ----------------------------------------------------------

    async def search_persons(
        self,
        *,
        filters: dict[str, Any],
        fields: list[str] | None = None,
        sorts: list[dict[str, Any]] | None = None,
        limit: int = 20,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"filters": filters, "limit": limit}
        if fields:
            payload["fields"] = fields
        if sorts:
            payload["sorts"] = sorts
        return await self._post("/person/search", payload)

    async def enrich_persons(
        self,
        *,
        profile_urls: list[str] | None = None,
        business_emails: list[str] | None = None,
        fields: list[str] | None = None,
        min_similarity_score: float | None = None,
    ) -> list[dict[str, Any]]:
        payload: dict[str, Any] = {}
        if profile_urls:
            # API caps at 25 per request — caller batches.
            payload["professional_network_profile_urls"] = profile_urls[:25]
        elif business_emails:
            payload["business_emails"] = business_emails[:25]
            if min_similarity_score is not None:
                payload["min_similarity_score"] = min_similarity_score
        else:
            return []
        if fields:
            payload["fields"] = fields
        return await self._post("/person/enrich", payload)

    # --- web -------------------------------------------------------------

    async def web_search(self, *, query: str, limit: int = 5) -> dict[str, Any]:
        # NOTE: live endpoint is /screener/web-search (the /web/search path
        # listed elsewhere returns 404).
        payload = {"query": query, "limit": limit}
        return await self._post("/screener/web-search", payload)
