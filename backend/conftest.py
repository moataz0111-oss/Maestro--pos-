"""Backend pytest configuration.

Disables bytecode (.pyc) generation to prevent __pycache__ directories from
being created during test runs. This is critical because Emergent's auto-commit
mechanism explicitly tries to `git add` every changed path, and when it
encounters a gitignored `__pycache__` path, the entire `git add` command fails
silently — preventing the commit from being created and thus blocking the
"Save to GitHub" feature from pushing any new code.

By setting `sys.dont_write_bytecode = True` early (before any test imports),
Python never writes .pyc files and __pycache__ directories never appear.
"""
import sys

sys.dont_write_bytecode = True
