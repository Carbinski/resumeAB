import logging
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from resume_ab.api import create_app
from resume_ab.cohort import MATCH_BUDGET
from resume_ab.place import _elo_after, _select_category_anchor
from resume_ab.store import Store
from tests.fakes import ScriptedJudge

CATEGORIES = {"impact", "depth", "leadership", "fit", "trajectory", "clarity"}

RESUME = """Ada Lovelace
ada.lovelace@example.test
(415) 555-0199
18 Birch Street
Austin, TX 78701
https://linkedin.com/in/ada
github.com/ada/ranking

Software engineer intern

Experience
- Intern at Northwind Labs. Cut p95 latency from 900ms to 240ms on the list endpoint.
- Built a queue for index rebuilds used by two campus departments.
Education
- State university, computer science, expected 2027.
"""

SECOND = """Grace Hopper
grace.hopper@example.test
212-555-0133
9 Harbor Lane
Boston, MA 02115

Software engineer intern

Experience
- Intern at Harbor & Finch. Shipped a seller checklist used by 1200 signups.
- Rewrote a flaky test suite so the main branch stayed green.
Education
- State university, computer science, expected 2026.
"""


def _client(tmp_path: Path) -> tuple[TestClient, ScriptedJudge, Store]:
    store = Store(tmp_path / "ladder.db", tmp_path / "blobs")
    store.seed_anchors()
    judge = ScriptedJudge()
    app = create_app(store, judge, sync=True)
    return TestClient(app), judge, store


def _signup(client: TestClient, email: str, company: str, industry: str = "software") -> None:
    response = client.post(
        "/auth/signup",
        json={
            "email": email,
            "password": "correct-horse",
            "nameOnResume": "Ada Lovelace" if "ada" in email else "Grace Hopper",
            "level": "intern",
            "industry": industry,
            "company": company,
        },
    )
    assert response.status_code == 200, response.text


