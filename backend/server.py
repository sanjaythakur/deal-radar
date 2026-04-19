"""Supervisor entry point.

The project's canonical entry is ``main.py`` (see README). Emergent's supervisor
runs ``server:app`` on :8001, so this module simply re-exports the FastAPI app.
"""

from main import app  # noqa: F401
