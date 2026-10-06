from resume_ab.redact import redact

SAMPLE = """Ada Lovelace
ada@example.test
(415) 555-0100
18 Birch Street
Austin, TX 78701
https://linkedin.com/in/ada
Software engineer intern

Experience
- Intern at Northwind Labs. Cut p95 latency from 900ms to 240ms.
- Built a pipeline that served 12000 requests a day.
"""


def test_removes_contact_details_and_keeps_the_work():
    cleaned = redact(SAMPLE, name="Ada Lovelace")

    assert "Ada Lovelace" not in cleaned
    assert "ada@example.test" not in cleaned
    assert "555-0100" not in cleaned
    assert "Birch Street" not in cleaned
    assert "linkedin.com" not in cleaned
    assert "Austin, TX" in cleaned
    assert "78701" not in cleaned
    assert "Northwind Labs" in cleaned
    assert "12000" in cleaned


def test_removes_flipped_name_and_a_differing_first_line():
    text = "Lovelace, Ada\nAda Lovelace\n\nExperience\n- Teaching assistant."
    cleaned = redact(text, name="Ada Lovelace")
    assert "Lovelace" not in cleaned
    assert "Teaching assistant" in cleaned


def test_leading_name_backstop_does_not_eat_a_headline_or_a_city():
    text = "Software Engineer Intern\nAustin, TX\n\nExperience\n- Cafe counter, restocked cups."
    cleaned = redact(text, name="Someone Else")
    assert "Software Engineer Intern" in cleaned
    assert "Austin, TX" in cleaned


def test_backstop_removes_an_unconfirmed_name_on_the_first_line():
    text = "Jordan Lee\nSoftware Engineer Intern\n\nExperience\n- Wrote tests."
    cleaned = redact(text, name=None)
    assert "Jordan Lee" not in cleaned
    assert "Software Engineer Intern" in cleaned
    assert "Wrote tests" in cleaned
