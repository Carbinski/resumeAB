import logging
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from resume_ab.api import create_app
from resume_ab.categories import ROLE_DESCRIPTIONS
from resume_ab.cohort import MATCH_BUDGET, ROLE_IDS, suggested_focus
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


def _variant(marker: str) -> bytes:
    return RESUME.replace(
        "- Built a queue for index rebuilds used by two campus departments.",
        f"- Built a queue for index rebuilds used by two campus departments.\n- Note {marker}.",
    ).encode()


def test_auto_labels_skip_names_still_on_the_ladder(tmp_path: Path):
    client, _judge, store = _client(tmp_path)
    _signup(client, "ada@example.test", "Northwind")

    def upload(name: str, marker: str, **data: str):
        response = client.post(
            "/versions",
            files={"file": (name, _variant(marker), "text/plain")},
            data=data,
        )
        assert response.status_code == 200, response.text
        return response.json()

    named = upload("named.txt", "named", label="v2", draft="false")
    assert named["label"] == "v2"
    automatic = upload("auto.txt", "auto", draft="false")
    assert automatic["label"] == "v1"

    draft = upload("draft.txt", "draft", draft="true")
    assert draft["label"] == "Draft"
    stored = store.get_resume(draft["id"])
    assert stored is not None and stored.label is None
    published = client.post(f"/versions/{draft['id']}/publish")
    assert published.status_code == 200, published.text
    assert published.json()["label"] == "v3"

    explicit = upload("explicit.txt", "explicit", label="Draft", draft="true")
    assert explicit["label"] == "Draft"
    kept = client.post(f"/versions/{explicit['id']}/publish")
    assert kept.status_code == 200, kept.text
    assert kept.json()["label"] == "Draft"

    deleted = client.delete(f"/versions/{automatic['id']}")
    assert deleted.status_code == 200
    reused = upload("reused.txt", "reused", draft="false")
    assert reused["label"] == "v1"
    labels = [item["label"] for item in client.get("/versions").json()]
    assert labels.count("v1") == 1
    assert labels.count("v2") == 1
    assert labels.count("v3") == 1


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


def _profile(industry: str, company: str, focus: str | None, level: str = "intern") -> dict:
    body = {
        "nameOnResume": "Ada Lovelace",
        "level": level,
        "industry": industry,
        "company": company,
    }
    if focus is not None:
        body["focus"] = focus
    return body


def test_focus_signup_profile_and_version_snapshot(tmp_path: Path):
    client, _judge, _store = _client(tmp_path)
    created = client.post(
        "/auth/signup",
        json={
            "email": "ada@example.test",
            "password": "correct-horse",
            "nameOnResume": "Ada Lovelace",
            "level": "intern",
            "industry": "software",
            "company": "Northwind",
            "focus": "cs",
        },
    )
    assert created.status_code == 200, created.text
    assert created.json()["focus"] == "cs"

    uploaded = client.post(
        "/versions",
        files={"file": ("resume.txt", RESUME.encode(), "text/plain")},
        data={"note": "First version", "draft": "false"},
    )
    assert uploaded.status_code == 200, uploaded.text
    body = uploaded.json()
    assert body["industry"] == "software"
    assert body["company"] == "Northwind"
    assert body["ratings"]["embedded"] is None
    assert body["roleStatus"]["embedded"] is None
    assert body["ratings"]["flight"] is None

    moved = client.patch("/me", json=_profile("aerospace", "Other Co", "cs"))
    assert moved.status_code == 200, moved.text
    assert moved.json()["industry"] == "aerospace"
    assert moved.json()["company"] == "Other Co"
    assert moved.json()["focus"] == "cs"

    kept = client.patch("/me", json=_profile("defense", "Other Co", None, level="newgrad"))
    assert kept.status_code == 200, kept.text
    assert kept.json()["focus"] == "cs"
    assert kept.json()["level"] == "newgrad"

    cleared = client.patch("/me", json=_profile("defense", "Other Co", "", level="newgrad"))
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["focus"] == ""

    rejected = client.patch("/me", json=_profile("defense", "Other Co", "flight", level="newgrad"))
    assert rejected.status_code == 400
    assert client.get("/me").json()["focus"] == ""

    uploaded_next = client.post(
        "/versions",
        files={"file": ("next.txt", SECOND.encode(), "text/plain")},
        data={"note": "After the profile edit", "draft": "false"},
    )
    assert uploaded_next.status_code == 200, uploaded_next.text
    fresh = uploaded_next.json()
    assert fresh["industry"] == "defense"
    assert fresh["company"] == "Other Co"
    assert fresh["level"] == "newgrad"

    versions = client.get("/versions").json()
    assert versions[0]["industry"] == "software"
    assert versions[0]["company"] == "Northwind"
    assert versions[0]["level"] == "intern"
    assert versions[1]["id"] == fresh["id"]
    assert versions[1]["industry"] == "defense"
    assert versions[1]["level"] == "newgrad"

    healthcare = TestClient(client.app)
    suggested = healthcare.post(
        "/auth/signup",
        json={
            "email": "grace@example.test",
            "password": "correct-horse",
            "nameOnResume": "Grace Hopper",
            "level": "intern",
            "industry": "healthcare",
            "company": "Clinic",
        },
    )
    assert suggested.status_code == 200, suggested.text
    assert suggested.json()["focus"] == "bme"

    defense = TestClient(client.app)
    unset = defense.post(
        "/auth/signup",
        json={
            "email": "lin@example.test",
            "password": "correct-horse",
            "nameOnResume": "Lin Type",
            "level": "newgrad",
            "industry": "defense",
            "company": "",
            "focus": "",
        },
    )
    assert unset.status_code == 200, unset.text
    assert unset.json()["focus"] == ""
    assert unset.json()["company"] is None
    assert suggested_focus("software") == "cs"
    assert suggested_focus("manufacturing") == "mee"
    assert suggested_focus("consulting") == ""
    assert suggested_focus("robotics") == ""
    assert suggested_focus("finance") == ""


