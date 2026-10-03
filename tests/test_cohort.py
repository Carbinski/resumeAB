from resume_ab.cohort import Person, band_label, histogram, neighbors_for, rounded_percentile


def _person(person_id: str, elo: float, industry: str, company: str | None = None) -> Person:
    return Person(id=person_id, elo=elo, level="intern", industry=industry, company=company)


def test_percentile_rounds_to_five_percent():
    others = [900, 950, 1000, 1010, 1020, 1100, 1200]
    # 2 of 7 are strictly below 1000 -> 0.286 -> 0.30
    assert rounded_percentile(1000, others) == 0.3
    assert rounded_percentile(1000, []) is None


def test_bands():
    assert band_label(899) == "Under 900"
    assert band_label(900) == "900–1000"
    assert band_label(1000) == "1000–1100"
    assert band_label(1249) == "1100–1250"
    assert band_label(1250) == "1250+"


def test_neighbors_stay_in_industry_once_the_cohort_is_large_enough():
    me = _person("me", 1050, "software", "Northwind")
    people = [
        me,
        _person("a", 1040, "software", "Solo Co"),
        _person("b", 1060, "software", "Second Co"),
        _person("c", 1030, "software", "Third Co"),
        _person("other-industry", 1050, "finance", "Bank"),
        _person("far", 1400, "software", "Way Up"),
        Person(id="anchor", elo=1050, level="intern", industry="software", company="Hidden", synthetic=True),
        Person(id="gone", elo=1050, level="intern", industry="software", company="Deleted", tombstoned=True),
    ]
    cards, widened = neighbors_for(me, people)

    assert widened is False
    companies = {card.company for card in cards}
    assert "Solo Co" in companies
    assert "Bank" not in companies
    assert "Way Up" not in companies
    assert "Hidden" not in companies
    assert "Deleted" not in companies
    assert all(card.relation == "same" for card in cards)


def test_neighbors_widen_and_still_show_a_unique_company():
    me = _person("me", 1000, "healthcare", "Only Clinic")
    people = [
        me,
        _person("peer", 1010, "healthcare", "Other Clinic"),
        _person("finance", 1005, "finance", "Tiny Bank"),
    ]
    cards, widened = neighbors_for(me, people)

    assert widened is True
    assert {card.company for card in cards} == {"Other Clinic", "Tiny Bank"}


def test_histogram_skips_synthetics_and_unplaced():
    people = [
        _person("a", 950, "software"),
        Person(id="b", elo=1300, level="intern", industry="software", synthetic=True),
        Person(id="c", elo=1050, level="intern", industry="software", placed=False),
        Person(id="d", elo=1120, level="newgrad", industry="software"),
    ]
    counts = {row["label"]: row["count"] for row in histogram(people, "intern")}
    assert counts["900–1000"] == 1
    assert counts["1250+"] == 0
    assert sum(counts.values()) == 1
