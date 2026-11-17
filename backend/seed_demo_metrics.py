"""
Seed demo metrics, verify all ranking/API workflows, and reset the database back
to the clean 2,071 imported students ready for live syncing.

Usage:
    python seed_demo_metrics.py --seed --verify --clean
"""
import argparse
from datetime import datetime, timedelta, timezone
import json
import os
from fastapi.testclient import TestClient

from database import Base, DEFAULT_EXCEL_PATH, SessionLocal, engine
from ingest_excel import ingest_excel_file
from main import app
from models import MetricSnapshot, Student
from ranking import create_snapshot, get_or_create_settings, recalculate_all_rankings


def seed_demo_data() -> list[str]:
    db = SessionLocal()
    try:
        # Ensure dataset is loaded
        if db.query(Student).count() == 0:
            ingest_excel_file(db, DEFAULT_EXCEL_PATH)

        # Pick 12 students with valid PENDING URLs across all 3 batches + edge cases
        samples = []
        for batch in ["II Year", "III Year", "IV Year"]:
            batch_candidates = (
                db.query(Student)
                .filter(
                    Student.batch == batch,
                    Student.lc_status == "PENDING",
                    Student.gh_status == "PENDING",
                )
                .order_by(Student.roll_number.asc())
                .limit(4)
                .all()
            )
            samples.extend(batch_candidates)

        now = datetime.now(timezone.utc)
        seeded_rolls = []

        profiles = [
            # (easy, med, hard, rating, attended, pub_repos, orig_repos, stars, followers, active_90d, langs)
            (180, 210, 45, 1842.5, 18, 28, 22, 64, 48, 8, ["Python", "TypeScript", "Go", "C++"]),
            (140, 160, 28, 1710.0, 14, 20, 18, 35, 30, 6, ["Java", "Python", "JavaScript"]),
            (110, 95, 18, 1595.0, 9, 15, 13, 18, 19, 4, ["Python", "C++", "HTML"]),
            (85, 70, 10, 1460.0, 6, 12, 10, 8, 12, 3, ["C", "Python"]),
            (60, 45, 5, 1350.0, 4, 9, 8, 4, 7, 2, ["Java", "SQL"]),
            (40, 25, 2, 0.0, 0, 7, 6, 2, 4, 1, ["Python"]),
            # 0-score verified edge case (account exists, 0 solved / 0 repos)
            (0, 0, 0, 0.0, 0, 0, 0, 0, 0, 0, []),
            # High GitHub builder
            (55, 40, 6, 1410.0, 3, 35, 30, 110, 85, 12, ["TypeScript", "Rust", "Python", "Go", "Docker"]),
            # High LeetCode competitor
            (220, 260, 75, 1980.0, 25, 8, 6, 5, 10, 1, ["C++", "Python"]),
        ]

        for idx, s in enumerate(samples):
            p = profiles[idx % len(profiles)]
            # Give historical earlier snapshot first
            s.lc_easy_solved = max(0, p[0] - 20)
            s.lc_medium_solved = max(0, p[1] - 15)
            s.lc_hard_solved = max(0, p[2] - 3)
            s.lc_total_solved = s.lc_easy_solved + s.lc_medium_solved + s.lc_hard_solved
            s.lc_contest_rating = max(0.0, p[3] - 45.0) if p[3] > 0 else 0.0
            s.lc_contests_attended = max(0, p[4] - 2)
            s.lc_status = "VERIFIED"
            s.lc_last_updated = now - timedelta(days=14)

            # Make every 4th student 1/2 PROVISIONAL (only LeetCode verified)
            if idx % 4 == 3:
                s.gh_status = "PENDING"
            else:
                s.gh_public_repos = p[5]
                s.gh_original_repos = p[6]
                s.gh_total_stars = p[7]
                s.gh_followers = p[8]
                s.gh_recent_active_repos_90d = max(0, p[9] - 1)
                s.gh_top_languages = json.dumps(p[10])
                s.gh_distinct_languages_count = len(p[10])
                s.gh_status = "VERIFIED"
                s.gh_last_updated = now - timedelta(days=14)

            seeded_rolls.append(s.roll_number)

        db.commit()
        recalculate_all_rankings(db)
        for s in samples:
            snap = create_snapshot(db, s, source="DEMO_SEED")
            snap.recorded_at = now - timedelta(days=14)
        db.commit()

        # Update to current metrics & record second snapshot
        for idx, s in enumerate(samples):
            p = profiles[idx % len(profiles)]
            s.lc_easy_solved = p[0]
            s.lc_medium_solved = p[1]
            s.lc_hard_solved = p[2]
            s.lc_total_solved = p[0] + p[1] + p[2]
            s.lc_contest_rating = p[3]
            s.lc_contests_attended = p[4]
            s.lc_last_updated = now
            if idx % 4 != 3:
                s.gh_recent_active_repos_90d = p[9]
                s.gh_last_updated = now

        settings = get_or_create_settings(db)
        settings.last_sync_at = now
        db.commit()
        summary = recalculate_all_rankings(db)
        for s in samples:
            create_snapshot(db, s, source="DEMO_SEED")
        db.commit()

        print(f"Seeded {len(seeded_rolls)} demo students. Ranking summary: {summary}")
        return seeded_rolls
    finally:
        db.close()


