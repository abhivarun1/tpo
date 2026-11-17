import asyncio
from collections import Counter
from datetime import datetime, timedelta, timezone
import json
import os
from typing import Dict, List, Optional
import httpx
from sqlalchemy.orm import Session

from database import SessionLocal
from models import Student
from ranking import create_snapshot, get_or_create_settings, recalculate_all_rankings

LEETCODE_GRAPHQL_URL = "https://leetcode.com/graphql"
LEETCODE_QUERY = """
query getUserProfile($username: String!) {
  matchedUser(username: $username) {
    username
    submitStatsGlobal {
      acSubmissionNum {
        difficulty
        count
      }
    }
  }
  userContestRanking(username: $username) {
    attendedContestsCount
    rating
  }
}
"""

LEETCODE_DELAY_SECONDS = 2.0


class RateLimitError(Exception):
    def __init__(self, platform: str, status_code: int, message: str):
        self.platform = platform
        self.status_code = status_code
        super().__init__(message)


def _clear_github_metrics(student: Student) -> None:
    student.gh_public_repos = None
    student.gh_original_repos = None
    student.gh_total_stars = None
    student.gh_followers = None
    student.gh_recent_active_repos_90d = None
    student.gh_top_languages = None
    student.gh_distinct_languages_count = None
    student.gh_raw_index = None
    student.gh_score = None


def _clear_leetcode_metrics(student: Student) -> None:
    student.lc_total_solved = None
    student.lc_easy_solved = None
    student.lc_medium_solved = None
    student.lc_hard_solved = None
    student.lc_contest_rating = None
    student.lc_contests_attended = None
    student.lc_raw_index = None
    student.lc_score = None


async def fetch_github_student(client: httpx.AsyncClient, student: Student) -> bool:
    """
    Fetch public GitHub profile and owned repos (excluding forks).
    Returns True if VERIFIED metrics were updated.
    """
    if not student.gh_username:
        return False

    token = os.getenv("GITHUB_TOKEN", "").strip()
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "CSE-Rank-Leaderboard/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    user_url = f"https://api.github.com/users/{student.gh_username}"
    repos_url = f"https://api.github.com/users/{student.gh_username}/repos?per_page=100&type=owner&sort=pushed"

    try:
        user_resp = await client.get(user_url, headers=headers)
        if user_resp.status_code == 404:
            student.gh_status = "INVALID_URL"
            student.gh_error_message = "GitHub user not found (404)"
            _clear_github_metrics(student)
            return False
        if user_resp.status_code in (403, 429):
            student.gh_status = "FETCH_FAILED"
            student.gh_error_message = f"GitHub API rate limit ({user_resp.status_code})"
            raise RateLimitError("github", user_resp.status_code, student.gh_error_message)
        if user_resp.status_code != 200:
            student.gh_status = "FETCH_FAILED"
            student.gh_error_message = f"GitHub HTTP {user_resp.status_code}"
            return False

        user_data = user_resp.json()

        repos_data: List[dict] = []
        page = 1
        while page <= 2:
            r_resp = await client.get(f"{repos_url}&page={page}", headers=headers)
            if r_resp.status_code in (403, 429):
                student.gh_status = "FETCH_FAILED"
                student.gh_error_message = f"GitHub API rate limit ({r_resp.status_code})"
                raise RateLimitError("github", r_resp.status_code, student.gh_error_message)
            if r_resp.status_code != 200:
                student.gh_status = "FETCH_FAILED"
                student.gh_error_message = f"GitHub repos HTTP {r_resp.status_code}"
                return False
            batch_repos = r_resp.json()
            if not isinstance(batch_repos, list):
                break
            repos_data.extend(batch_repos)
            if len(batch_repos) < 100:
                break
            page += 1

        original_repos = [r for r in repos_data if not r.get("fork", False)]
        total_stars = sum(int(r.get("stargazers_count") or 0) for r in original_repos)

        cutoff = datetime.now(timezone.utc) - timedelta(days=90)
        recent_active = 0
        lang_counts: Counter = Counter()

        for repo in original_repos:
            pushed_raw = repo.get("pushed_at")
            if pushed_raw:
                try:
                    pushed_dt = datetime.fromisoformat(pushed_raw.replace("Z", "+00:00"))
                    if pushed_dt >= cutoff:
                        recent_active += 1
                except ValueError:
                    pass
            lang = repo.get("language")
            if lang:
                lang_counts[str(lang)] += 1

        top_languages = [lang for lang, _ in lang_counts.most_common()]

        student.gh_public_repos = int(user_data.get("public_repos") or 0)
        student.gh_original_repos = len(original_repos)
        student.gh_total_stars = total_stars
        student.gh_followers = int(user_data.get("followers") or 0)
        student.gh_recent_active_repos_90d = recent_active
        student.gh_top_languages = json.dumps(top_languages)
        student.gh_distinct_languages_count = len(top_languages)
        student.gh_status = "VERIFIED"
        student.gh_error_message = None
        student.gh_last_updated = datetime.now(timezone.utc)
        return True
    except RateLimitError:
        raise
    except httpx.HTTPError as exc:
        student.gh_status = "FETCH_FAILED"
        student.gh_error_message = f"GitHub network error: {type(exc).__name__}"
        return False


