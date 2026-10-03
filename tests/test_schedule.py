from resume_ab.schedule import Candidate, select_opponents


def _anchors(elo: float = 1000) -> list[Candidate]:
    return [Candidate(id=f"a{slot}", elo=elo, anchor_slot=slot) for slot in range(10)]


def test_flat_ladder_spreads_across_anchors_and_keeps_a_seat_for_a_person():
    pool = _anchors() + [Candidate(id="person", elo=1000, anchor_slot=None)]
    chosen = select_opponents(self_id="me", self_elo=1000, candidates=pool, already=set(), limit=8)

    assert len(chosen) == 8
    assert "a0" in chosen
    assert "a9" in chosen
    assert "person" in chosen
    assert "me" not in chosen


def test_skips_people_already_played():
    pool = _anchors()
    chosen = select_opponents(
        self_id="me",
        self_elo=1000,
        candidates=pool,
        already={"a0", "a9"},
        limit=8,
    )
    assert "a0" not in chosen
    assert "a9" not in chosen
    assert len(chosen) == 8


def test_wide_ladder_picks_both_sides_and_nearby_ratings():
    pool = [
        Candidate("low-anchor", 700, 0),
        Candidate("high-anchor", 1400, 9),
        Candidate("weak", 800, None),
        Candidate("strong", 1300, None),
        Candidate("near", 1020, None),
        Candidate("near-2", 980, None),
        Candidate("mid", 1000, None),
        Candidate("other", 1010, None),
    ]
    chosen = select_opponents(self_id="me", self_elo=1000, candidates=pool, already=set(), limit=8)

    assert chosen[:2] == ["low-anchor", "high-anchor"] or {"low-anchor", "high-anchor"} <= set(chosen)
    assert "weak" in chosen
    assert "strong" in chosen
    assert "near" in chosen
    assert len(chosen) == 8
