"""Fictional calibration résumés. They are opponents, never public cards.

Replace the text later with real résumés you have permission to use. Keep ten
per level, ordered weakest to strongest, and rerun placement. Published scores
will move, because the scale is these documents.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AnchorSpec:
    level: str
    slot: int
    text: str


def _doc(
    name: str,
    email: str,
    phone: str,
    street: str,
    city: str,
    headline: str,
    sections: list[tuple[str, list[str]]],
) -> str:
    lines = [name, email, phone, street, city, "", headline, ""]
    for title, bullets in sections:
        lines.append(title)
        lines.extend(f"- {bullet}" for bullet in bullets)
        lines.append("")
    return "\n".join(lines).strip() + "\n"


def all_anchors() -> list[AnchorSpec]:
    specs: list[AnchorSpec] = []
    for slot, text in enumerate(_INTERNS):
        specs.append(AnchorSpec("intern", slot, text))
    for slot, text in enumerate(_NEWGRADS):
        specs.append(AnchorSpec("newgrad", slot, text))
    return specs


_INTERNS = [
    _doc(
        "Casey Morgan",
        "casey.morgan@example.test",
        "(415) 555-0101",
        "18 Birch Street",
        "Austin, TX 78701",
        "First-year student looking for any summer job",
        [
            ("Experience", [
                "Worked the front counter at a campus cafe and restocked cups.",
                "Helped my uncle's moving company on weekends by carrying boxes.",
            ]),
            ("Projects", [
                "Made a one-page personal site in a high school class. It lists my hobbies.",
            ]),
            ("Education", [
                "Community college, undeclared, in progress. Relevant coursework: introduction to computers.",
            ]),
        ],
    ),
    _doc(
        "Noah Patel",
        "noah.patel@example.test",
        "212-555-0144",
        "402 Pine Avenue",
        "New York, NY 10027",
        "Student interested in technology",
        [
            ("Experience", [
                "Library assistant. Shelved books and answered basic questions at the desk.",
                "Member of the robotics club. Attended meetings.",
            ]),
            ("Projects", [
                "Followed a tutorial to build a calculator in Python. It adds and subtracts.",
            ]),
            ("Education", [
                "State university, computer science, freshman. Coursework: intro programming.",
            ]),
        ],
    ),
    _doc(
        "Elena Ruiz",
        "elena.ruiz@example.test",
        "(617) 555-0170",
        "9 Harbor Lane",
        "Boston, MA 02115",
        "Computer science student, class of 2028",
        [
            ("Experience", [
                "Teaching assistant for a weekend coding workshop for middle school students.",
                "Shift lead at a grocery store. Counted the drawer and trained one new cashier.",
            ]),
            ("Projects", [
                "Course project: a to-do list web page with HTML, CSS, and a little JavaScript. Users can add and delete tasks stored in the browser.",
            ]),
            ("Education", [
                "Northeastern-area university, BS computer science expected 2028. GPA 3.1.",
            ]),
        ],
    ),
    _doc(
        "Jonah Kim",
        "jonah.kim@example.test",
        "206-555-0198",
        "55 Cedar Court",
        "Seattle, WA 98105",
        "Software internship candidate",
        [
            ("Experience", [
                "IT help desk student worker. Reset passwords, imaged laptops, and wrote three short how-to pages that cut repeat tickets for VPN setup.",
            ]),
            ("Projects", [
                "Built a Flask app for a class where students post notes. Used SQLite. About 40 classmates used it during finals week.",
                "Small Python scripts to rename photo files by date.",
            ]),
            ("Education", [
                "University of Washington, BS computer science expected 2027. Coursework: data structures, web programming.",
            ]),
        ],
    ),
    _doc(
        "Priya Shah",
        "priya.shah@example.test",
        "(312) 555-0119",
        "220 Lake Drive",
        "Chicago, IL 60614",
        "CS student focused on backend coursework",
        [
            ("Experience", [
                "Research assistant, campus accessibility lab. Cleaned survey data in Python and produced charts for a graduate student's poster.",
                "Volunteer tutor for introductory Python, two hours a week.",
            ]),
            ("Projects", [
                "REST API for a club inventory: items, checkout, and a CSV export. Tests cover the checkout rules. Deployed on a free-tier host for the officers.",
            ]),
            ("Education", [
                "University of Illinois, BS computer science expected 2027. GPA 3.5. Coursework: systems, databases.",
            ]),
        ],
    ),
    _doc(
        "Owen Brooks",
        "owen.brooks@example.test",
        "303-555-0162",
        "14 Mesa Place",
        "Boulder, CO 80302",
        "Seeking a software engineering internship",
        [
            ("Experience", [
                "Software intern, campus recreation department, summer. Replaced a spreadsheet signup flow with a small internal web form. Staff processed about 200 event registrations a month in the new form instead of email.",
            ]),
            ("Projects", [
                "Class project: multi-threaded web crawler that respects robots.txt and stores page titles in Postgres. Wrote a short report comparing it with a single-threaded version, about 4x faster on the course corpus.",
            ]),
            ("Education", [
                "University of Colorado, BS computer science expected 2027. Coursework: operating systems, databases, algorithms.",
            ]),
        ],
    ),
    _doc(
        "Maya Chen",
        "maya.chen@example.test",
        "(650) 555-0188",
        "88 Oak Road",
        "Palo Alto, CA 94301",
        "Software engineering intern candidate",
        [
            ("Experience", [
                "Backend intern, Northwind Labs (fictional student startup), 12 weeks. Added pagination and request logging to an internal order API. p95 latency on the list endpoint dropped from 900ms to 240ms on staging traffic of about 30 requests per second.",
                "Undergraduate TA for data structures. Held office hours for 30 students and wrote two worksheets on trees.",
            ]),
            ("Projects", [
                "Open-source style class project: a CI script that runs pytest and posts a summary comment. Used by the four-person project team on every push.",
            ]),
            ("Education", [
                "Stanford-area university, BS computer science expected 2026. GPA 3.7. Coursework: computer systems, databases, machine learning intro.",
            ]),
        ],
    ),
    _doc(
        "Luis Ortega",
        "luis.ortega@example.test",
        "512-555-0133",
        "401 Congress Avenue Apt 2",
        "Austin, TX 78701",
        "Internship candidate, infrastructure and product",
        [
            ("Experience", [
                "Platform intern, Brightline Health (fictional), summer. Moved a cron job that rebuilt a search index onto a queue with retries. Failed runs went from a silent pager miss to a tracked dead-letter queue. The index rebuild finished in 18 minutes instead of a little over an hour.",
                "Captain of a student hackathon team. Scoped the idea, split the work, and shipped a clinic wait-time prototype in 36 hours.",
            ]),
            ("Projects", [
                "Implemented a tiny container orchestrator for a systems course: schedule, health checks, and a restart policy. Benchmarked against running the processes by hand.",
            ]),
            ("Education", [
                "University of Texas, BS computer science expected 2026. GPA 3.8. Coursework: operating systems, networks, distributed systems.",
            ]),
        ],
    ),
    _doc(
        "Hannah Adler",
        "hannah.adler@example.test",
        "(917) 555-0127",
        "17 Grove Street",
        "Brooklyn, NY 11201",
        "Software intern, product engineering",
        [
            ("Experience", [
                "Product engineering intern, Harbor & Finch (fictional marketplace), summer. Shipped the seller onboarding checklist end to end: React form, API validation, and a Postgres migration. Activation for new sellers who finished the checklist was 46% versus 28% for the previous email instructions, measured over six weeks and about 1,200 signups.",
                "Rewrote the flaky upload test suite so CI stopped failing on timing. The team's main branch went from several red builds a day to rare failures.",
            ]),
            ("Projects", [
                "Built a feature-flag service for a course: evaluation API, an audit log, and a small admin UI. Three other class projects used it.",
            ]),
            ("Education", [
                "Columbia-area university, BS computer science expected 2026. GPA 3.85. Coursework: programming languages, databases, HCI.",
            ]),
        ],
    ),
    _doc(
        "Sofia Nguyen",
        "sofia.nguyen@example.test",
        "408-555-0190",
        "260 Maple Drive",
        "San Jose, CA 95112",
        "Software engineering intern",
        [
            ("Experience", [
                "Infrastructure intern, Lumen Cartographics (fictional), summer. Designed a deploy pipeline for a student-run mapping service used by two campus departments. Blue-green deploys cut the maintenance window from 25 minutes to under 2, and rollback is a single command. Wrote the runbook the next intern actually used.",
                "Co-author of a workshop paper at a regional student symposium on evaluating geocoders. Owned the error analysis: 3,000 sampled addresses, broken down by failure type.",
                "Mentor in the department's intro CS lab, 15 students, one semester.",
            ]),
            ("Projects", [
                "Query planner visualizer for a databases course. Parses a subset of SQL, shows the chosen join order, and compares it with an alternative. Instructor adopted it as an optional lab the following quarter.",
            ]),
            ("Education", [
                "UC-area university, BS computer science expected 2026. GPA 3.9. Coursework: compilers, databases, operating systems, algorithms.",
            ]),
        ],
    ),
]

_NEWGRADS = [
    _doc(
        "Ethan Walsh",
        "ethan.walsh@example.test",
        "(702) 555-0108",
        "90 Desert Road",
        "Las Vegas, NV 89101",
        "Recent graduate seeking a junior role",
        [
            ("Experience", [
                "Retail associate for three years. Opened the store and handled returns.",
                "Graduated with a bachelor's in information systems.",
            ]),
            ("Projects", [
                "Group project: a slide deck about cloud computing. I made two of the slides.",
            ]),
            ("Education", [
                "Regional university, BS information systems, 2026. GPA 2.7.",
            ]),
        ],
    ),
    _doc(
        "Aisha Rahman",
        "aisha.rahman@example.test",
        "313-555-0166",
        "12 Woodward Avenue",
        "Detroit, MI 48226",
        "New graduate, computer science",
        [
            ("Experience", [
                "Campus IT desk, two years. Tickets, printer setup, and account unlocks.",
            ]),
            ("Projects", [
                "Senior project: a blog in PHP and MySQL. Users can register and post. No tests. Used by me and two friends.",
            ]),
            ("Education", [
                "Wayne-area university, BS computer science, 2026. GPA 3.0. Coursework: software engineering, intro databases.",
            ]),
        ],
    ),
    _doc(
        "Ben Carter",
        "ben.carter@example.test",
        "(404) 555-0181",
        "600 Peachtree Place",
        "Atlanta, GA 30308",
        "New grad software generalist",
        [
            ("Experience", [
                "Part-time web assistant for a campus department. Updated pages in a CMS and fixed broken links. Once added a contact form that emails the office.",
            ]),
            ("Projects", [
                "Capstone with four teammates: a course scheduler. I built the CSV import. The registrar looked at a demo and did not adopt it.",
            ]),
            ("Education", [
                "Georgia-area university, BS computer science, 2026. GPA 3.2.",
            ]),
        ],
    ),
    _doc(
        "Grace Ibarra",
        "grace.ibarra@example.test",
        "619-555-0142",
        "33 Harbor Drive",
        "San Diego, CA 92101",
        "New grad, software engineering",
        [
            ("Experience", [
                "Summer intern, city parks department IT. Wrote a Python script that merged two volunteer spreadsheets and flagged 120 duplicate rows the coordinators had been fixing by hand.",
            ]),
            ("Projects", [
                "Capstone: mobile-friendly site for club ticket sales. Stripe test mode, Postgres, a basic admin page. Sold nothing in production, but the flow is covered by a few integration tests.",
            ]),
            ("Education", [
                "UC-area university, BS computer science, 2026. GPA 3.4. Coursework: web applications, databases, security intro.",
            ]),
        ],
    ),
    _doc(
        "Daniel Cho",
        "daniel.cho@example.test",
        "(215) 555-0194",
        "150 Market Street",
        "Philadelphia, PA 19103",
        "New grad backend engineer",
        [
            ("Experience", [
                "Software intern, Ridge Audit (fictional), summer before senior year. Added an export endpoint and fixed N+1 queries on an accounts page. The page went from timing out for large clients to returning in about 1.5 seconds.",
            ]),
            ("Projects", [
                "Senior thesis project: a static analyzer coursework tool that flags unchecked errors in a toy language. Evaluated on 50 sample programs with a short error analysis.",
            ]),
            ("Education", [
                "Penn-area university, BS computer science, 2026. GPA 3.6. Coursework: compilers, systems, software engineering.",
            ]),
        ],
    ),
    _doc(
        "Natalie Berg",
        "natalie.berg@example.test",
        "612-555-0114",
        "80 Nicollet Avenue",
        "Minneapolis, MN 55401",
        "New grad, full-stack",
        [
            ("Experience", [
                "Engineering intern, Northwind Labs (fictional), two summers. First summer: internal dashboard for support macros. Second summer: owned the billing-email worker, including retries and a dead-letter view. Support stopped re-sending about 300 failed receipts a week by hand.",
                "TA for introductory programming, two semesters.",
            ]),
            ("Projects", [
                "Capstone with a local nonprofit: scheduling tool used by 15 volunteers after launch. I led standup and shipped the calendar sync.",
            ]),
            ("Education", [
                "University of Minnesota, BS computer science, 2026. GPA 3.7.",
            ]),
        ],
    ),
    _doc(
        "Chris Daley",
        "chris.daley@example.test",
        "(503) 555-0177",
        "19 Division Place",
        "Portland, OR 97205",
        "New grad machine learning engineer",
        [
            ("Experience", [
                "ML intern, Brightline Health (fictional), summer. Trained a baseline classifier on de-identified intake notes and compared it with a rules checklist the nurses already used. The model matched the checklist on the agreed label set and was not shipped. I wrote the evaluation so a bad split could not leak notes across patients.",
                "Undergraduate research, one year. Co-author on a workshop paper about calibration. I ran the experiments and the error bars.",
            ]),
            ("Projects", [
                "Reproducible training repo: pinned dependencies, a config file, and a one-command eval. The next student in the lab forked it.",
            ]),
            ("Education", [
                "Oregon-area university, BS computer science, 2026. GPA 3.75. Coursework: machine learning, statistics, data systems.",
            ]),
        ],
    ),
    _doc(
        "Amelia Frost",
        "amelia.frost@example.test",
        "720-555-0120",
        "400 Larimer Court",
        "Denver, CO 80202",
        "New grad, cloud and backend",
        [
            ("Experience", [
                "Site reliability intern, Lumen Cartographics (fictional), summer. Introduced error budgets for a tile API serving a student mapping app with about 50k requests a day. Paged on burn rate instead of a single 500. Also cut container image size and cold-start time on the preview environment from 70 seconds to 20.",
                "On-call shadow for four weeks. Wrote two postmortem notes, including a bad migration I had queued.",
            ]),
            ("Projects", [
                "Capstone: multi-region failover demo for a course. Documented what actually failed when we pulled the plug on the primary.",
            ]),
            ("Education", [
                "Colorado-area university, BS computer science, 2026. GPA 3.8. Coursework: distributed systems, networks, operating systems.",
            ]),
        ],
    ),
    _doc(
        "Leo Martins",
        "leo.martins@example.test",
        "(646) 555-0155",
        "8 Bond Street",
        "New York, NY 10012",
        "New grad product engineer",
        [
            ("Experience", [
                "Software intern, Harbor & Finch (fictional), two summers, return offer. Second summer I owned search suggestions. Shipped a prefix index and an offline eval harness. Suggestion acceptance rose from 11% to 18% of searches over a four-week A/B test, about 200k searches a week. I presented the readout to the team and rolled the loser back myself.",
                "Led a four-person senior design team building a scheduling tool a clinic pilot used for three weeks. I cut scope when the integration slipped and still delivered the calendar view they asked for.",
            ]),
            ("Projects", [
                "Small open-source contribution: fixed a pagination bug and added a regression test in a popular Python HTTP library used in class. Maintainer merged it.",
            ]),
            ("Education", [
                "NYU-area university, BS computer science, 2026. GPA 3.86. Coursework: distributed systems, HCI, databases.",
            ]),
        ],
    ),
    _doc(
        "Riley Okonkwo",
        "riley.okonkwo@example.test",
        "617-555-0104",
        "1 Memorial Drive",
        "Cambridge, MA 02142",
        "New grad software engineer",
        [
            ("Experience", [
                "Engineering intern, three summers, last one at Northwind Labs (fictional) on the data platform. Rebuilt a daily job that assembled training sets for an internal ranker. Caught a silent off-by-one in the join that had been duplicating 8% of examples. After the fix, offline metrics stopped oscillating week to week. The job's runtime dropped from 3 hours to 40 minutes, and two other teams adopted the same runner.",
                "Published a short reproducibility checklist the interns the next year were handed. I also mentored one freshman on their first pull request.",
            ]),
            ("Projects", [
                "Thesis: an evaluation harness for résumé-like document rankers on a public corpus, with confidence intervals and a leakage check. Reported negative results where a clever feature did not help. The harness is what the writeup argues for, not a leaderboard win.",
            ]),
            ("Education", [
                "MIT-area university, BS computer science, 2026. GPA 3.93. Coursework: machine learning, systems, compilers, statistics.",
            ]),
        ],
    ),
]
