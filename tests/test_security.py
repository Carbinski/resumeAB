"""Guards for accounts, uploads, and résumé access."""

from pathlib import Path

from fastapi.testclient import TestClient

from resume_ab.api import create_app
from resume_ab.store import Store, verify_password, write_contained
from resume_ab.textlog import configure_text_log, log_resume_text
from tests.fakes import ScriptedJudge

RESUME = """Ada Lovelace
ada.lovelace@example.test
(415) 555-0199
18 Birch Street
Austin, TX 78701

Software engineer intern

Experience
- Intern at Northwind Labs. Cut p95 latency from 900ms to 240ms on the list endpoint.
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
Education
- State university, computer science, expected 2026.
"""


def _client(tmp_path: Path, *, secure_cookie: bool = False) -> tuple[TestClient, ScriptedJudge, Store]:
    store = Store(tmp_path / "ladder.db", tmp_path / "blobs")
    store.seed_anchors()
    judge = ScriptedJudge()
    app = create_app(store, judge, sync=True, secure_cookie=secure_cookie)
    return TestClient(app), judge, store


def _signup(client: TestClient, email: str = "ada@example.test", company: str = "Northwind") -> None:
    response = client.post(
        "/auth/signup",
        json={
            "email": email,
            "password": "correct-horse",
            "nameOnResume": "Ada Lovelace" if "ada" in email else "Grace Hopper",
            "level": "intern",
            "industry": "software",
            "company": company,
        },
    )
    assert response.status_code == 200, response.text