def test_unrated_role_compare_does_not_borrow_overall_elo(tmp_path: Path):
    client, _judge, _store = _client(tmp_path)
    _signup(client, "ada@example.test", "Northwind")
    first = client.post(
        "/versions",
        files={"file": ("one.txt", RESUME.encode(), "text/plain")},
        data={"draft": "false"},
    )
    second = client.post(
        "/versions",
        files={"file": ("two.txt", SECOND.encode(), "text/plain")},
        data={"draft": "false"},
    )
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    left = first.json()
    right = second.json()
    assert left["ratings"]["embedded"] is None
    assert right["ratings"]["embedded"] is None
    assert isinstance(left["ratings"]["overall"], int)
    assert isinstance(right["ratings"]["overall"], int)

    compared = client.post(
        "/compare",
        json={"aId": left["id"], "bId": right["id"], "role": "embedded"},
    )
    assert compared.status_code == 200, compared.text
    body = compared.json()
    assert body["role"] == "embedded"
    assert body["eloA"] is None
    assert body["eloB"] is None
    assert isinstance(body["pB"], float)

    overall = client.post(
        "/compare",
        json={"aId": left["id"], "bId": right["id"], "role": "overall"},
    )
    assert overall.status_code == 200, overall.text
    overall_body = overall.json()
    assert overall_body["eloA"] == overall_body["a"]["ratings"]["overall"]
    assert overall_body["eloB"] == overall_body["b"]["ratings"]["overall"]
    assert overall_body["eloA"] is not None
    assert overall_body["eloB"] is not None

    rated_left = client.post(f"/versions/{left['id']}/roles/embedded")
    rated_right = client.post(f"/versions/{right['id']}/roles/embedded")
    assert rated_left.status_code == 200, rated_left.text
    assert rated_right.status_code == 200, rated_right.text
    placed = client.post(
        "/compare",
        json={"aId": left["id"], "bId": right["id"], "role": "embedded"},
    )
    assert placed.status_code == 200, placed.text
    placed_body = placed.json()
    assert placed_body["a"]["roleStatus"]["embedded"]["status"] == "rated"
    assert placed_body["b"]["roleStatus"]["embedded"]["status"] == "rated"
    assert placed_body["eloA"] == placed_body["a"]["ratings"]["embedded"]
    assert placed_body["eloB"] == placed_body["b"]["ratings"]["embedded"]
    assert isinstance(placed_body["eloA"], int)
    assert isinstance(placed_body["eloB"], int)


def test_new_track_is_accepted_and_unknown_role_is_rejected(tmp_path: Path):
    client, judge, _store = _client(tmp_path)
    _signup(client, "ada@example.test", "Northwind")
    uploaded = client.post(
        "/versions",
        files={"file": ("resume.txt", RESUME.encode(), "text/plain")},
        data={"draft": "false"},
    )
    assert uploaded.status_code == 200, uploaded.text
    resume_id = uploaded.json()["id"]
    assert "embedded" in ROLE_IDS
    assert "flight" in ROLE_IDS
    assert "aerospace" not in ROLE_IDS
    assert ROLE_DESCRIPTIONS["embedded"] == (
        "Embedded and electronics engineer, internship or new grad. "
        "Firmware, circuits, boards, and test equipment."
    )
    assert ROLE_DESCRIPTIONS["flight"].startswith("Aerospace engineer, internship or new grad.")

    before = len(judge.calls)
    rated = client.post(f"/versions/{resume_id}/roles/embedded")
    assert rated.status_code == 200, rated.text
    payload = rated.json()
    assert payload["roleStatus"]["embedded"]["status"] == "rated"
    assert isinstance(payload["ratings"]["embedded"], int)
    assert len(judge.calls) > before

    after = len(judge.calls)
    unknown = client.post(f"/versions/{resume_id}/roles/nope")
    assert unknown.status_code == 404
    collided = client.post(f"/versions/{resume_id}/roles/aerospace")
    assert collided.status_code == 404
    assert len(judge.calls) == after


def test_focus_column_migration_is_safe_to_repeat(tmp_path: Path):
    database = tmp_path / "ladder.db"
    connection = sqlite3.connect(database)
    connection.execute(
        """
        CREATE TABLE users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name_on_resume TEXT NOT NULL,
            level TEXT NOT NULL,
            industry TEXT NOT NULL,
            company TEXT,
            created_at TEXT NOT NULL,
            deleted_at TEXT
        )
        """
    )
    connection.execute(
        """
        INSERT INTO users (
            id, email, password_hash, name_on_resume, level, industry, company, created_at
        ) VALUES ('user-1', 'ada@example.test', 'hash', 'Ada Lovelace', 'intern', 'software', 'Northwind', '2026-01-01T00:00:00+00:00')
        """
    )
    connection.commit()
    connection.close()

    store = Store(database, tmp_path / "blobs")
    store.close()
    store = Store(database, tmp_path / "blobs")
    existing = store.get_user("user-1")
    assert existing is not None
    assert existing.focus == ""
    created = store.create_user(
        email="grace@example.test",
        password="correct-horse",
        name_on_resume="Grace Hopper",
        level="intern",
        industry="biotech",
        company=None,
        focus="bme",
    )
    assert created.focus == "bme"
    store.close()