def test_upload_redacts_before_the_judge_and_stays_under_the_match_budget(tmp_path: Path, caplog):
    caplog.set_level("INFO", logger="resume_ab.text")
    text_log = logging.getLogger("resume_ab.text")
    text_log.addHandler(caplog.handler)
    client, judge, store = _client(tmp_path)
    _signup(client, "ada@example.test", "Northwind")

    response = client.post(
        "/versions",
        files={"file": ("resume.txt", RESUME.encode(), "text/plain")},
        data={"note": "First version", "draft": "false"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["label"] == "v1"
    assert body["standing"]["status"] == "rated"
    assert 1 <= body["standing"]["matchesPlayed"] <= MATCH_BUDGET
    assert body["standing"]["band"]
    assert set(body["categories"]) == CATEGORIES
    assert "ada.lovelace@example.test" not in response.text
    assert "555-0199" not in response.text

    pool_calls = [call for call in judge.calls if not call[2]]
    category_calls = [call for call in judge.calls if call[2]]
    assert 1 <= len(pool_calls) <= MATCH_BUDGET
    assert len(category_calls) == 1
    assert all(not categories for _left, _right, categories in pool_calls)
    blob = "\n".join(judge.seen)
    assert "ada.lovelace@example.test" not in blob
    assert "Ada Lovelace" not in blob
    assert "Birch Street" not in blob
    assert "Northwind Labs" in blob
    assert "linkedin.com" not in blob

    stored = store.get_resume(body["id"])
    assert stored is not None
    assert stored.redacted_text is not None
    assert "ada.lovelace@example.test" not in stored.redacted_text
    try:
        assert "extracted" in caplog.text
        redacted_log = caplog.text.split("redacted", 1)[1]
        assert "ada.lovelace@example.test" not in redacted_log
        assert "Northwind Labs" in redacted_log
    finally:
        text_log.removeHandler(caplog.handler)


def test_first_version_scores_categories_and_the_second_moves_them(tmp_path: Path):
    client, judge, store = _client(tmp_path)
    _signup(client, "ada@example.test", "Northwind")
    first = client.post(
        "/versions",
        files={"file": ("one.txt", RESUME.encode(), "text/plain")},
        data={"draft": "false"},
    )
    assert first.status_code == 200, first.text
    body = first.json()
    resume_id = body["id"]
    stored = store.get_resume(resume_id)
    assert stored is not None and stored.user_id is not None
    assert store.previous_published(stored.user_id, stored.created_at) is None
    assert set(body["categories"]) == CATEGORIES

    membership = store.memberships_for(resume_id)["intern"]
    scores = store.category_scores(resume_id)
    assert set(scores) == CATEGORIES
    for category_id, elo in scores.items():
        assert elo == pytest.approx(_elo_after(membership.elo, judge.probability))
        assert body["categories"][category_id] == round(elo)

    category_calls = [call for call in judge.calls if call[2]]
    assert len(category_calls) == 1
    left, right, _categories = category_calls[0]
    assert left == stored.redacted_text
    anchors = [
        candidate
        for candidate in store.candidates("intern")
        if candidate.anchor_slot is not None
    ]
    expected = _select_category_anchor(anchors, membership.elo)
    assert expected is not None
    anchor = store.get_resume(expected.id)
    assert anchor is not None and anchor.is_synthetic
    assert right == anchor.redacted_text
    assert right != stored.redacted_text

    calls_after_first = len(judge.calls)
    second = client.post(
        "/versions",
        files={"file": ("two.txt", SECOND.encode(), "text/plain")},
        data={"note": "Added a metric", "draft": "false"},
    )
    assert second.status_code == 200, second.text
    later = second.json()
    assert later["label"] == "v2"
    assert set(later["categories"]) == CATEGORIES
    second_resume = store.get_resume(later["id"])
    assert second_resume is not None and second_resume.redacted_text is not None
    moved = store.category_scores(later["id"])
    assert set(moved) == CATEGORIES
    for category_id, elo in moved.items():
        assert elo == pytest.approx(_elo_after(scores[category_id], judge.probability))
        assert later["categories"][category_id] == round(elo)
        assert later["categories"][category_id] != body["categories"][category_id]

    second_category_calls = [call for call in judge.calls[calls_after_first:] if call[2]]
    assert len(second_category_calls) == 1
    assert second_category_calls[0][0] == second_resume.redacted_text
    assert second_category_calls[0][1] == stored.redacted_text
    assert len(judge.calls) - calls_after_first <= MATCH_BUDGET + 1


class _CategoryFailJudge(ScriptedJudge):
    def compare(self, left, right, role_description, *, categories: bool = False):
        if categories:
            raise RuntimeError("category judge failed")
        return super().compare(left, right, role_description, categories=categories)


def test_category_failure_leaves_a_rated_version_without_scores(tmp_path: Path):
    store = Store(tmp_path / "ladder.db", tmp_path / "blobs")
    store.seed_anchors()
    client = TestClient(create_app(store, _CategoryFailJudge(), sync=True))
    _signup(client, "ada@example.test", "Northwind")
    response = client.post(
        "/versions",
        files={"file": ("resume.txt", RESUME.encode(), "text/plain")},
        data={"draft": "false"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["standing"]["status"] == "rated"
    assert body["categories"] == {}


def test_second_version_learns_categories_and_a_unique_company_is_visible(tmp_path: Path):
    client, judge, _store = _client(tmp_path)
    _signup(client, "ada@example.test", "Only Clinic", industry="healthcare")
    first = client.post(
        "/versions",
        files={"file": ("one.txt", RESUME.encode(), "text/plain")},
        data={"draft": "false"},
    )
    assert first.status_code == 200, first.text
    calls_after_first = len(judge.calls)

    second = client.post(
        "/versions",
        files={"file": ("two.txt", SECOND.encode(), "text/plain")},
        data={"note": "Added a metric", "draft": "false"},
    )
    assert second.status_code == 200, second.text
    body = second.json()
    assert body["label"] == "v2"
    assert set(body["categories"]) == {"impact", "depth", "leadership", "fit", "trajectory", "clarity"}
    category_calls = [call for call in judge.calls[calls_after_first:] if call[2]]
    assert len(category_calls) == 1
    assert len(judge.calls) - calls_after_first <= MATCH_BUDGET + 1

    other = TestClient(client.app)
    _signup(other, "grace@example.test", "Tiny Bank", industry="finance")
    peer = other.post(
        "/versions",
        files={"file": ("peer.txt", SECOND.encode(), "text/plain")},
        data={"draft": "false"},
    )
    assert peer.status_code == 200, peer.text
    standing = peer.json()["standing"]
    assert standing["widened"] is True
    assert any(card["company"] == "Only Clinic" for card in standing["neighbors"])


def test_delete_removes_text_and_the_public_card(tmp_path: Path):
    client, _judge, store = _client(tmp_path)
    _signup(client, "ada@example.test", "Northwind")
    uploaded = client.post(
        "/versions",
        files={"file": ("resume.txt", RESUME.encode(), "text/plain")},
        data={"draft": "false"},
    )
    resume_id = uploaded.json()["id"]
    stored = store.get_resume(resume_id)
    assert stored is not None and stored.file_path is not None
    file_path = Path(stored.file_path)

    other = TestClient(client.app)
    _signup(other, "grace@example.test", "Harbor")
    other.post(
        "/versions",
        files={"file": ("two.txt", SECOND.encode(), "text/plain")},
        data={"draft": "false"},
    )

    deleted = client.delete("/me")
    assert deleted.status_code == 200
    assert client.get("/me").status_code == 401
    gone = store.get_resume(resume_id)
    assert gone is not None
    assert gone.redacted_text is None
    assert gone.tombstoned
    assert not file_path.exists()

    refreshed = other.get("/versions")
    assert refreshed.status_code == 200
    neighbors = refreshed.json()[0]["standing"]["neighbors"]
    assert all(card["company"] != "Northwind" for card in neighbors)


def test_login_and_private_versions(tmp_path: Path):
    client, _judge, _store = _client(tmp_path)
    _signup(client, "ada@example.test", "Northwind")
    client.post("/auth/logout")
    denied = client.post(
        "/versions",
        files={"file": ("resume.txt", RESUME.encode(), "text/plain")},
    )
    assert denied.status_code == 401

    wrong = client.post("/auth/login", json={"email": "ada@example.test", "password": "nope-nope"})
    assert wrong.status_code == 401
    ok = client.post("/auth/login", json={"email": "ada@example.test", "password": "correct-horse"})
    assert ok.status_code == 200
    assert ok.json()["level"] == "intern"

    other = TestClient(client.app)
    _signup(other, "grace@example.test", "Harbor")
    uploaded = client.post(
        "/versions",
        files={"file": ("resume.txt", RESUME.encode(), "text/plain")},
        data={"draft": "false"},
    )
    resume_id = uploaded.json()["id"]
    hidden = other.post(f"/versions/{resume_id}/publish")
    assert hidden.status_code == 404


def test_named_upload_and_delete_one_resume(tmp_path: Path):
    client, _judge, store = _client(tmp_path)
    _signup(client, "ada@example.test", "Northwind")

    named = client.post(
        "/versions",
        files={"file": ("summer-intern.txt", RESUME.encode(), "text/plain")},
        data={"label": "Summer intern", "draft": "false"},
    )
    assert named.status_code == 200, named.text
    body = named.json()
    assert body["label"] == "Summer intern"
    resume_id = body["id"]
    stored = store.get_resume(resume_id)
    assert stored is not None and stored.file_path is not None
    blob = Path(stored.file_path)
    digest = stored.content_sha256
    matches = store._conn.execute(
        "SELECT COUNT(*) AS n FROM matches WHERE left_sha = ? OR right_sha = ?",
        (digest, digest),
    ).fetchone()["n"]
    assert matches > 0

    stranger = TestClient(client.app)
    assert stranger.delete(f"/versions/{resume_id}").status_code == 401
    _signup(stranger, "grace@example.test", "Harbor")
    assert stranger.delete(f"/versions/{resume_id}").status_code == 404
    assert client.delete("/versions/anchor-intern-0").status_code == 404
    anchor = store.get_resume("anchor-intern-0")
    assert anchor is not None and anchor.redacted_text

    deleted = client.delete(f"/versions/{resume_id}")
    assert deleted.status_code == 200
    assert deleted.json() == {"ok": True}
    assert client.get("/versions").json() == []
    me = client.get("/me")
    assert me.status_code == 200
    assert me.json()["email"] == "ada@example.test"

    gone = store.get_resume(resume_id)
    assert gone is not None
    assert gone.tombstoned
    assert gone.redacted_text is None
    assert gone.file_path is None
    assert gone.content_sha256 == digest
    assert not blob.exists()
    still = store._conn.execute(
        "SELECT COUNT(*) AS n FROM matches WHERE left_sha = ? OR right_sha = ?",
        (digest, digest),
    ).fetchone()["n"]
    assert still == matches

    draft = client.post(
        "/versions",
        files={"file": ("campus-rewrite.txt", SECOND.encode(), "text/plain")},
        data={"label": "Campus rewrite", "draft": "true"},
    )
    assert draft.status_code == 200, draft.text
    assert draft.json()["label"] == "Campus rewrite"
    assert client.get("/versions").json() == []
    published = client.post(f"/versions/{draft.json()['id']}/publish")
    assert published.status_code == 200, published.text
    assert published.json()["label"] == "Campus rewrite"
    assert [item["label"] for item in client.get("/versions").json()] == ["Campus rewrite"]

    longer = RESUME.replace(
        "Software engineer intern",
        "Software engineer intern\n- Kept a lab notebook for the ranking study.\n",
    )
    capped = client.post(
        "/versions",
        files={"file": ("long-name.txt", longer.encode(), "text/plain")},
        data={"label": "L" * 90, "draft": "false"},
    )
    assert capped.status_code == 200, capped.text
    assert capped.json()["label"] == "L" * 80


def test_overflow_keeps_the_rating_and_drops_the_oldest_file(tmp_path: Path):
    store = Store(tmp_path / "ladder.db", tmp_path / "blobs")
    user = store.create_user(
        email="ada@example.test",
        password="correct-horse",
        name_on_resume="Ada Lovelace",
        level="intern",
        industry="software",
        company="Northwind",
    )
    ids = []
    for index in range(21):
        resume, created = store.add_resume(
            user=user,
            file_name=f"v{index}.txt",
            source_type="plain",
            redacted_text=f"Experience\n- Version {index} at Northwind Labs with enough text to store.\n",
            file_bytes=f"version {index}".encode(),
            suffix=".txt",
            note="",
            published=True,
        )
        assert created
        ids.append(resume.id)

    oldest = store.get_resume(ids[0])
    newest = store.get_resume(ids[-1])
    assert oldest is not None and newest is not None
    assert oldest.redacted_text is None
    assert oldest.purged
    assert newest.redacted_text is not None
    assert newest.label == "v21"
