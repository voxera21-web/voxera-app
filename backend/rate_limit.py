from __future__ import annotations

import math
import threading
import time


RatePolicy = tuple[int, int]


def policy_for(path: str, method: str) -> RatePolicy:
    method = method.upper()
    if path == "/api/health":
        return 0, 0
    if path.startswith("/api/auth/"):
        return (20, 60) if method == "GET" else (10, 60)
    if path in {"/api/reports", "/api/reports.csv"}:
        return 20, 60
    if method in {"POST", "PUT", "PATCH", "DELETE"} and (
        path.endswith(("/image", "/recording", "/photo", "/banner"))
        or path.startswith("/api/settings/photo")
        or path.startswith("/api/settings/banner")
    ):
        return 20, 3600
    if method in {"POST", "PUT", "PATCH", "DELETE"}:
        return 60, 60
    if path.startswith("/api/public/") or path in {
        "/api/organisations",
        "/api/setup/status",
    } or path.startswith(("/api/organisations/", "/api/programmes/")):
        return 120, 60
    return 300, 60


def bucket_for(path: str, method: str) -> str:
    method = method.upper()
    if path.startswith("/api/auth/"):
        return "auth"
    if path in {"/api/reports", "/api/reports.csv"}:
        return "reports"
    if method in {"POST", "PUT", "PATCH", "DELETE"} and (
        path.endswith(("/image", "/recording", "/photo", "/banner"))
        or path.startswith(("/api/settings/photo", "/api/settings/banner"))
    ):
        return "uploads"
    if path.startswith("/api/public/") or path in {
        "/api/organisations",
        "/api/setup/status",
    } or path.startswith(("/api/organisations/", "/api/programmes/")):
        return "public"
    return "writes" if method in {"POST", "PUT", "PATCH", "DELETE"} else "reads"


class FixedWindowRateLimiter:
    def __init__(self, max_keys: int = 50_000):
        self._windows: dict[str, tuple[float, int, int]] = {}
        self._lock = threading.Lock()
        self._max_keys = max_keys
        self._operations = 0

    def consume(
        self,
        key: str,
        limit: int,
        window_seconds: int,
        now: float | None = None,
    ) -> tuple[bool, int, int]:
        if limit <= 0 or window_seconds <= 0:
            return True, 0, limit
        current = time.monotonic() if now is None else now
        with self._lock:
            existing = self._windows.get(key)
            if existing is None or current - existing[0] >= window_seconds:
                if existing is None and len(self._windows) >= self._max_keys:
                    self._prune(current)
                    if len(self._windows) >= self._max_keys:
                        return False, window_seconds, 0
                self._windows[key] = (current, 1, window_seconds)
                self._prune_periodically(current)
                return True, 0, limit - 1

            started, count, _ = existing
            if count >= limit:
                return False, max(1, math.ceil(window_seconds - (current - started))), 0
            self._windows[key] = (started, count + 1, window_seconds)
            self._prune_periodically(current)
            return True, 0, limit - count - 1

    def _prune_periodically(self, current: float) -> None:
        self._operations += 1
        if self._operations % 1024 == 0:
            self._prune(current)

    def _prune(self, current: float) -> None:
        expired = [
            key
            for key, (started, _, window_seconds) in self._windows.items()
            if current - started >= window_seconds
        ]
        for key in expired:
            del self._windows[key]