def verify_endpoints(seeded_rolls: list[str]) -> None:
    admin_pw = os.getenv("ADMIN_PASSWORD", "admin123")
    headers = {"X-Admin-Password": admin_pw}

    with TestClient(app) as client:
        r = client.get("/api/health")
        assert r.status_code == 200, r.text
        assert r.json()["total_students"] == 2071, f"Expected 2071 students, got {r.json()}"

        r = client.get("/api/stats/summary")
        assert r.status_code == 200, r.text
        summary = r.json()
        assert summary["total_students"] == 2071
        assert summary["confirmed_count"] > 0
        assert summary["provisional_count"] > 0
        assert len(summary["batch_distribution"]) == 3
        assert len(summary["top_overall"]) > 0

        # Search endpoint
        target_roll = seeded_rolls[0]
        r = client.get(f"/api/students/search?q={target_roll[:6]}")
        assert r.status_code == 200, r.text
        assert len(r.json()) > 0

        # Leaderboard tabs & toggles
        for tab in ["overall", "II Year", "III Year", "IV Year", "leetcode", "github"]:
            r = client.get(f"/api/leaderboard?tab={tab}&confirmed_only=false&include_unranked=false")
            assert r.status_code == 200, f"Tab {tab} failed: {r.text}"
            assert r.json()["total"] > 0, f"Tab {tab} returned 0 items"

        r_conf = client.get("/api/leaderboard?tab=overall&confirmed_only=true&include_unranked=false")
        assert r_conf.status_code == 200
        assert all(item["ranking_status"] == "CONFIRMED" for item in r_conf.json()["items"])

        # Student detail + 6 ranks + snapshots
        r = client.get(f"/api/students/{target_roll}")
        assert r.status_code == 200, r.text
        detail = r.json()
        assert detail["overall_college_rank"] is not None
        assert detail["overall_batch_rank"] is not None
        assert detail["lc_college_rank"] is not None
        assert detail["lc_batch_rank"] is not None
        assert detail["gh_college_rank"] is not None
        assert detail["gh_batch_rank"] is not None
        assert len(detail["snapshots"]) >= 2

        # Unranked student returns None (Data unavailable), never 0
        r_unranked = client.get("/api/leaderboard?tab=overall&include_unranked=true&page_size=25")
        assert r_unranked.status_code == 200
        unranked_row = next(
            (x for x in r_unranked.json()["items"] if x["ranking_status"] == "UNRANKED"), None
        )
        if unranked_row:
            assert unranked_row["overall_score"] is None

        # Admin verify + weights update + CSV upload
        assert client.post("/api/admin/verify", headers={"X-Admin-Password": "wrong"}).status_code == 401
        assert client.post("/api/admin/verify", headers=headers).status_code == 200

        r_set = client.put(
            "/api/admin/settings",
            headers=headers,
            json={"leetcode_weight": 0.7, "github_weight": 0.3, "mask_roll_numbers": True},
        )
        assert r_set.status_code == 200, r_set.text
        assert r_set.json()["leetcode_weight"] == 0.7

        # Restore 60/40 and unmasked roll numbers
        r_reset = client.put(
            "/api/admin/settings",
            headers=headers,
            json={"leetcode_weight": 0.6, "github_weight": 0.4, "mask_roll_numbers": False},
        )
        assert r_reset.status_code == 200

        csv_payload = (
            "roll_number,platform,easy_solved,medium_solved,hard_solved,contest_rating,contests_attended\n"
            f"{target_roll},leetcode,200,220,50,1890,20\n"
        )
        r_csv = client.post("/api/admin/upload-csv", headers=headers, data={"csv_text": csv_payload})
        assert r_csv.status_code == 200, r_csv.text
        assert r_csv.json()["updated_rows"] == 1

    print("ALL API, RANKING, SEARCH, WEIGHT, AND CSV VERIFICATIONS PASSED!")


def clean_database() -> None:
    db = SessionLocal()
    try:
        db.query(MetricSnapshot).delete()
        db.query(Student).delete()
        settings = get_or_create_settings(db)
        settings.leetcode_weight = 0.60
        settings.github_weight = 0.40
        settings.provisional_multiplier = 0.80
        settings.mask_roll_numbers = False
        settings.last_sync_at = None
        db.commit()

        summary = ingest_excel_file(db, DEFAULT_EXCEL_PATH)
        print(
            f"Database reset cleanly with {summary['total_rows_processed']} real students "
            f"(verified={summary['ranking_summary']['confirmed'] + summary['ranking_summary']['provisional']})."
        )
    finally:
        db.close()


def main() -> None:
    Base.metadata.create_all(bind=engine)
    parser = argparse.ArgumentParser(description="Seed, verify, and reset CSE Rank demo metrics.")
    parser.add_argument("--seed", action="store_true", help="Seed sample verified metrics")
    parser.add_argument("--verify", action="store_true", help="Run automated API and ranking tests")
    parser.add_argument("--clean", action="store_true", help="Reset DB back to clean 2,071 Excel students")
    args = parser.parse_args()

    if not (args.seed or args.verify or args.clean):
        parser.print_help()
        return

    seeded = []
    if args.seed:
        seeded = seed_demo_data()
    if args.verify:
        if not seeded:
            db = SessionLocal()
            try:
                seeded = [
                    s.roll_number
                    for s in db.query(Student).filter(Student.ranking_status == "CONFIRMED").limit(5).all()
                ]
            finally:
                db.close()
        verify_endpoints(seeded)
    if args.clean:
        clean_database()


if __name__ == "__main__":
    main()
