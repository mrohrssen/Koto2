import asyncio
import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path


class FakeRequest:
    def __init__(self, method, url):
        self.method = method
        self.pretty_url = url


class FakeResponse:
    def __init__(self, status_code=200, raw_content=b"ok"):
        self.status_code = status_code
        self.raw_content = raw_content

    @staticmethod
    def make(status_code, raw_content, headers):
        response = FakeResponse(status_code, raw_content)
        response.headers = headers
        return response


class FakeFlow:
    def __init__(self, method, url, response=None):
        self.request = FakeRequest(method, url)
        self.response = response
        self.metadata = {}
        self.error = None


class FakeLoader:
    def add_option(self, *args, **kwargs):
        pass


class MitmKotoBenchTest(unittest.TestCase):
    def load_addon_module(self, tmpdir):
        profile_path = tmpdir / "profile.json"
        if not profile_path.exists():
            profile_path.write_text(json.dumps({
                "name": "baseline",
                "matchHost": "jrpg-dev.up.railway.app",
            }), encoding="utf-8")
        output_path = tmpdir / "flows.jsonl"

        fake_ctx = types.SimpleNamespace(
            options=types.SimpleNamespace(
                koto_profile=str(profile_path),
                koto_output=str(output_path),
            ),
            log=types.SimpleNamespace(info=lambda *_args, **_kwargs: None),
        )
        fake_mitmproxy = types.SimpleNamespace(
            ctx=fake_ctx,
            http=types.SimpleNamespace(Response=FakeResponse),
        )

        previous_mitmproxy = sys.modules.get("mitmproxy")
        sys.modules["mitmproxy"] = fake_mitmproxy
        self.addCleanup(self.restore_module, "mitmproxy", previous_mitmproxy)

        module_path = Path("scripts/network-bench/mitm_koto_bench.py")
        spec = importlib.util.spec_from_file_location("mitm_koto_bench_under_test", module_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module, output_path

    def restore_module(self, name, previous):
        if previous is None:
            sys.modules.pop(name, None)
        else:
            sys.modules[name] = previous

    def read_records(self, output_path):
        if not output_path.exists():
            return []
        return [
            json.loads(line)
            for line in output_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]

    def test_unmatched_flows_do_not_pollute_jsonl_or_matched_sequence(self):
        with tempfile.TemporaryDirectory() as tmp:
            module, output_path = self.load_addon_module(Path(tmp))
            addon = module.KotoNetworkBench()
            addon.load(FakeLoader())
            addon.configure({"koto_profile", "koto_output"})

            unmatched = FakeFlow(
                "GET",
                "https://www.sonyalpharumors.com/",
                response=FakeResponse(200, b"noise"),
            )
            asyncio.run(addon.request(unmatched))
            addon.response(unmatched)

            self.assertIsNone(unmatched.metadata["koto_sequence"])
            self.assertEqual(self.read_records(output_path), [])

            matched = FakeFlow(
                "GET",
                "https://jrpg-dev.up.railway.app/api/game/state",
                response=FakeResponse(200, b"{}"),
            )
            asyncio.run(addon.request(matched))
            addon.response(matched)

            self.assertEqual(matched.metadata["koto_sequence"], 1)
            records = self.read_records(output_path)
            self.assertEqual(len(records), 1)
            self.assertEqual(records[0]["host"], "jrpg-dev.up.railway.app")
            self.assertEqual(records[0]["path"], "/api/game/state")

    def test_path_filtered_profile_ignores_non_matching_dev_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            profile_path = tmpdir / "profile.json"
            profile_path.write_text(json.dumps({
                "name": "combat-api-slow-dev-ios",
                "matchHost": "jrpg-dev.up.railway.app",
                "pathPrefixes": ["/api/game/creature-combat-cycle"],
                "delay": {"baseMs": 0, "jitterMs": 0}
            }), encoding="utf-8")
            output_path = tmpdir / "flows.jsonl"

            module, output_path = self.load_addon_module(tmpdir)
            module.ctx.options.koto_profile = str(profile_path)
            module.ctx.options.koto_output = str(output_path)
            addon = module.KotoNetworkBench()
            addon.load(FakeLoader())
            addon.configure({"koto_profile", "koto_output"})

            ignored = FakeFlow(
                "GET",
                "https://jrpg-dev.up.railway.app/assets/index.js",
                response=FakeResponse(200, b"js"),
            )
            asyncio.run(addon.request(ignored))
            addon.response(ignored)

            matched = FakeFlow(
                "POST",
                "https://jrpg-dev.up.railway.app/api/game/creature-combat-cycle",
                response=FakeResponse(200, b"{}"),
            )
            asyncio.run(addon.request(matched))
            addon.response(matched)

            records = self.read_records(output_path)
            self.assertEqual(len(records), 1)
            self.assertEqual(records[0]["path"], "/api/game/creature-combat-cycle")


if __name__ == "__main__":
    unittest.main()
