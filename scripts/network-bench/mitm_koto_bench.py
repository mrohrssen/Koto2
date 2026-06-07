import asyncio
import json
import os
import sys
import time
from pathlib import Path

from mitmproxy import ctx, http


REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from scripts.network_bench.profile_logic import (  # noqa: E402
    decision_for_flow,
    flow_record,
    load_profile,
    matches_profile,
    utc_now_iso,
)


class KotoNetworkBench:
    def __init__(self):
        self.profile = None
        self.output_path = None
        self.sequence = 0

    def load(self, loader):
        loader.add_option(
            "koto_profile",
            str,
            "scripts/network-bench/profiles/baseline-dev-ios.json",
            "path to profile JSON",
        )
        loader.add_option(
            "koto_output",
            str,
            "output/network-bench/current/flows.jsonl",
            "output path for flow JSONL",
        )

    def configure(self, updated):
        if "koto_profile" in updated or self.profile is None:
            self.profile = load_profile(ctx.options.koto_profile)
            self.sequence = 0
            ctx.log.info(f'Koto network bench profile: {self.profile["name"]}')

        if "koto_output" in updated or self.output_path is None:
            self.output_path = Path(ctx.options.koto_output)
            self.output_path.parent.mkdir(parents=True, exist_ok=True)
            ctx.log.info(f"Koto network bench output: {self.output_path}")

    async def request(self, flow):
        url = flow.request.pretty_url
        method = flow.request.method
        sequence = None

        if matches_profile(self.profile, url):
            self.sequence += 1
            sequence = self.sequence

        decision = decision_for_flow(self.profile, method, url, sequence or 0)

        flow.metadata["koto_sequence"] = sequence
        flow.metadata["koto_started_at"] = utc_now_iso()
        flow.metadata["koto_start_monotonic"] = time.monotonic()
        flow.metadata["koto_decision"] = decision

        if not decision["matches"]:
            return

        if decision["delayMs"] > 0:
            await asyncio.sleep(decision["delayMs"] / 1000)

        if decision["shouldFail"]:
            flow.response = http.Response.make(
                decision["failureStatus"],
                decision["failureBody"].encode("utf-8"),
                {
                    "Content-Type": "text/plain; charset=utf-8",
                    "X-Koto-Benchmark-Failure": self.profile["name"],
                },
            )

    def response(self, flow):
        self._write_record(flow, error=None)

    def error(self, flow):
        error = str(flow.error) if flow.error else "unknown mitmproxy error"
        self._write_record(flow, error=error)

    def _write_record(self, flow, error):
        started_at = flow.metadata.get("koto_started_at") or utc_now_iso()
        start_monotonic = flow.metadata.get("koto_start_monotonic") or time.monotonic()
        decision = flow.metadata.get("koto_decision") or {
            "matches": False,
            "delayMs": 0,
            "shouldFail": False,
        }
        if not decision.get("matches"):
            return

        duration_ms = (time.monotonic() - start_monotonic) * 1000

        if flow.response:
            status = flow.response.status_code
            response_bytes = len(flow.response.raw_content or b"")
        else:
            status = 0
            response_bytes = 0

        record = flow_record(
            profile=self.profile,
            method=flow.request.method,
            url=flow.request.pretty_url,
            status=status,
            startedAt=started_at,
            endedAt=utc_now_iso(),
            durationMs=duration_ms,
            responseBytes=response_bytes,
            decision=decision,
            error=error,
        )

        with self.output_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, sort_keys=True) + os.linesep)


addons = [KotoNetworkBench()]
