"""Test configuration: isolate the database and uploads in a temporary directory.

Environment variables must be set before any ``app`` module is imported.
"""

import os
import shutil
import tempfile

_TMP = tempfile.mkdtemp(prefix="gv-tests-")
os.environ["DATABASE_PATH"] = os.path.join(_TMP, "test.db")
os.environ["UPLOAD_DIR"] = os.path.join(_TMP, "uploads")
os.environ["SERVE_FRONTEND"] = "false"
os.environ["MAX_DETECTION_FPS"] = "30"

import pytest  # noqa: E402


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    import main

    with TestClient(main.app) as c:
        yield c


def pytest_sessionfinish(session, exitstatus):
    shutil.rmtree(_TMP, ignore_errors=True)
