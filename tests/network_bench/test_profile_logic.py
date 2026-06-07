import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.network_bench.profile_logic import (
    _unit_interval,
    categorize_url,
    decision_for_flow,
    flow_record,
    load_profile,
    matches_profile,
)


DEV_HOST = "jrpg-dev.up.railway.app"


class ProfileLogicTest(unittest.TestCase):
    def write_profile(self, data):
        tmpdir = tempfile.TemporaryDirectory()
        path = Path(tmpdir.name) / "profile.json"
        path.write_text(json.dumps(data), encoding="utf-8")
        self.addCleanup(tmpdir.cleanup)
        return path

    def test_load_profile_normalizes_defaults(self):
        path = self.write_profile({
            "name": "baseline-dev-ios",
            "matchHost": DEV_HOST
        })

        profile = load_profile(path)

        self.assertEqual(profile["name"], "baseline-dev-ios")
        self.assertEqual(profile["matchHost"], DEV_HOST)
        self.assertEqual(profile["pathPrefixes"], [])
        self.assertEqual(profile["delay"]["baseMs"], 0)
        self.assertEqual(profile["delay"]["jitterMs"], 0)
        self.assertEqual(profile["failure"]["rate"], 0)
        self.assertEqual(profile["failure"]["status"], 599)

    def test_matches_profile_matches_dev_host(self):
        profile = load_profile(self.write_profile({
            "name": "p",
            "matchHost": DEV_HOST
        }))

        self.assertTrue(matches_profile(profile, f"https://{DEV_HOST}/api/game/state"))
        self.assertFalse(matches_profile(profile, "https://jrpg-production.up.railway.app/api/game/state"))
        self.assertFalse(matches_profile(profile, "https://example.com/api/game/state"))

    def test_matches_profile_respects_path_prefixes(self):
        profile = load_profile(self.write_profile({
            "name": "combat-api-slow-dev-ios",
            "matchHost": DEV_HOST,
            "pathPrefixes": [
                "/api/game/creature-combat-cycle",
                "/api/game/state",
                "/api/game/kanji-kombat/answer"
            ]
        }))

        self.assertTrue(matches_profile(profile, f"https://{DEV_HOST}/api/game/creature-combat-cycle"))
        self.assertTrue(matches_profile(profile, f"https://{DEV_HOST}/api/game/state?refresh=1"))
        self.assertTrue(matches_profile(profile, f"https://{DEV_HOST}/api/game/kanji-kombat/answer"))
        self.assertFalse(matches_profile(profile, f"https://{DEV_HOST}/assets/index.js"))
        self.assertFalse(matches_profile(profile, f"https://{DEV_HOST}/api/settings"))

    def test_path_prefixes_none_normalizes_to_empty_list(self):
        profile = load_profile(self.write_profile({
            "name": "baseline-dev-ios",
            "matchHost": DEV_HOST,
            "pathPrefixes": None
        }))

        self.assertEqual(profile["pathPrefixes"], [])
        self.assertTrue(matches_profile(profile, f"https://{DEV_HOST}/assets/index.js"))

    def test_path_prefixes_scalar_string_normalizes_to_single_prefix(self):
        profile = load_profile(self.write_profile({
            "name": "combat-api-slow-dev-ios",
            "matchHost": DEV_HOST,
            "pathPrefixes": "/api/game/state"
        }))

        self.assertEqual(profile["pathPrefixes"], ["/api/game/state"])
        self.assertTrue(matches_profile(profile, f"https://{DEV_HOST}/api/game/state?refresh=1"))
        self.assertFalse(matches_profile(profile, f"https://{DEV_HOST}/assets/index.js"))

    def test_categorize_url(self):
        cases = {
            f"https://{DEV_HOST}/": "document",
            f"https://{DEV_HOST}/game.html": "document",
            f"https://{DEV_HOST}/assets/index.js": "javascript",
            f"https://{DEV_HOST}/assets/game.css": "css",
            f"https://{DEV_HOST}/assets/sprites/creatures/hi.webp": "image",
            f"https://{DEV_HOST}/assets/audio/click.mp3": "audio",
            f"https://{DEV_HOST}/api/game/state": "api",
            f"https://{DEV_HOST}/api/tts/synthesize": "tts",
            f"wss://{DEV_HOST}/socket.io/?EIO=4": "websocket",
            f"https://{DEV_HOST}/privacy": "other",
        }

        for url, expected in cases.items():
            with self.subTest(url=url):
                self.assertEqual(categorize_url(url), expected)

    def test_decision_is_deterministic(self):
        profile = load_profile(self.write_profile({
            "name": "unreliable-dev-ios",
            "matchHost": DEV_HOST,
            "seed": "seed-one",
            "delay": {"baseMs": 100, "jitterMs": 250},
            "failure": {"rate": 0.5, "status": 599, "body": "fail"}
        }))

        url = f"https://{DEV_HOST}/api/game/state"
        first = decision_for_flow(profile, "GET", url, 7)
        second = decision_for_flow(profile, "GET", url, 7)

        self.assertEqual(first, second)
        self.assertGreaterEqual(first["delayMs"], 100)
        self.assertLessEqual(first["delayMs"], 350)

    def test_unit_interval_stays_below_one_at_hash_upper_bound(self):
        with patch("scripts.network_bench.profile_logic.hashlib.sha256") as sha256:
            sha256.return_value.hexdigest.return_value = "f" * 16 + "0" * 48

            result = _unit_interval("seed")

        self.assertGreaterEqual(result, 0)
        self.assertLess(result, 1)

    def test_decision_failure_rate_one_always_fails(self):
        profile = load_profile(self.write_profile({
            "name": "always-fail",
            "matchHost": DEV_HOST,
            "delay": {"baseMs": 25, "jitterMs": 0},
            "failure": {"rate": 1, "status": 599}
        }))

        decision = decision_for_flow(profile, "GET", f"https://{DEV_HOST}/api/game/state", 1)

        self.assertTrue(decision["matches"])
        self.assertEqual(decision["delayMs"], 25)
        self.assertTrue(decision["shouldFail"])

    def test_decision_for_unmatched_path_has_no_injection(self):
        profile = load_profile(self.write_profile({
            "name": "combat-api-slow-dev-ios",
            "matchHost": DEV_HOST,
            "pathPrefixes": ["/api/game/creature-combat-cycle"],
            "delay": {"baseMs": 500, "jitterMs": 250},
            "failure": {"rate": 1, "status": 599}
        }))

        decision = decision_for_flow(profile, "GET", f"https://{DEV_HOST}/assets/index.js", 1)

        self.assertFalse(decision["matches"])
        self.assertEqual(decision["delayMs"], 0)
        self.assertFalse(decision["shouldFail"])

    def test_flow_record_contains_report_fields(self):
        profile = load_profile(self.write_profile({
            "name": "slow-dev-ios",
            "matchHost": DEV_HOST,
            "delay": {"baseMs": 500, "jitterMs": 0}
        }))
        decision = decision_for_flow(profile, "POST", f"https://{DEV_HOST}/api/game/creature-combat-cycle", 1)

        record = flow_record(
            profile=profile,
            method="POST",
            url=f"https://{DEV_HOST}/api/game/creature-combat-cycle",
            status=200,
            startedAt="2026-06-06T00:00:00.000Z",
            endedAt="2026-06-06T00:00:01.000Z",
            durationMs=1000,
            responseBytes=2048,
            decision=decision,
            error=None,
        )

        self.assertEqual(record["profile"], "slow-dev-ios")
        self.assertEqual(record["method"], "POST")
        self.assertEqual(record["host"], DEV_HOST)
        self.assertEqual(record["path"], "/api/game/creature-combat-cycle")
        self.assertEqual(record["category"], "api")
        self.assertEqual(record["status"], 200)
        self.assertEqual(record["durationMs"], 1000)
        self.assertEqual(record["responseBytes"], 2048)
        self.assertEqual(record["injectedDelayMs"], 500)
        self.assertFalse(record["injectedFailure"])


if __name__ == "__main__":
    unittest.main()