def _upload(client: TestClient, name: str, text: str, **data: str) -> dict:
    response = client.post(
        "/versions",
        files={"file": (name, text.encode(), "text/plain")},
        data=data,
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_session_cookie_is_httponly_and_logout_clears_it(tmp_path: Path):
    client, _judge, _store = _client(tmp_path)
    signup = client.post(
        "/auth/signup",
        json={
            "email": "ada@example.test",
            "password": "correct-horse",
            "nameOnResume": "Ada Lovelace",
            "level": "intern",
            "industry": "software",
            "company": "Northwind",
        },
    )
    assert signup.status_code == 200, signup.text
    issued = signup.headers["set-cookie"].lower()
    assert "ladder_session=" in issued
    assert "httponly" in issued
    assert "samesite=lax" in issued
    assert "path=/" in issued

    logged_out = client.post("/auth/logout")
    assert logged_out.status_code == 200
    cleared = logged_out.headers["set-cookie"].lower()
    assert "httponly" in cleared
    assert "samesite=lax" in cleared
    assert "path=/" in cleared
    assert "max-age=0" in cleared
    assert client.get("/me").status_code == 401


def test_secure_cookie_flag_follows_the_app_setting(tmp_path: Path):
    client, _judge, _store = _client(tmp_path, secure_cookie=True)
    response = client.post(
        "/auth/signup",
        json={
            "email": "ada@example.test",
            "password": "correct-horse",
            "nameOnResume": "Ada Lovelace",
            "level": "intern",
            "industry": "software",
        },
    )
    assert response.status_code == 200, response.text
    assert "secure" in response.headers["set-cookie"].lower()


def test_login_does_not_echo_a_long_password(tmp_path: Path):
    client, _judge, _store = _client(tmp_path)
    _signup(client)
    password = "p" * 201
    response = client.post("/auth/login", json={"email": "ada@example.test", "password": password})
    assert response.status_code == 422
    assert password not in response.text
    assert response.json()["detail"] == "Check the fields and try again."


def test_deleted_account_cannot_be_recovered_and_drops_the_name(tmp_path: Path):
    client, _judge, store = _client(tmp_path)
    _signup(client)
    uploaded = _upload(client, "resume.txt", RESUME, label="Ada summer", note="Private note", draft="false")
    resume_id = uploaded["id"]
    user_id = store.get_resume(resume_id).user_id

    deleted = client.delete("/me")
    assert deleted.status_code == 200
    row = store._conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    assert row["deleted_at"]
    assert row["name_on_resume"] == ""
    assert row["company"] is None
    assert not verify_password("correct-horse", row["password_hash"])
    again = client.post("/auth/login", json={"email": "ada@example.test", "password": "correct-horse"})
    assert again.status_code == 401

    gone = store.get_resume(resume_id)
    assert gone is not None
    assert gone.redacted_text is None
    assert gone.label in (None, "")
    assert gone.note == ""
    assert gone.file_name is None
    assert gone.tombstoned


def test_other_people_and_anchors_cannot_be_read_or_removed(tmp_path: Path):
    client, judge, store = _client(tmp_path)
    _signup(client)
    mine = _upload(client, "resume.txt", RESUME, label="Mine", note="Ada private note", draft="true")
    calls_before = len(judge.calls)

    stranger = TestClient(client.app)
    assert stranger.delete(f"/versions/{mine['id']}").status_code == 401
    _signup(stranger, "grace@example.test", "Harbor")
    theirs = _upload(stranger, "two.txt", SECOND, label="Theirs", note="Grace private note", draft="true")

    assert stranger.delete(f"/versions/{mine['id']}").status_code == 404
    assert stranger.post(f"/versions/{mine['id']}/publish").status_code == 404
    assert stranger.post(f"/versions/{mine['id']}/roles/ai").status_code == 404
    compared = stranger.post(
        "/compare",
        json={"aId": theirs["id"], "bId": mine["id"], "role": "overall"},
    )
    assert compared.status_code == 404
    assert "Ada private note" not in compared.text
    assert "Northwind Labs" not in compared.text
    assert len(judge.calls) == calls_before

    anchor_id = "anchor-intern-0"
    anchor = store.get_resume(anchor_id)
    assert anchor is not None and anchor.redacted_text
    snippet = anchor.redacted_text[:80]
    for response in (
        client.delete(f"/versions/{anchor_id}"),
        client.post(f"/versions/{anchor_id}/publish"),
        client.post(f"/versions/{anchor_id}/roles/ai"),
        client.post("/compare", json={"aId": mine["id"], "bId": anchor_id, "role": "overall"}),
    ):
        assert response.status_code == 404
        assert snippet not in response.text
    assert store.get_resume(anchor_id).redacted_text == anchor.redacted_text
    assert len(judge.calls) == calls_before

    store._conn.execute(
        "UPDATE resumes SET user_id = ? WHERE id = ?",
        (store.get_resume(mine["id"]).user_id, anchor_id),
    )
    store._conn.commit()
    assert store.publish(store.get_resume(mine["id"]).user_id, anchor_id) is None
    assert store.delete_resume(store.get_resume(mine["id"]).user_id, anchor_id) is False
    assert store.get_resume(anchor_id).redacted_text == anchor.redacted_text


def test_upload_paths_stay_inside_the_blob_directory(tmp_path: Path):
    client, _judge, store = _client(tmp_path)
    _signup(client)
    uploaded = _upload(client, "../../outside.txt", RESUME, draft="true")
    assert uploaded["fileName"] == "outside.txt"
    assert ".." not in uploaded["fileName"]
    stored = store.get_resume(uploaded["id"])
    assert stored is not None and stored.file_path is not None
    blob = Path(stored.file_path).resolve()
    assert blob.parent == store.blob_dir.resolve()
    assert blob.is_file()
    assert (blob.stat().st_mode & 0o777) == 0o600
    assert not (tmp_path / "outside.txt").exists()

    windows = _upload(client, "..\\..\\secret.txt", SECOND, draft="true")
    assert windows["fileName"] == "secret.txt"
    assert "\\" not in windows["fileName"]

    user = store.get_user(stored.user_id)
    assert user is not None
    try:
        store.add_resume(
            user=user,
            file_name="pwned.txt",
            source_type="plain",
            redacted_text="Experience\n- Enough text to store for the path check.\n",
            file_bytes=b"nope",
            suffix="../../pwned.txt",
            note="",
            published=False,
        )
    except ValueError:
        pass
    else:
        raise AssertionError("a suffix with a path was stored")
    assert list(tmp_path.rglob("pwned.txt")) == []

    try:
        write_contained(store.blob_dir, "../escape.txt", b"nope")
    except ValueError:
        pass
    else:
        raise AssertionError("write_contained left the blob directory")
    assert not (tmp_path / "escape.txt").exists()


def test_upload_rejects_a_file_over_the_size_cap(tmp_path: Path):
    client, judge, store = _client(tmp_path)
    _signup(client)
    response = client.post(
        "/versions",
        files={"file": ("big.txt", b"a" * 5_000_001, "text/plain")},
    )
    assert response.status_code == 400
    assert "under 5 MB" in response.text
    assert judge.calls == []
    assert list(store.blob_dir.glob("*")) == [] or all(
        path.name == "incoming" for path in store.blob_dir.iterdir()
    )
    incoming = store.blob_dir / "incoming"
    if incoming.exists():
        assert list(incoming.iterdir()) == []


def test_labels_and_notes_drop_control_characters(tmp_path: Path):
    client, _judge, store = _client(tmp_path)
    _signup(client)
    uploaded = _upload(
        client,
        "resume.txt",
        RESUME,
        label="Summer\r\nintern\x00",
        note="Hello\nthere\x00",
        draft="true",
    )
    assert uploaded["label"] == "Summerintern"
    assert uploaded["note"] == "Hellothere"
    assert "\n" not in uploaded["label"]
    assert "\r" not in uploaded["note"]
    stored = store.get_resume(uploaded["id"])
    assert stored is not None
    assert stored.label == "Summerintern"
    assert stored.note == "Hellothere"

    removed = client.delete(f"/versions/{uploaded['id']}")
    assert removed.status_code == 200
    gone = store.get_resume(uploaded["id"])
    assert gone is not None
    assert gone.label in (None, "")
    assert gone.note == ""
    assert gone.redacted_text is None


class _LeakyJudge:
    def compare(self, left, right, role_description, *, categories: bool = False):
        raise RuntimeError(f"upstream quoted {left.text[:120]}")


def test_judge_failures_do_not_return_resume_text(tmp_path: Path):
    store = Store(tmp_path / "ladder.db", tmp_path / "blobs")
    store.seed_anchors()
    client = TestClient(create_app(store, _LeakyJudge(), sync=True))
    _signup(client)
    placed = client.post(
        "/versions",
        files={"file": ("resume.txt", RESUME.encode(), "text/plain")},
        data={"draft": "false"},
    )
    assert placed.status_code == 200, placed.text
    body = placed.json()
    assert body["standing"]["status"] == "error"
    assert body["standing"]["message"] == "The judge could not score this résumé."
    assert "ada.lovelace@example.test" not in placed.text
    assert "Northwind Labs" not in placed.text
    assert "upstream quoted" not in placed.text

    first = _upload(client, "one.txt", RESUME, draft="true")
    second = _upload(client, "two.txt", SECOND, draft="true")
    compared = client.post(
        "/compare",
        json={"aId": first["id"], "bId": second["id"], "role": "overall"},
    )
    assert compared.status_code == 502
    assert compared.json()["detail"] == "The judge could not compare those résumés."
    assert "Northwind Labs" not in compared.text
    assert "Harbor" not in compared.text


def test_resume_text_log_is_not_written_to_the_process_output(tmp_path: Path, capsys):
    path = configure_text_log(tmp_path)
    log_resume_text(stage="extracted", filename="resume.txt", text="secret ada@example.test")
    captured = capsys.readouterr()
    assert "ada@example.test" not in captured.out
    assert "ada@example.test" not in captured.err
    logged = path.read_text(encoding="utf-8")
    assert "ada@example.test" in logged
    assert (path.stat().st_mode & 0o777) == 0o600
