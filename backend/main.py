"""Deal-Radar FastAPI backend.

Owns the Crustdata + OpenAI keys and exposes 5 thin endpoints that the React
frontend (src/api/scaffold.js) calls in sequence.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Load .env *before* importing modules that read env at import time.
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

from crustdata import CrustdataError  # noqa: E402
from llm import generate_outreach, parse_query, score_prospect  # noqa: E402
from pipeline import fetch_web_signals, run_enrich  # noqa: E402
from schemas import (  # noqa: E402
    EnrichRequest,
    EnrichResponse,
    Filters,
    OutreachRequest,
    OutreachResponse,
    ParseQueryRequest,
    Prospect,
    ScoreRequest,
    ScoreResponse,
    WebSignalsRequest,
    WebSignalsResponse,
)

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
log = logging.getLogger("deal-radar")

app = FastAPI(title="Deal-Radar backend", version="0.2.0")

# CORS: not strictly needed when fronted by the Vite proxy, but useful when
# hitting the API directly from curl/Postman during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _http_from_runtime(e: Exception) -> HTTPException:
    return HTTPException(status_code=500, detail=str(e))


def _http_from_crustdata(e: CrustdataError) -> HTTPException:
    return HTTPException(status_code=502, detail={"crustdata": str(e), "body": e.body})


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/parse-query", response_model=Filters)
async def api_parse_query(req: ParseQueryRequest) -> Filters:
    try:
        data = await parse_query(req.query)
    except RuntimeError as e:
        raise _http_from_runtime(e) from e
    return Filters(**data)


@app.post("/api/enrich", response_model=EnrichResponse)
async def api_enrich(req: EnrichRequest) -> EnrichResponse:
    try:
        result = await run_enrich(req.filters.model_dump())
    except CrustdataError as e:
        log.exception("Crustdata enrich failed")
        raise _http_from_crustdata(e) from e
    except RuntimeError as e:
        raise _http_from_runtime(e) from e
    return EnrichResponse(
        prospects=[Prospect(**row) for row in result.get("prospects", [])],
        stats=result.get("stats", {}),
    )


@app.post("/api/web-signals", response_model=WebSignalsResponse)
async def api_web_signals(req: WebSignalsRequest) -> WebSignalsResponse:
    raw = [p.model_dump(by_alias=True) for p in req.prospects]
    try:
        result = await fetch_web_signals(raw)
    except CrustdataError as e:
        log.exception("Crustdata web-signals failed")
        raise _http_from_crustdata(e) from e
    except RuntimeError as e:
        raise _http_from_runtime(e) from e
    return WebSignalsResponse(
        prospects=[Prospect(**row) for row in result.get("prospects", [])],
        stats=result.get("stats", {}),
    )


@app.post("/api/score", response_model=ScoreResponse)
async def api_score(req: ScoreRequest) -> ScoreResponse:
    try:
        score = await score_prospect(req.prospect.model_dump(by_alias=True), req.signals)
    except RuntimeError as e:
        raise _http_from_runtime(e) from e
    return ScoreResponse(score=score)


@app.post("/api/outreach", response_model=OutreachResponse)
async def api_outreach(req: OutreachRequest) -> OutreachResponse:
    try:
        result = await generate_outreach(req.prospect.model_dump(by_alias=True))
    except RuntimeError as e:
        raise _http_from_runtime(e) from e
    return OutreachResponse(**result)