async def fetch_leetcode_student(client: httpx.AsyncClient, student: Student) -> bool:
    """
    Fetch public LeetCode profile stats via public GraphQL API.
    Returns True if VERIFIED metrics were updated.
    """
    if not student.lc_username:
        return False

    headers = {
        "Content-Type": "application/json",
        "Referer": "https://leetcode.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CSE-Rank/1.0",
    }
    payload = {
        "query": LEETCODE_QUERY,
        "variables": {"username": student.lc_username},
    }

    try:
        resp = await client.post(LEETCODE_GRAPHQL_URL, json=payload, headers=headers)
        if resp.status_code in (403, 429):
            student.lc_status = "FETCH_FAILED"
            student.lc_error_message = f"LeetCode rate limited ({resp.status_code})"
            raise RateLimitError("leetcode", resp.status_code, student.lc_error_message)
        if resp.status_code != 200:
            student.lc_status = "FETCH_FAILED"
            student.lc_error_message = f"LeetCode HTTP {resp.status_code}"
            return False

        body = resp.json()
        data = body.get("data") or {}
        matched = data.get("matchedUser")
        if matched is None:
            student.lc_status = "INVALID_URL"
            student.lc_error_message = "LeetCode user not found"
            _clear_leetcode_metrics(student)
            return False

        stats = (matched.get("submitStatsGlobal") or {}).get("acSubmissionNum") or []
        counts: Dict[str, int] = {}
        for item in stats:
            diff = str(item.get("difficulty") or "").lower()
            counts[diff] = int(item.get("count") or 0)

        easy = counts.get("easy", 0)
        medium = counts.get("medium", 0)
        hard = counts.get("hard", 0)
        total = counts.get("all", easy + medium + hard)

        contest = data.get("userContestRanking") or {}
        rating = float(contest.get("rating") or 0.0)
        attended = int(contest.get("attendedContestsCount") or 0)

        student.lc_total_solved = total
        student.lc_easy_solved = easy
        student.lc_medium_solved = medium
        student.lc_hard_solved = hard
        student.lc_contest_rating = round(rating, 2)
        student.lc_contests_attended = attended
        student.lc_status = "VERIFIED"
        student.lc_error_message = None
        student.lc_last_updated = datetime.now(timezone.utc)
        return True
    except RateLimitError:
        raise
    except (httpx.HTTPError, ValueError) as exc:
        student.lc_status = "FETCH_FAILED"
        student.lc_error_message = f"LeetCode network error: {type(exc).__name__}"
        return False


async def sync_single_student(db: Session, student: Student, platform: str = "both") -> dict:
    """Live sync a single student's GitHub and/or LeetCode metrics and recalculate rankings."""
    updated_lc = False
    updated_gh = False
    errors: List[str] = []

    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        if platform in ("both", "github") and student.gh_username:
            try:
                updated_gh = await fetch_github_student(client, student)
                if not updated_gh and student.gh_error_message:
                    errors.append(f"GitHub: {student.gh_error_message}")
            except RateLimitError as exc:
                errors.append(str(exc))

        if platform in ("both", "leetcode") and student.lc_username:
            try:
                updated_lc = await fetch_leetcode_student(client, student)
                if not updated_lc and student.lc_error_message:
                    errors.append(f"LeetCode: {student.lc_error_message}")
            except RateLimitError as exc:
                errors.append(str(exc))

    db.commit()
    recalculate_all_rankings(db)

    if updated_lc or updated_gh:
        create_snapshot(db, student, source="LIVE_SYNC")
        settings = get_or_create_settings(db)
        settings.last_sync_at = datetime.now(timezone.utc)
        db.commit()

    db.refresh(student)
    return {
        "roll_number": student.roll_number,
        "updated_github": updated_gh,
        "updated_leetcode": updated_lc,
        "errors": errors,
    }


