from pathlib import Path

from fastapi.testclient import TestClient

from resume_ab.api import create_app
from resume_ab.cohort import MATCH_BUDGET
from resume_ab.store import Store
from tests.fakes import ScriptedJudge

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


def test_upload_redacts_before_the_judge_and_stays_under_the_match_budget(tmp_path: Path):
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
    assert body["categories"] == {}
    assert "ada.lovelace@example.test" not in response.text
    assert "555-0199" not in response.text

    assert judge.calls
    assert len(judge.calls) <= MATCH_BUDGET
    assert all(not categories for _left, _right, categories in judge.calls)
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
