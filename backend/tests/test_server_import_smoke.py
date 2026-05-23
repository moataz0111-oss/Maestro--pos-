"""Smoke test: ensure server.py can be imported without errors.

This guards against a class of failures where a bad import statement in
server.py prevents the FastAPI app from starting at all — manifesting as
HTTP 500 on every endpoint and a blank white screen on the frontend.

Specifically, this catches: accidentally importing from a package whose
`__init__.py` triggers a broken transitive import (the bug seen in
session Feb 21 where `from utils.link_units import ...` ran
`utils/__init__.py` → `utils/auth.py` → missing `models.enums`).
"""
import os
import sys

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "maestro_pos_test")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


def test_server_imports_successfully():
    """server.py must be importable — any ImportError here = white-screen for users."""
    import importlib
    # Force fresh import even if cached from previous tests
    if "server" in sys.modules:
        importlib.reload(sys.modules["server"])
    else:
        import server  # noqa: F401


def test_link_unit_converter_works_via_server():
    """Sanity-check the converter through server's exposed symbol."""
    import server
    # 2 كغم → 2000 غرام
    assert server._convert_link_consumption_to_main(2, "كغم", "غرام", 0, "") == 2000.0
    # Identity
    assert server._convert_link_consumption_to_main(5, "حبة", "حبة", 0, "") == 5
