import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse


DEFAULT_FAILURE_BODY = "Koto benchmark injected failure"


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def load_profile(path):
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    if not raw.get("name"):
        raise ValueError("profile.name is required")
    if not raw.get("matchHost"):
        raise ValueError("profile.matchHost is required")

    delay = raw.get("delay") or {}
    failure = raw.get("failure") or {}
    raw_prefixes = raw.get("pathPrefixes") or []
    if isinstance(raw_prefixes, str):
        raw_prefixes = [raw_prefixes]
    profile_prefixes = [str(prefix) for prefix in raw_prefixes]

    return {
        "name": raw["name"],
        "description": raw.get("description", ""),
        "matchHost": raw["matchHost"],
        "pathPrefixes": profile_prefixes,
        "seed": raw.get("seed", raw["name"]),
        "delay": {
            "baseMs": int(delay.get("baseMs", 0)),
            "jitterMs": int(delay.get("jitterMs", 0)),
        },
        "failure": {
            "rate": float(failure.get("rate", 0)),
            "status": int(failure.get("status", 599)),
            "body": str(failure.get("body", DEFAULT_FAILURE_BODY)),
        },
    }


def matches_profile(profile, url):
    parsed = urlparse(url)
    if parsed.hostname != profile["matchHost"]:
        return False
    prefixes = profile.get("pathPrefixes") or []
    if not prefixes:
        return True
    path = parsed.path or "/"
    return any(path.startswith(prefix) for prefix in prefixes)


def categorize_url(url):
    parsed = urlparse(url)
    path = parsed.path or "/"
    lower = path.lower()

    if parsed.scheme in ("ws", "wss") or "/socket.io/" in lower:
        return "websocket"
    if path == "/" or lower.endswith(".html"):
        return "document"
    if lower.endswith(".js"):
        return "javascript"
    if lower.endswith(".css"):
        return "css"
    if lower.endswith((".webp", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico")):
        return "image"
    if lower.endswith((".mp3", ".wav", ".m4a", ".ogg")):
        return "audio"
    if lower.startswith("/api/tts/"):
        return "tts"
    if lower.startswith("/api/"):
        return "api"
    return "other"


def _unit_interval(seed):
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    value = int(digest[:16], 16)
    fraction = value / float(2**64)
    return min(fraction, math.nextafter(1.0, 0.0))


def decision_for_flow(profile, method, url, sequence):
    if not matches_profile(profile, url):
        return {
            "matches": False,
            "delayMs": 0,
            "shouldFail": False,
            "failureStatus": profile["failure"]["status"],
            "failureBody": profile["failure"]["body"],
        }

    key = f'{profile["seed"]}|{sequence}|{method.upper()}|{url}'
    delay_jitter = profile["delay"]["jitterMs"]
    delay_fraction = _unit_interval(key + "|delay")
    failure_fraction = _unit_interval(key + "|failure")
    delay_ms = profile["delay"]["baseMs"] + int(round(delay_jitter * delay_fraction))
    failure_rate = max(0.0, min(1.0, profile["failure"]["rate"]))

    return {
        "matches": True,
        "delayMs": delay_ms,
        "shouldFail": failure_fraction < failure_rate,
        "failureStatus": profile["failure"]["status"],
        "failureBody": profile["failure"]["body"],
    }


def flow_record(
    *,
    profile,
    method,
    url,
    status,
    startedAt,
    endedAt,
    durationMs,
    responseBytes,
    decision,
    error,
):
    parsed = urlparse(url)
    return {
        "profile": profile["name"],
        "timestamp": startedAt,
        "endedAt": endedAt,
        "method": method.upper(),
        "url": url,
        "host": parsed.hostname,
        "path": parsed.path or "/",
        "category": categorize_url(url),
        "status": status,
        "durationMs": int(round(durationMs)),
        "responseBytes": int(responseBytes or 0),
        "injectedDelayMs": int(decision.get("delayMs", 0)),
        "injectedFailure": bool(decision.get("shouldFail", False)),
        "error": error,
    }
