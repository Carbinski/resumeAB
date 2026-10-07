from resume_ab.place import CATEGORY_ANCHOR_GAP, _select_category_anchor
from resume_ab.schedule import Candidate


def _anchors(elo: float = 1000) -> list[Candidate]:
    return [Candidate(id=f"a{slot}", elo=elo, anchor_slot=slot) for slot in range(10)]


def test_nearest_anchor_is_the_category_opponent():
    anchors = _anchors(1000)
    anchors[2] = Candidate("a2", 1100, 2)
    chosen = _select_category_anchor(anchors, 1090)
    assert chosen is not None
    assert chosen.id == "a2"


def test_middle_anchor_when_nothing_is_close():
    anchors = [
        Candidate(id=f"a{slot}", elo=700 + slot * 20, anchor_slot=slot) for slot in range(9)
    ]
    anchors.append(Candidate("a9", 1500, 9))
    chosen = _select_category_anchor(anchors, 1200)
    assert chosen is not None
    assert chosen.anchor_slot == len(anchors) // 2
    assert abs(1200 - 1500) > CATEGORY_ANCHOR_GAP


def test_equal_distance_prefers_the_middle_slot():
    chosen = _select_category_anchor(_anchors(), 1000)
    assert chosen is not None
    assert chosen.anchor_slot == 5