class BatchSyncManager:
    def __init__(self) -> None:
        self.is_running: bool = False
        self.stop_requested: bool = False
        self.task: Optional[asyncio.Task] = None
        self.status: dict = self._empty_status()

    @staticmethod
    def _empty_status() -> dict:
        return {
            "is_running": False,
            "batch": "ALL",
            "platform": "both",
            "total_targets": 0,
            "processed": 0,
            "gh_verified": 0,
            "gh_failed": 0,
            "lc_verified": 0,
            "lc_failed": 0,
            "gh_circuit_open": False,
            "lc_circuit_open": False,
            "circuit_breaker_reason": None,
            "current_student": None,
            "started_at": None,
            "finished_at": None,
            "logs": [],
        }

    def _log(self, msg: str) -> None:
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
        logs = self.status["logs"]
        logs.append(f"[{ts}] {msg}")
        if len(logs) > 80:
            self.status["logs"] = logs[-80:]

    def get_status(self) -> dict:
        return dict(self.status)

    def request_stop(self) -> dict:
        if self.is_running:
            self.stop_requested = True
            self._log("Stop requested by admin; finishing current item...")
        return self.get_status()

    def start_batch(self, batch: str, platform: str, limit: int, only_unverified: bool) -> dict:
        if self.is_running:
            return {"started": False, "message": "A batch sync is already running.", "status": self.get_status()}

        self.is_running = True
        self.stop_requested = False
        self.status = self._empty_status()
        self.status.update(
            {
                "is_running": True,
                "batch": batch,
                "platform": platform,
                "started_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        self.task = asyncio.create_task(self._run_batch(batch, platform, limit, only_unverified))
        return {"started": True, "message": "Batch sync started.", "status": self.get_status()}

    async def _run_batch(self, batch: str, platform: str, limit: int, only_unverified: bool) -> None:
        db = SessionLocal()
        try:
            query = db.query(Student)
            if batch != "ALL":
                query = query.filter(Student.batch == batch)

            candidates = query.order_by(Student.roll_number.asc()).all()
            targets: List[Student] = []
            for s in candidates:
                need_gh = False
                need_lc = False
                if platform in ("both", "github") and s.gh_username:
                    if not only_unverified or s.gh_status in ("PENDING", "FETCH_FAILED"):
                        need_gh = True
                if platform in ("both", "leetcode") and s.lc_username:
                    if not only_unverified or s.lc_status in ("PENDING", "FETCH_FAILED"):
                        need_lc = True
                if need_gh or need_lc:
                    targets.append(s)
                if len(targets) >= limit:
                    break

            self.status["total_targets"] = len(targets)
            self._log(f"Starting batch sync: {len(targets)} students (batch={batch}, platform={platform})")

            if not targets:
                self._log("No matching students need syncing.")
                return

            last_lc_request_at = 0.0
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
                for idx, student in enumerate(targets, start=1):
                    if self.stop_requested:
                        self._log("Batch sync stopped by admin.")
                        break

                    if (platform == "github" and self.status["gh_circuit_open"]) or (
                        platform == "leetcode" and self.status["lc_circuit_open"]
                    ) or (
                        platform == "both" and self.status["gh_circuit_open"] and self.status["lc_circuit_open"]
                    ):
                        self._log("Circuit breaker open for selected platform(s). Halting batch.")
                        break

                    self.status["current_student"] = f"{student.roll_number} ({student.name})"
                    updated_any = False

                    # GitHub sync
                    if (
                        platform in ("both", "github")
                        and student.gh_username
                        and not self.status["gh_circuit_open"]
                        and (not only_unverified or student.gh_status in ("PENDING", "FETCH_FAILED"))
                    ):
                        try:
                            ok = await fetch_github_student(client, student)
                            if ok:
                                self.status["gh_verified"] += 1
                                updated_any = True
                            else:
                                self.status["gh_failed"] += 1
                        except RateLimitError as exc:
                            self.status["gh_failed"] += 1
                            self.status["gh_circuit_open"] = True
                            self.status["circuit_breaker_reason"] = str(exc)
                            self._log(f"CIRCUIT BREAKER (GitHub): {exc}")

                    # LeetCode sync with 2s rate-limit delay
                    if (
                        platform in ("both", "leetcode")
                        and student.lc_username
                        and not self.status["lc_circuit_open"]
                        and (not only_unverified or student.lc_status in ("PENDING", "FETCH_FAILED"))
                    ):
                        now_mono = asyncio.get_running_loop().time()
                        elapsed = now_mono - last_lc_request_at
                        if last_lc_request_at > 0 and elapsed < LEETCODE_DELAY_SECONDS:
                            await asyncio.sleep(LEETCODE_DELAY_SECONDS - elapsed)
                        last_lc_request_at = asyncio.get_running_loop().time()
                        try:
                            ok = await fetch_leetcode_student(client, student)
                            if ok:
                                self.status["lc_verified"] += 1
                                updated_any = True
                            else:
                                self.status["lc_failed"] += 1
                        except RateLimitError as exc:
                            self.status["lc_failed"] += 1
                            self.status["lc_circuit_open"] = True
                            self.status["circuit_breaker_reason"] = str(exc)
                            self._log(f"CIRCUIT BREAKER (LeetCode): {exc} — use CSV fallback if rate-limited.")

                    db.commit()
                    if updated_any:
                        create_snapshot(db, student, source="LIVE_SYNC")
                        db.commit()

                    self.status["processed"] = idx
                    if idx % 10 == 0:
                        recalculate_all_rankings(db)
                        self._log(
                            f"Progress {idx}/{len(targets)} | GH ok={self.status['gh_verified']} | LC ok={self.status['lc_verified']}"
                        )

            recalculate_all_rankings(db)
            settings = get_or_create_settings(db)
            settings.last_sync_at = datetime.now(timezone.utc)
            db.commit()
            self._log("Batch sync finished and all rankings recalculated.")
        except Exception as exc:
            self._log(f"Unexpected batch error: {exc}")
        finally:
            self.is_running = False
            self.status["is_running"] = False
            self.status["current_student"] = None
            self.status["finished_at"] = datetime.now(timezone.utc).isoformat()
            db.close()


sync_manager = BatchSyncManager()
