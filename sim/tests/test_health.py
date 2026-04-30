"""Smoke tests for the sim service."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "version" in body


def test_simulate_skeleton_returns_empty_aggregate() -> None:
    payload = {
        "deck": {
            "name": "Test",
            "commander": "Atraxa, Praetors' Voice",
            "color_identity": "WUBG",
            "cards": [],
        },
        "opponents": [],
        "games": 3,
    }
    r = client.post("/simulate", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert len(body["games"]) == 3
    assert body["aggregate"]["games"] == 3
    assert body["aggregate"]["win_rate"] == 0.0
    assert any("Phase 1 skeleton" in n for n in body["notes"])
