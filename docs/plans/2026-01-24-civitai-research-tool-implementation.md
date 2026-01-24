# CivitAI Art Research Tool — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a re-runnable Python pipeline that searches CivitAI for better image generation models, downloads samples, generates comparison batches on the local ComfyUI machine, and produces reports for human review.

**Architecture:** A single Python script (`scripts/civitai_research.py`) with subcommands for each phase. It reads the art style doc (`docs/art-style.md`) for search keywords and the generation config (`config/generation-config.json`) for current settings. Reports go to `docs/plans/`. Samples go to `tmp/civitai-samples/`. ComfyUI interaction uses the same HTTP API pattern as existing generation scripts. SSH commands use subprocess for model downloads.

**Tech Stack:** Python 3 (stdlib: urllib, json, subprocess, os, time, argparse), ComfyUI HTTP API, CivitAI REST API, SSH (pre-configured keys)

---

## Task 1: Create Generation Config File

**Files:**
- Create: `config/generation-config.json`

**Step 1: Create the config directory**

```bash
mkdir -p config
```

**Step 2: Write the initial config file**

Create `config/generation-config.json` with the current baseline settings extracted from the existing generation scripts:

```json
{
  "comfyui": {
    "host": "192.168.1.222",
    "port": 8188,
    "ssh_user": "michia"
  },
  "categories": {
    "enemies": {
      "checkpoint": "waiIllustriousSDXL_v160.safetensors",
      "loras": [],
      "embeddings": [],
      "style_prompt": "solo, single character, anime character illustration, full body dynamic pose, white background, clean lines, anime game character style, dramatic confident stance, elaborate detailed clothing, vibrant saturated colors, colorful, warm lighting, varied color palette, natural skin tones, game character art, high quality, sharp details",
      "negative_prompt": "dark, gritty, realistic, horror, scary, nude, nsfw, text, watermark, blurry, low quality, chibi, super deformed, multiple characters, multiple people, crowd, group, duo, blood, pokeball, pokeballs, poke ball, monochrome, silhouette, blue theme, black and blue, tron, neon glow, blue fire, energy aura, limited palette, desaturated, grayscale, lineart only, sketch, cat ears, animal ears, furry, non-human",
      "sampler": "dpmpp_2m",
      "scheduler": "karras",
      "steps": 30,
      "cfg": 7.5,
      "resolution": [1024, 1024],
      "post_processing": ["RMBG-2.0"]
    },
    "chips": {
      "checkpoint": "waiIllustriousSDXL_v160.safetensors",
      "loras": [],
      "embeddings": [],
      "style_prompt": "solo, chibi character, gacha game art style, mobile game character icon, white background, bright vivid colors, high quality, clean, simple background, no text, no writing",
      "negative_prompt": "dark, gritty, realistic, horror, text, letters, writing, font, alphabet, japanese text, kanji, katakana, hiragana, words, logo, watermark, signature, blurry, low quality, multiple characters, complex background, pokeball, human, humanoid, detailed background",
      "sampler": "dpmpp_2m",
      "scheduler": "karras",
      "steps": 30,
      "cfg": 7.5,
      "resolution": [1024, 1024],
      "post_processing": ["RMBG-2.0"]
    },
    "backgrounds": {
      "checkpoint": "waiIllustriousSDXL_v160.safetensors",
      "loras": [],
      "embeddings": [],
      "style_prompt": "anime background, cityscape, street level perspective, eye level camera, vibrant, colorful signage, modern Tokyo architecture, blue sky, detailed, high quality",
      "negative_prompt": "aerial view, birds eye, top down, floating, clouds below, helicopter view, drone shot, dark, horror, text, watermark, blurry, low quality, people, characters, figures",
      "sampler": "dpmpp_2m",
      "scheduler": "karras",
      "steps": 30,
      "cfg": 7.5,
      "resolution": [1344, 768],
      "post_processing": []
    }
  }
}
```

**Step 3: Commit**

```bash
git add config/generation-config.json
git commit -m "feat: add generation config with current baseline settings"
```

---

## Task 2: CivitAI API Client Module

**Files:**
- Create: `scripts/civitai_client.py`
- Test: `scripts/test_civitai_client.py`

**Step 1: Write the failing test**

Create `scripts/test_civitai_client.py`:

```python
#!/usr/bin/env python3
"""Tests for CivitAI API client."""

import unittest
from unittest.mock import patch, MagicMock
import json

from civitai_client import CivitAIClient


class TestCivitAIClient(unittest.TestCase):

    def test_search_models_builds_correct_url(self):
        client = CivitAIClient()
        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_response = MagicMock()
            mock_response.read.return_value = json.dumps({
                "items": [], "metadata": {"totalPages": 0}
            }).encode()
            mock_response.__enter__ = lambda s: s
            mock_response.__exit__ = MagicMock(return_value=False)
            mock_urlopen.return_value = mock_response

            client.search_models(query="anime character", types=["LORA"], base_models=["SDXL 1.0"])

            called_url = mock_urlopen.call_args[0][0].full_url
            assert "query=anime+character" in called_url
            assert "types=LORA" in called_url
            assert "baseModels=SDXL+1.0" in called_url

    def test_search_models_returns_items(self):
        client = CivitAIClient()
        fake_items = [{"id": 1, "name": "TestModel", "type": "LORA"}]
        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_response = MagicMock()
            mock_response.read.return_value = json.dumps({
                "items": fake_items, "metadata": {"totalPages": 1}
            }).encode()
            mock_response.__enter__ = lambda s: s
            mock_response.__exit__ = MagicMock(return_value=False)
            mock_urlopen.return_value = mock_response

            result = client.search_models(query="test")
            assert result["items"] == fake_items

    def test_get_model_details(self):
        client = CivitAIClient()
        fake_model = {"id": 123, "name": "TestModel", "modelVersions": []}
        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_response = MagicMock()
            mock_response.read.return_value = json.dumps(fake_model).encode()
            mock_response.__enter__ = lambda s: s
            mock_response.__exit__ = MagicMock(return_value=False)
            mock_urlopen.return_value = mock_response

            result = client.get_model(123)
            assert result["id"] == 123
            assert result["name"] == "TestModel"

    def test_get_model_images(self):
        client = CivitAIClient()
        fake_images = [{"url": "https://image.civitai.com/test.jpg", "width": 1024}]
        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_response = MagicMock()
            mock_response.read.return_value = json.dumps({
                "items": fake_images, "metadata": {}
            }).encode()
            mock_response.__enter__ = lambda s: s
            mock_response.__exit__ = MagicMock(return_value=False)
            mock_urlopen.return_value = mock_response

            result = client.get_images(model_id=123)
            assert result[0]["url"] == "https://image.civitai.com/test.jpg"

    def test_download_image_saves_file(self):
        client = CivitAIClient()
        with patch("urllib.request.urlretrieve") as mock_retrieve:
            client.download_image("https://image.civitai.com/test.jpg", "/tmp/test.jpg")
            mock_retrieve.assert_called_once_with(
                "https://image.civitai.com/test.jpg", "/tmp/test.jpg"
            )

    def test_rate_limiting(self):
        client = CivitAIClient(rate_limit_ms=100)
        assert client.rate_limit_ms == 100


if __name__ == "__main__":
    unittest.main()
```

**Step 2: Run test to verify it fails**

```bash
cd scripts && python -m pytest test_civitai_client.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'civitai_client'`

**Step 3: Write the implementation**

Create `scripts/civitai_client.py`:

```python
#!/usr/bin/env python3
"""
CivitAI REST API client for model discovery.

Searches for models, fetches details, downloads sample images.
No authentication required for public content.

API docs: https://github.com/civitai/civitai/wiki/REST-API-Reference
"""

import json
import time
import urllib.request
import urllib.parse
import os


BASE_URL = "https://civitai.com/api/v1"


class CivitAIClient:
    def __init__(self, rate_limit_ms=500):
        self.rate_limit_ms = rate_limit_ms
        self._last_request_time = 0

    def _rate_limit(self):
        now = time.time() * 1000
        elapsed = now - self._last_request_time
        if elapsed < self.rate_limit_ms:
            time.sleep((self.rate_limit_ms - elapsed) / 1000)
        self._last_request_time = time.time() * 1000

    def _get(self, url):
        self._rate_limit()
        req = urllib.request.Request(url, headers={"User-Agent": "NEO-TOKYO-Research/1.0"})
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))

    def search_models(self, query, types=None, base_models=None, sort="Highest Rated",
                      period="AllTime", limit=20, nsfw=False):
        """Search CivitAI models by keyword.

        Args:
            query: Search term (e.g., "anime character")
            types: Filter by type list (e.g., ["Checkpoint", "LORA"])
            base_models: Filter by base model (e.g., ["SDXL 1.0"])
            sort: Sort order ("Highest Rated", "Most Downloaded", "Newest")
            period: Time period ("AllTime", "Year", "Month", "Week", "Day")
            limit: Results per page (max 100)
            nsfw: Include NSFW results

        Returns:
            Dict with "items" list and "metadata" pagination info.
        """
        params = {
            "query": query,
            "sort": sort,
            "period": period,
            "limit": str(limit),
            "nsfw": str(nsfw).lower(),
        }
        if types:
            for t in types:
                params.setdefault("types", t)
        if base_models:
            for bm in base_models:
                params.setdefault("baseModels", bm)

        # Build URL with proper encoding
        query_parts = []
        for key, value in params.items():
            query_parts.append(f"{urllib.parse.quote(key)}={urllib.parse.quote(str(value))}")
        if types:
            for t in types:
                query_parts.append(f"types={urllib.parse.quote(t)}")
        if base_models:
            for bm in base_models:
                query_parts.append(f"baseModels={urllib.parse.quote(bm)}")

        url = f"{BASE_URL}/models?{'&'.join(query_parts)}"
        return self._get(url)

    def get_model(self, model_id):
        """Get full details for a specific model.

        Returns model info including all versions, trigger words, example prompts.
        """
        return self._get(f"{BASE_URL}/models/{model_id}")

    def get_images(self, model_id=None, model_version_id=None, limit=10, sort="Most Reactions"):
        """Get example images for a model or version.

        Returns list of image objects with URLs, dimensions, and generation metadata.
        """
        params = {"limit": str(limit), "sort": sort}
        if model_id:
            params["modelId"] = str(model_id)
        if model_version_id:
            params["modelVersionId"] = str(model_version_id)

        query_string = urllib.parse.urlencode(params)
        result = self._get(f"{BASE_URL}/images?{query_string}")
        return result.get("items", [])

    def download_image(self, url, save_path):
        """Download an image from CivitAI CDN to local path."""
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        urllib.request.urlretrieve(url, save_path)
```

**Step 4: Run tests to verify they pass**

```bash
cd scripts && python -m pytest test_civitai_client.py -v
```

Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add scripts/civitai_client.py scripts/test_civitai_client.py
git commit -m "feat: add CivitAI API client with model search and image download"
```

---

## Task 3: Research Phase (Discovery Script)

**Files:**
- Create: `scripts/civitai_research.py`
- Read: `docs/art-style.md`, `config/generation-config.json`
- Output: `tmp/civitai-samples/`, `docs/plans/YYYY-MM-DD-civitai-research-report.md`

**Step 1: Write the failing test**

Add to `scripts/test_civitai_client.py` (or create `scripts/test_civitai_research.py`):

```python
#!/usr/bin/env python3
"""Tests for CivitAI research discovery phase."""

import unittest
from unittest.mock import patch, MagicMock, mock_open
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from civitai_research import (
    load_art_style_keywords,
    load_generation_config,
    filter_relevant_models,
    generate_report,
)


class TestDiscovery(unittest.TestCase):

    def test_load_art_style_keywords_extracts_search_terms(self):
        fake_doc = """## CivitAI Research Keywords
**General**: game, anime, illustrious
**Characters**: anime character, full body
**Chibi/Icons**: chibi, mascot
**Backgrounds**: anime background, cityscape
"""
        with patch("builtins.open", mock_open(read_data=fake_doc)):
            keywords = load_art_style_keywords("docs/art-style.md")
            assert "game" in keywords["general"]
            assert "anime character" in keywords["characters"]
            assert "chibi" in keywords["chibi"]
            assert "anime background" in keywords["backgrounds"]

    def test_load_generation_config(self):
        fake_config = {
            "comfyui": {"host": "192.168.1.222"},
            "categories": {"enemies": {"checkpoint": "test.safetensors"}}
        }
        with patch("builtins.open", mock_open(read_data=json.dumps(fake_config))):
            config = load_generation_config("config/generation-config.json")
            assert config["categories"]["enemies"]["checkpoint"] == "test.safetensors"

    def test_filter_relevant_models_by_downloads(self):
        models = [
            {"id": 1, "name": "Popular", "stats": {"downloadCount": 5000, "rating": 4.5}},
            {"id": 2, "name": "Obscure", "stats": {"downloadCount": 50, "rating": 3.0}},
            {"id": 3, "name": "Medium", "stats": {"downloadCount": 1500, "rating": 4.0}},
        ]
        filtered = filter_relevant_models(models, min_downloads=1000, min_rating=3.5)
        assert len(filtered) == 2
        assert filtered[0]["name"] == "Popular"
        assert filtered[1]["name"] == "Medium"

    def test_generate_report_creates_markdown(self):
        findings = {
            "enemies": [{"name": "Model1", "id": 1, "type": "LORA", "reason": "Good anime style"}],
            "chips": [],
            "backgrounds": [],
        }
        current_config = {"categories": {"enemies": {"checkpoint": "current.safetensors"}}}
        report = generate_report(findings, current_config, sample_dir="/tmp/samples")
        assert "# CivitAI Research Report" in report
        assert "Model1" in report
        assert "current.safetensors" in report


if __name__ == "__main__":
    unittest.main()
```

**Step 2: Run test to verify it fails**

```bash
cd scripts && python -m pytest test_civitai_research.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'civitai_research'`

**Step 3: Write the implementation**

Create `scripts/civitai_research.py`:

```python
#!/usr/bin/env python3
"""
CivitAI Art Research Tool — Discovery Phase

Reads art style keywords, searches CivitAI for relevant models,
downloads sample images, and generates a research report.

Usage:
    python civitai_research.py discover        # Run full discovery
    python civitai_research.py discover --category enemies  # Single category
    python civitai_research.py report          # Generate report from cached results
"""

import argparse
import json
import os
import re
import time
from datetime import date

from civitai_client import CivitAIClient

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART_STYLE_PATH = os.path.join(PROJECT_ROOT, "docs", "art-style.md")
CONFIG_PATH = os.path.join(PROJECT_ROOT, "config", "generation-config.json")
SAMPLES_DIR = os.path.join(PROJECT_ROOT, "tmp", "civitai-samples")
REPORTS_DIR = os.path.join(PROJECT_ROOT, "docs", "plans")

# Base models compatible with our Illustrious SDXL setup
COMPATIBLE_BASE_MODELS = ["SDXL 1.0", "SDXL Turbo", "Illustrious"]

# Model types we care about
MODEL_TYPES = ["Checkpoint", "LORA", "TextualInversion"]

# Minimum thresholds for model quality
MIN_DOWNLOADS = 500
MIN_RATING = 4.0


def load_art_style_keywords(path):
    """Parse CivitAI Research Keywords section from art-style.md.

    Returns dict with keys: general, characters, chibi, backgrounds, style
    """
    with open(path, "r") as f:
        content = f.read()

    keywords = {}
    in_section = False
    for line in content.split("\n"):
        if "CivitAI Research Keywords" in line:
            in_section = True
            continue
        if in_section and line.startswith("##"):
            break
        if in_section and line.startswith("**"):
            match = re.match(r"\*\*([^*]+)\*\*:\s*(.+)", line)
            if match:
                category = match.group(1).lower().split("/")[0].strip()
                terms = [t.strip() for t in match.group(2).split(",")]
                keywords[category] = terms

    return keywords


def load_generation_config(path):
    """Load the current generation config JSON."""
    with open(path, "r") as f:
        return json.load(f)


def filter_relevant_models(models, min_downloads=MIN_DOWNLOADS, min_rating=MIN_RATING):
    """Filter model list by download count and rating thresholds."""
    filtered = []
    for model in models:
        stats = model.get("stats", {})
        downloads = stats.get("downloadCount", 0)
        rating = stats.get("rating", 0)
        if downloads >= min_downloads and rating >= min_rating:
            filtered.append(model)
    return sorted(filtered, key=lambda m: m["stats"]["downloadCount"], reverse=True)


def generate_report(findings, current_config, sample_dir):
    """Generate a markdown research report from discovery findings.

    Args:
        findings: Dict mapping category -> list of model findings
        current_config: Current generation-config.json contents
        sample_dir: Path where sample images were saved

    Returns:
        Markdown string for the report
    """
    today = date.today().isoformat()
    total_models = sum(len(v) for v in findings.values())

    lines = [
        f"# CivitAI Research Report — {today}",
        "",
        "## Executive Summary",
        "",
        f"Searched CivitAI for models relevant to NEO TOKYO art style.",
        f"Evaluated {total_models} models across {len(findings)} categories.",
        "",
    ]

    for category, models in findings.items():
        current = current_config.get("categories", {}).get(category, {})
        lines.append(f"## {category.title()}")
        lines.append("")
        lines.append(f"**Current setup:** {current.get('checkpoint', 'unknown')}")
        if current.get("loras"):
            lines.append(f"**Current LoRAs:** {', '.join(current['loras'])}")
        lines.append("")

        if not models:
            lines.append("No new models discovered for this category.")
            lines.append("")
            continue

        lines.append("### Discovered Models")
        lines.append("")
        for model in models:
            lines.append(f"#### {model['name']} ({model['type']})")
            lines.append(f"- **CivitAI:** https://civitai.com/models/{model['id']}")
            if model.get("reason"):
                lines.append(f"- **Relevance:** {model['reason']}")
            stats = model.get("stats", {})
            lines.append(f"- **Downloads:** {stats.get('downloadCount', '?')} | "
                        f"**Rating:** {stats.get('rating', '?')}")
            if model.get("trigger_words"):
                lines.append(f"- **Trigger words:** {', '.join(model['trigger_words'])}")
            if model.get("sample_paths"):
                lines.append("- **Samples:**")
                for sp in model["sample_paths"]:
                    lines.append(f"  - `{sp}`")
            lines.append("")

    lines.append("## Recommendations")
    lines.append("")
    lines.append("_To be filled after human review of samples._")
    lines.append("")

    return "\n".join(lines)


def discover_category(client, category, keywords, current_config):
    """Run discovery for a single asset category.

    Args:
        client: CivitAIClient instance
        category: "enemies", "chips", or "backgrounds"
        keywords: List of search terms for this category
        current_config: Current generation config

    Returns:
        List of model finding dicts
    """
    keyword_map = {
        "enemies": "characters",
        "chips": "chibi",
        "backgrounds": "backgrounds",
    }
    search_key = keyword_map.get(category, category)
    search_terms = keywords.get(search_key, []) + keywords.get("general", [])

    seen_ids = set()
    all_models = []

    print(f"\n{'='*60}")
    print(f"DISCOVERING: {category.upper()}")
    print(f"Search terms: {', '.join(search_terms[:5])}...")
    print(f"{'='*60}")

    for term in search_terms:
        print(f"\n  Searching: '{term}'...")
        try:
            result = client.search_models(
                query=term,
                types=MODEL_TYPES,
                base_models=COMPATIBLE_BASE_MODELS,
                sort="Highest Rated",
                limit=10,
            )
            for model in result.get("items", []):
                if model["id"] not in seen_ids:
                    seen_ids.add(model["id"])
                    all_models.append(model)
                    print(f"    Found: {model['name']} ({model['type']}) - "
                          f"{model['stats']['downloadCount']} downloads")
        except Exception as e:
            print(f"    Error searching '{term}': {e}")

    # Filter by quality thresholds
    filtered = filter_relevant_models(all_models)
    print(f"\n  {len(all_models)} total → {len(filtered)} after quality filter")

    # Fetch details and sample images for top candidates
    findings = []
    category_sample_dir = os.path.join(SAMPLES_DIR, category)
    os.makedirs(category_sample_dir, exist_ok=True)

    for model in filtered[:10]:  # Top 10 per category
        print(f"\n  Fetching details: {model['name']}...")
        try:
            details = client.get_model(model["id"])
            trigger_words = []
            if details.get("modelVersions"):
                latest = details["modelVersions"][0]
                trigger_words = latest.get("trainedWords", [])

            # Download up to 3 sample images
            sample_paths = []
            images = client.get_images(model_id=model["id"], limit=3)
            for i, img in enumerate(images[:3]):
                img_url = img.get("url", "")
                if img_url:
                    ext = "jpg"
                    filename = f"{model['id']}_{i}.{ext}"
                    save_path = os.path.join(category_sample_dir, filename)
                    try:
                        client.download_image(img_url, save_path)
                        sample_paths.append(save_path)
                        print(f"    Downloaded sample {i+1}")
                    except Exception as e:
                        print(f"    Failed to download sample: {e}")

            findings.append({
                "id": model["id"],
                "name": model["name"],
                "type": model["type"],
                "stats": model["stats"],
                "trigger_words": trigger_words,
                "sample_paths": sample_paths,
                "reason": f"Matched search for {category} art",
            })
        except Exception as e:
            print(f"    Error fetching details: {e}")

    return findings


def run_discovery(categories=None):
    """Run the full discovery phase.

    Args:
        categories: List of categories to search, or None for all.
    """
    client = CivitAIClient(rate_limit_ms=500)
    keywords = load_art_style_keywords(ART_STYLE_PATH)
    config = load_generation_config(CONFIG_PATH)

    if categories is None:
        categories = ["enemies", "chips", "backgrounds"]

    findings = {}
    for category in categories:
        findings[category] = discover_category(client, category, keywords, config)

    # Generate and save report
    report = generate_report(findings, config, SAMPLES_DIR)
    today = date.today().isoformat()
    report_path = os.path.join(REPORTS_DIR, f"{today}-civitai-research-report.md")
    os.makedirs(REPORTS_DIR, exist_ok=True)
    with open(report_path, "w") as f:
        f.write(report)

    print(f"\n{'='*60}")
    print(f"DISCOVERY COMPLETE")
    print(f"Report: {report_path}")
    print(f"Samples: {SAMPLES_DIR}/")
    print(f"{'='*60}")

    return report_path


def main():
    parser = argparse.ArgumentParser(description="CivitAI Art Research Tool")
    subparsers = parser.add_subparsers(dest="command")

    discover_parser = subparsers.add_parser("discover", help="Search CivitAI for models")
    discover_parser.add_argument("--category", choices=["enemies", "chips", "backgrounds"],
                                help="Search single category only")

    subparsers.add_parser("report", help="Regenerate report from cached results")

    args = parser.parse_args()

    if args.command == "discover":
        categories = [args.category] if args.category else None
        run_discovery(categories)
    elif args.command == "report":
        config = load_generation_config(CONFIG_PATH)
        # Load cached findings from samples dir
        print("Report regeneration from cache not yet implemented.")
        print("Run 'discover' first.")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
```

**Step 4: Run tests to verify they pass**

```bash
cd scripts && python -m pytest test_civitai_research.py -v
```

Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add scripts/civitai_research.py scripts/test_civitai_research.py
git commit -m "feat: add CivitAI discovery phase - search, filter, report"
```

---

## Task 4: Model Setup Phase (SSH Download)

**Files:**
- Modify: `scripts/civitai_research.py` (add `setup` subcommand)
- Test: `scripts/test_civitai_research.py` (add setup tests)

**Step 1: Write the failing test**

Add to `scripts/test_civitai_research.py`:

```python
class TestModelSetup(unittest.TestCase):

    @patch("subprocess.run")
    def test_ssh_download_model_constructs_correct_command(self, mock_run):
        from civitai_research import download_model_to_comfyui

        mock_run.return_value = MagicMock(returncode=0)
        download_model_to_comfyui(
            model_url="https://civitai.com/api/download/models/12345",
            filename="test_lora.safetensors",
            model_type="LORA",
            config={"comfyui": {"host": "192.168.1.222", "ssh_user": "michia"}},
        )

        call_args = mock_run.call_args[0][0]
        assert "ssh" in call_args[0]
        assert "michia@192.168.1.222" in " ".join(call_args)
        assert "test_lora.safetensors" in " ".join(call_args)

    @patch("subprocess.run")
    def test_ssh_download_lora_goes_to_loras_dir(self, mock_run):
        from civitai_research import download_model_to_comfyui

        mock_run.return_value = MagicMock(returncode=0)
        download_model_to_comfyui(
            model_url="https://civitai.com/api/download/models/999",
            filename="anime_style.safetensors",
            model_type="LORA",
            config={"comfyui": {"host": "192.168.1.222", "ssh_user": "michia"}},
        )

        call_args = " ".join(mock_run.call_args[0][0])
        assert "loras" in call_args.lower()

    @patch("subprocess.run")
    def test_ssh_download_checkpoint_goes_to_checkpoints_dir(self, mock_run):
        from civitai_research import download_model_to_comfyui

        mock_run.return_value = MagicMock(returncode=0)
        download_model_to_comfyui(
            model_url="https://civitai.com/api/download/models/999",
            filename="new_checkpoint.safetensors",
            model_type="Checkpoint",
            config={"comfyui": {"host": "192.168.1.222", "ssh_user": "michia"}},
        )

        call_args = " ".join(mock_run.call_args[0][0])
        assert "checkpoints" in call_args.lower()

    @patch("subprocess.run")
    def test_verify_model_loaded_queries_comfyui_api(self, mock_run):
        from civitai_research import verify_model_available

        mock_run.return_value = MagicMock(returncode=0, stdout='["model.safetensors"]')
        result = verify_model_available("model.safetensors", "LORA",
                                        config={"comfyui": {"host": "192.168.1.222", "port": 8188}})
        assert result is True
```

**Step 2: Run test to verify it fails**

```bash
cd scripts && python -m pytest test_civitai_research.py::TestModelSetup -v
```

Expected: FAIL with `ImportError: cannot import name 'download_model_to_comfyui'`

**Step 3: Write the implementation**

Add these functions to `scripts/civitai_research.py`:

```python
import subprocess

# ComfyUI model directory mapping (Linux paths on the remote machine)
COMFYUI_MODEL_DIRS = {
    "Checkpoint": "models/checkpoints",
    "LORA": "models/loras",
    "TextualInversion": "models/embeddings",
}


def find_comfyui_base_dir(config):
    """Discover ComfyUI base directory on the remote machine via SSH."""
    host = config["comfyui"]["host"]
    user = config["comfyui"]["ssh_user"]
    result = subprocess.run(
        ["ssh", f"{user}@{host}", "find /home -name 'main.py' -path '*/ComfyUI/*' 2>/dev/null | head -1"],
        capture_output=True, text=True, timeout=10
    )
    if result.returncode == 0 and result.stdout.strip():
        return os.path.dirname(result.stdout.strip())
    # Fallback to common locations
    for path in [f"/home/{user}/ComfyUI", "/opt/ComfyUI", f"/home/{user}/comfyui"]:
        check = subprocess.run(
            ["ssh", f"{user}@{host}", f"test -d {path} && echo exists"],
            capture_output=True, text=True, timeout=5
        )
        if "exists" in check.stdout:
            return path
    return f"/home/{user}/ComfyUI"  # Best guess


def download_model_to_comfyui(model_url, filename, model_type, config):
    """Download a model file to the ComfyUI machine via SSH + curl.

    Args:
        model_url: CivitAI download URL (e.g., https://civitai.com/api/download/models/12345)
        filename: Target filename (e.g., "anime_lora.safetensors")
        model_type: "Checkpoint", "LORA", or "TextualInversion"
        config: Generation config dict with comfyui connection info
    """
    host = config["comfyui"]["host"]
    user = config["comfyui"]["ssh_user"]
    subdir = COMFYUI_MODEL_DIRS.get(model_type, "models/loras")

    # Use SSH to curl the file directly on the remote machine
    remote_path = f"ComfyUI/{subdir}/{filename}"
    cmd = [
        "ssh", f"{user}@{host}",
        f"mkdir -p ComfyUI/{subdir} && curl -L -o {remote_path} '{model_url}'"
    ]

    print(f"  Downloading {filename} to {host}:{remote_path}...")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        raise RuntimeError(f"SSH download failed: {result.stderr}")
    print(f"  Download complete.")


def verify_model_available(filename, model_type, config):
    """Check if a model file exists on the ComfyUI machine.

    Returns True if the file is found.
    """
    host = config["comfyui"]["host"]
    port = config["comfyui"]["port"]
    subdir = COMFYUI_MODEL_DIRS.get(model_type, "models/loras")

    # Query ComfyUI API for object_info to check available models
    # Alternatively, just check file existence via SSH
    user = config.get("comfyui", {}).get("ssh_user", "michia")
    result = subprocess.run(
        ["ssh", f"{user}@{host}", f"ls ComfyUI/{subdir}/{filename} 2>/dev/null && echo found"],
        capture_output=True, text=True, timeout=10
    )
    return "found" in result.stdout
```

Also add the `setup` subcommand to `main()`:

```python
    setup_parser = subparsers.add_parser("setup", help="Download selected models to ComfyUI")
    setup_parser.add_argument("--model-ids", nargs="+", type=int, required=True,
                             help="CivitAI model IDs to download")
```

And the handler:

```python
    elif args.command == "setup":
        config = load_generation_config(CONFIG_PATH)
        client = CivitAIClient(rate_limit_ms=500)
        for model_id in args.model_ids:
            details = client.get_model(model_id)
            if details.get("modelVersions"):
                latest = details["modelVersions"][0]
                files = latest.get("files", [])
                if files:
                    dl_url = files[0].get("downloadUrl", "")
                    filename = files[0].get("name", f"model_{model_id}.safetensors")
                    model_type = details.get("type", "LORA")
                    download_model_to_comfyui(dl_url, filename, model_type, config)
                    if verify_model_available(filename, model_type, config):
                        print(f"  Verified: {filename} is available on ComfyUI")
                    else:
                        print(f"  WARNING: {filename} not found after download")
```

**Step 4: Run tests to verify they pass**

```bash
cd scripts && python -m pytest test_civitai_research.py -v
```

Expected: All tests PASS

**Step 5: Commit**

```bash
git add scripts/civitai_research.py scripts/test_civitai_research.py
git commit -m "feat: add model setup phase - SSH download to ComfyUI"
```

---

## Task 5: Batch Generation Phase (ComfyUI Comparison)

**Files:**
- Modify: `scripts/civitai_research.py` (add `generate` subcommand)
- Test: `scripts/test_civitai_research.py` (add generation tests)

**Step 1: Write the failing test**

Add to `scripts/test_civitai_research.py`:

```python
class TestBatchGeneration(unittest.TestCase):

    def test_build_comparison_workflow_uses_new_checkpoint(self):
        from civitai_research import build_comparison_workflow

        workflow = build_comparison_workflow(
            prompt="anime character, full body",
            negative="bad quality",
            checkpoint="newModel.safetensors",
            loras=[],
            resolution=[1024, 1024],
            sampler="dpmpp_2m",
            scheduler="karras",
            steps=30,
            cfg=7.5,
            seed=42,
            output_prefix="test/comparison",
            use_rmbg=True,
        )
        assert workflow["1"]["inputs"]["ckpt_name"] == "newModel.safetensors"
        assert workflow["5"]["inputs"]["seed"] == 42
        assert workflow["5"]["inputs"]["steps"] == 30

    def test_build_comparison_workflow_with_lora(self):
        from civitai_research import build_comparison_workflow

        workflow = build_comparison_workflow(
            prompt="anime character",
            negative="bad",
            checkpoint="base.safetensors",
            loras=[{"name": "style_lora.safetensors", "strength": 0.8}],
            resolution=[1024, 1024],
            sampler="dpmpp_2m",
            scheduler="karras",
            steps=30,
            cfg=7.5,
            seed=42,
            output_prefix="test/lora",
            use_rmbg=True,
        )
        # Should have a LoraLoader node
        lora_nodes = [k for k, v in workflow.items() if v["class_type"] == "LoraLoader"]
        assert len(lora_nodes) == 1
        lora_node = workflow[lora_nodes[0]]
        assert lora_node["inputs"]["lora_name"] == "style_lora.safetensors"
        assert lora_node["inputs"]["strength_model"] == 0.8

    def test_generate_comparison_batch_creates_multiple_seeds(self):
        from civitai_research import generate_comparison_batch

        with patch("civitai_research.queue_prompt") as mock_queue, \
             patch("civitai_research.wait_for_completion") as mock_wait:
            mock_queue.return_value = "prompt-123"
            mock_wait.return_value = True

            results = generate_comparison_batch(
                category="enemies",
                checkpoint="test.safetensors",
                loras=[],
                config={"comfyui": {"host": "192.168.1.222", "port": 8188},
                        "categories": {"enemies": {
                            "style_prompt": "anime",
                            "negative_prompt": "bad",
                            "sampler": "dpmpp_2m",
                            "scheduler": "karras",
                            "steps": 30,
                            "cfg": 7.5,
                            "resolution": [1024, 1024],
                            "post_processing": ["RMBG-2.0"],
                        }}},
                num_samples=5,
            )
            assert mock_queue.call_count == 5
```

**Step 2: Run test to verify it fails**

```bash
cd scripts && python -m pytest test_civitai_research.py::TestBatchGeneration -v
```

Expected: FAIL

**Step 3: Write the implementation**

Add to `scripts/civitai_research.py`:

```python
def build_comparison_workflow(prompt, negative, checkpoint, loras, resolution,
                              sampler, scheduler, steps, cfg, seed, output_prefix,
                              use_rmbg=False):
    """Build a ComfyUI workflow dict for generating a comparison image.

    Same structure as existing generation scripts but parameterized.
    """
    workflow = {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": checkpoint}
        },
    }

    # If LoRAs specified, chain LoraLoader nodes
    model_output = ["1", 0]
    clip_output = ["1", 1]
    next_node_id = 10  # Start LoRA nodes at 10 to avoid conflicts

    for lora in loras:
        node_id = str(next_node_id)
        workflow[node_id] = {
            "class_type": "LoraLoader",
            "inputs": {
                "lora_name": lora["name"],
                "strength_model": lora.get("strength", 0.8),
                "strength_clip": lora.get("strength", 0.8),
                "model": model_output,
                "clip": clip_output,
            }
        }
        model_output = [node_id, 0]
        clip_output = [node_id, 1]
        next_node_id += 1

    workflow["2"] = {
        "class_type": "CLIPTextEncode",
        "inputs": {"text": prompt, "clip": clip_output}
    }
    workflow["3"] = {
        "class_type": "CLIPTextEncode",
        "inputs": {"text": negative, "clip": clip_output}
    }
    workflow["4"] = {
        "class_type": "EmptyLatentImage",
        "inputs": {"width": resolution[0], "height": resolution[1], "batch_size": 1}
    }
    workflow["5"] = {
        "class_type": "KSampler",
        "inputs": {
            "seed": seed,
            "steps": steps,
            "cfg": cfg,
            "sampler_name": sampler,
            "scheduler": scheduler,
            "denoise": 1.0,
            "model": model_output,
            "positive": ["2", 0],
            "negative": ["3", 0],
            "latent_image": ["4", 0]
        }
    }
    workflow["6"] = {
        "class_type": "VAEDecode",
        "inputs": {"samples": ["5", 0], "vae": ["1", 2]}
    }

    image_output = ["6", 0]

    if use_rmbg:
        workflow["7"] = {
            "class_type": "RMBG",
            "inputs": {
                "image": ["6", 0],
                "model": "RMBG-2.0",
                "sensitivity": 1.0,
                "process_res": 1024,
                "mask_blur": 0,
                "mask_offset": 0,
                "invert_output": False,
                "background": "Alpha"
            }
        }
        image_output = ["7", 0]

    workflow["8"] = {
        "class_type": "SaveImage",
        "inputs": {
            "images": image_output,
            "filename_prefix": output_prefix
        }
    }

    return workflow


def queue_prompt(workflow, comfyui_host, comfyui_port):
    """Queue a workflow on the ComfyUI machine. Returns prompt_id."""
    url = f"http://{comfyui_host}:{comfyui_port}/prompt"
    data = json.dumps({"prompt": workflow}).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
            return result.get("prompt_id", "")
    except Exception as e:
        print(f"  Error queueing: {e}")
        return ""


def wait_for_completion(prompt_id, comfyui_host, comfyui_port, timeout=180):
    """Wait for a ComfyUI prompt to complete. Returns True on success."""
    url = f"http://{comfyui_host}:{comfyui_port}/history/{prompt_id}"
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=10) as response:
                history = json.loads(response.read().decode("utf-8"))
                if prompt_id in history:
                    status = history[prompt_id].get("status", {})
                    if status.get("status_str") == "error":
                        return False
                    if history[prompt_id].get("outputs"):
                        return True
        except Exception:
            pass
        time.sleep(2)
    return False


def generate_comparison_batch(category, checkpoint, loras, config, num_samples=10):
    """Generate a batch of sample images with a new model/LoRA combo.

    Uses the category's style/negative prompts from config but swaps the checkpoint/loras.
    Generates num_samples images with different seeds for variety.
    """
    cat_config = config["categories"][category]
    host = config["comfyui"]["host"]
    port = config["comfyui"]["port"]
    use_rmbg = "RMBG-2.0" in cat_config.get("post_processing", [])

    results = []
    for i in range(num_samples):
        seed = random.randint(1, 999999999)
        prefix = f"research/{category}/{checkpoint.replace('.safetensors', '')}/{i}"

        workflow = build_comparison_workflow(
            prompt=cat_config["style_prompt"],
            negative=cat_config["negative_prompt"],
            checkpoint=checkpoint,
            loras=loras,
            resolution=cat_config["resolution"],
            sampler=cat_config["sampler"],
            scheduler=cat_config["scheduler"],
            steps=cat_config["steps"],
            cfg=cat_config["cfg"],
            seed=seed,
            output_prefix=prefix,
            use_rmbg=use_rmbg,
        )

        prompt_id = queue_prompt(workflow, host, port)
        if prompt_id:
            success = wait_for_completion(prompt_id, host, port)
            results.append({"seed": seed, "success": success, "prompt_id": prompt_id})
            print(f"  [{i+1}/{num_samples}] {'OK' if success else 'FAILED'} (seed={seed})")
        else:
            results.append({"seed": seed, "success": False, "prompt_id": ""})
            print(f"  [{i+1}/{num_samples}] QUEUE ERROR")

        time.sleep(0.5)

    return results
```

Also add `import random` to the imports and the `generate` subcommand:

```python
    gen_parser = subparsers.add_parser("generate", help="Generate comparison batch")
    gen_parser.add_argument("--category", required=True, choices=["enemies", "chips", "backgrounds"])
    gen_parser.add_argument("--checkpoint", required=True, help="Checkpoint filename to test")
    gen_parser.add_argument("--loras", nargs="*", default=[], help="LoRA filenames (name:strength)")
    gen_parser.add_argument("--num-samples", type=int, default=10)
```

And the handler:

```python
    elif args.command == "generate":
        config = load_generation_config(CONFIG_PATH)
        loras = []
        for l in args.loras:
            parts = l.split(":")
            loras.append({"name": parts[0], "strength": float(parts[1]) if len(parts) > 1 else 0.8})
        generate_comparison_batch(args.category, args.checkpoint, loras, config, args.num_samples)
```

**Step 4: Run tests to verify they pass**

```bash
cd scripts && python -m pytest test_civitai_research.py -v
```

Expected: All tests PASS

**Step 5: Commit**

```bash
git add scripts/civitai_research.py scripts/test_civitai_research.py
git commit -m "feat: add batch generation phase - ComfyUI comparison workflows"
```

---

## Task 6: Config Update Phase (Apply Approved Settings)

**Files:**
- Modify: `scripts/civitai_research.py` (add `apply` subcommand)
- Modify: `docs/art-style.md` (updated by the tool)
- Modify: `config/generation-config.json` (updated by the tool)
- Test: `scripts/test_civitai_research.py`

**Step 1: Write the failing test**

Add to `scripts/test_civitai_research.py`:

```python
class TestConfigUpdate(unittest.TestCase):

    def test_update_generation_config_changes_checkpoint(self):
        from civitai_research import update_generation_config

        original = {
            "comfyui": {"host": "192.168.1.222"},
            "categories": {
                "enemies": {"checkpoint": "old.safetensors", "loras": [], "steps": 30}
            }
        }
        updates = {"enemies": {"checkpoint": "new.safetensors", "cfg": 8.0}}

        result = update_generation_config(original, updates)
        assert result["categories"]["enemies"]["checkpoint"] == "new.safetensors"
        assert result["categories"]["enemies"]["cfg"] == 8.0
        assert result["categories"]["enemies"]["steps"] == 30  # unchanged

    def test_update_art_style_appends_lesson(self):
        from civitai_research import append_art_style_lesson

        original = "## Lessons Learned\n\n1. First lesson\n"
        result = append_art_style_lesson(original, "New models need lower CFG")
        assert "New models need lower CFG" in result
        assert "First lesson" in result

    def test_update_generation_config_adds_lora(self):
        from civitai_research import update_generation_config

        original = {
            "comfyui": {},
            "categories": {"chips": {"checkpoint": "base.safetensors", "loras": []}}
        }
        updates = {"chips": {"loras": [{"name": "chibi.safetensors", "strength": 0.7}]}}

        result = update_generation_config(original, updates)
        assert len(result["categories"]["chips"]["loras"]) == 1
        assert result["categories"]["chips"]["loras"][0]["name"] == "chibi.safetensors"
```

**Step 2: Run test to verify it fails**

```bash
cd scripts && python -m pytest test_civitai_research.py::TestConfigUpdate -v
```

Expected: FAIL

**Step 3: Write the implementation**

Add to `scripts/civitai_research.py`:

```python
def update_generation_config(config, category_updates):
    """Apply approved changes to the generation config.

    Args:
        config: Current config dict
        category_updates: Dict mapping category name -> dict of fields to update

    Returns:
        Updated config dict (does not write to disk)
    """
    for category, updates in category_updates.items():
        if category in config["categories"]:
            config["categories"][category].update(updates)
    return config


def append_art_style_lesson(content, lesson):
    """Append a new lesson to the art style doc's Lessons Learned section.

    Args:
        content: Current file content as string
        lesson: New lesson text to append

    Returns:
        Updated content string
    """
    lines = content.split("\n")
    # Find the last numbered lesson
    last_lesson_idx = -1
    last_lesson_num = 0
    for i, line in enumerate(lines):
        match = re.match(r"^(\d+)\.", line)
        if match:
            last_lesson_idx = i
            last_lesson_num = int(match.group(1))

    if last_lesson_idx >= 0:
        new_line = f"{last_lesson_num + 1}. {lesson}"
        lines.insert(last_lesson_idx + 1, new_line)
    else:
        # No lessons yet, append after "## Lessons Learned"
        for i, line in enumerate(lines):
            if "Lessons Learned" in line:
                lines.insert(i + 2, f"1. {lesson}")
                break

    return "\n".join(lines)


def save_generation_config(config, path=CONFIG_PATH):
    """Write generation config to disk."""
    with open(path, "w") as f:
        json.dump(config, f, indent=2)
    print(f"  Updated: {path}")


def save_art_style_lesson(lesson, path=ART_STYLE_PATH):
    """Add a lesson to the art style doc on disk."""
    with open(path, "r") as f:
        content = f.read()
    updated = append_art_style_lesson(content, lesson)
    with open(path, "w") as f:
        f.write(updated)
    print(f"  Updated: {path}")
```

Add `apply` subcommand to `main()`:

```python
    apply_parser = subparsers.add_parser("apply", help="Apply approved settings to config")
    apply_parser.add_argument("--category", required=True, choices=["enemies", "chips", "backgrounds"])
    apply_parser.add_argument("--checkpoint", help="New checkpoint filename")
    apply_parser.add_argument("--loras", nargs="*", default=None, help="LoRA filenames (name:strength)")
    apply_parser.add_argument("--cfg", type=float, help="New CFG value")
    apply_parser.add_argument("--steps", type=int, help="New steps value")
    apply_parser.add_argument("--lesson", help="Lesson to add to art-style.md")
```

And handler:

```python
    elif args.command == "apply":
        config = load_generation_config(CONFIG_PATH)
        updates = {}
        if args.checkpoint:
            updates["checkpoint"] = args.checkpoint
        if args.loras is not None:
            loras = []
            for l in args.loras:
                parts = l.split(":")
                loras.append({"name": parts[0], "strength": float(parts[1]) if len(parts) > 1 else 0.8})
            updates["loras"] = loras
        if args.cfg:
            updates["cfg"] = args.cfg
        if args.steps:
            updates["steps"] = args.steps

        if updates:
            config = update_generation_config(config, {args.category: updates})
            save_generation_config(config)
        if args.lesson:
            save_art_style_lesson(args.lesson)
```

**Step 4: Run tests to verify they pass**

```bash
cd scripts && python -m pytest test_civitai_research.py -v
```

Expected: All tests PASS

**Step 5: Commit**

```bash
git add scripts/civitai_research.py scripts/test_civitai_research.py
git commit -m "feat: add config update phase - apply approved settings"
```

---

## Task 7: Full Regeneration Phase (Config-Driven Generation)

**Files:**
- Create: `scripts/regenerate_all.py`
- Read: `config/generation-config.json`, `data/chips.json`, enemy descriptions
- Test: `scripts/test_regenerate_all.py`

**Step 1: Write the failing test**

Create `scripts/test_regenerate_all.py`:

```python
#!/usr/bin/env python3
"""Tests for config-driven full asset regeneration."""

import unittest
from unittest.mock import patch, MagicMock
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from regenerate_all import (
    load_enemy_descriptions,
    load_chip_descriptions,
    build_workflow_from_config,
)


class TestRegeneration(unittest.TestCase):

    def test_load_enemy_descriptions_from_script(self):
        descriptions = load_enemy_descriptions()
        assert "angryCitizen" in descriptions
        assert isinstance(descriptions["angryCitizen"], str)
        assert len(descriptions) > 40  # We have ~45 enemies

    def test_load_chip_descriptions_from_data(self):
        descriptions = load_chip_descriptions()
        assert isinstance(descriptions, dict)
        assert len(descriptions) > 0

    def test_build_workflow_uses_config_settings(self):
        config_category = {
            "checkpoint": "newModel.safetensors",
            "loras": [{"name": "style.safetensors", "strength": 0.7}],
            "style_prompt": "anime style",
            "negative_prompt": "bad quality",
            "sampler": "euler_a",
            "scheduler": "normal",
            "steps": 25,
            "cfg": 6.0,
            "resolution": [1024, 1024],
            "post_processing": ["RMBG-2.0"],
        }
        workflow = build_workflow_from_config(
            subject_prompt="a brave warrior",
            config_category=config_category,
            output_prefix="enemies/test",
            seed=12345,
        )
        assert workflow["1"]["inputs"]["ckpt_name"] == "newModel.safetensors"
        assert workflow["5"]["inputs"]["sampler_name"] == "euler_a"
        assert workflow["5"]["inputs"]["cfg"] == 6.0
        assert workflow["5"]["inputs"]["steps"] == 25
        assert "anime style" in workflow["2"]["inputs"]["text"]
        assert "a brave warrior" in workflow["2"]["inputs"]["text"]


if __name__ == "__main__":
    unittest.main()
```

**Step 2: Run test to verify it fails**

```bash
cd scripts && python -m pytest test_regenerate_all.py -v
```

Expected: FAIL with `ModuleNotFoundError`

**Step 3: Write the implementation**

Create `scripts/regenerate_all.py`:

```python
#!/usr/bin/env python3
"""
Config-driven full asset regeneration.

Reads generation-config.json and regenerates all game assets using the
approved model/prompt/sampler settings. Replaces existing files in-place.

Usage:
    python regenerate_all.py enemies     # Regenerate all enemy sprites
    python regenerate_all.py chips       # Regenerate all chip icons
    python regenerate_all.py backgrounds # Regenerate all backgrounds
    python regenerate_all.py all         # Regenerate everything
"""

import argparse
import json
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

from civitai_research import (
    load_generation_config,
    build_comparison_workflow,
    queue_prompt,
    wait_for_completion,
    CONFIG_PATH,
    PROJECT_ROOT,
)

# Import enemy descriptions from v2 script
from generate_enemies_v2 import ENEMY_DESCRIPTIONS


def load_enemy_descriptions():
    """Load enemy prompt descriptions. Returns dict of id -> description."""
    return dict(ENEMY_DESCRIPTIONS)


def load_chip_descriptions():
    """Load chip descriptions from data/chips.json.

    Reads chip data and generates prompt descriptions from name/description fields.
    """
    chips_path = os.path.join(PROJECT_ROOT, "data", "chips.json")
    with open(chips_path, "r") as f:
        chips_data = json.load(f)

    descriptions = {}
    for chip in chips_data:
        chip_id = chip.get("id", "")
        name_en = chip.get("nameEn", chip.get("name", ""))
        desc = chip.get("description", "")
        # Build a chibi creature prompt from the chip's identity
        descriptions[chip_id] = (
            f"a cute chibi {name_en.lower()} robot creature, "
            f"its entire body IS a {name_en.lower()}, "
            f"big cute eyes, tiny stubby arms and legs, "
            f"bright vivid colors, kawaii"
        )
    return descriptions


def build_workflow_from_config(subject_prompt, config_category, output_prefix, seed=None):
    """Build a ComfyUI workflow using settings from generation-config.json.

    Combines the category's style_prompt with the subject-specific prompt.
    """
    if seed is None:
        seed = random.randint(1, 999999999)

    full_prompt = f"{config_category['style_prompt']}, {subject_prompt}"
    use_rmbg = "RMBG-2.0" in config_category.get("post_processing", [])

    loras = config_category.get("loras", [])

    return build_comparison_workflow(
        prompt=full_prompt,
        negative=config_category["negative_prompt"],
        checkpoint=config_category["checkpoint"],
        loras=loras,
        resolution=config_category["resolution"],
        sampler=config_category["sampler"],
        scheduler=config_category["scheduler"],
        steps=config_category["steps"],
        cfg=config_category["cfg"],
        seed=seed,
        output_prefix=output_prefix,
        use_rmbg=use_rmbg,
    )


def regenerate_category(category, config):
    """Regenerate all assets for a category using current config."""
    cat_config = config["categories"][category]
    host = config["comfyui"]["host"]
    port = config["comfyui"]["port"]

    if category == "enemies":
        descriptions = load_enemy_descriptions()
        output_dir = "enemy_sprites_regen"
    elif category == "chips":
        descriptions = load_chip_descriptions()
        output_dir = "chip_sprites_regen"
    elif category == "backgrounds":
        # Backgrounds use floor/location descriptions from existing scripts
        print("Background regeneration uses generate_floor_backgrounds.py patterns")
        print("Not yet integrated into config-driven flow.")
        return
    else:
        print(f"Unknown category: {category}")
        return

    total = len(descriptions)
    print(f"\n{'='*60}")
    print(f"REGENERATING {total} {category.upper()}")
    print(f"Checkpoint: {cat_config['checkpoint']}")
    print(f"LoRAs: {[l['name'] for l in cat_config.get('loras', [])] or 'none'}")
    print(f"{'='*60}")

    success = 0
    failed = []

    for i, (asset_id, desc) in enumerate(descriptions.items(), 1):
        print(f"\n[{i}/{total}] {asset_id}")
        workflow = build_workflow_from_config(
            subject_prompt=desc,
            config_category=cat_config,
            output_prefix=f"{output_dir}/{asset_id}",
        )
        prompt_id = queue_prompt(workflow, host, port)
        if prompt_id and wait_for_completion(prompt_id, host, port):
            success += 1
            print(f"  [OK]")
        else:
            failed.append(asset_id)
            print(f"  [FAILED]")
        time.sleep(0.5)

    print(f"\n{'='*60}")
    print(f"COMPLETE: {success}/{total} {category} regenerated")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print(f"{'='*60}")


def main():
    parser = argparse.ArgumentParser(description="Regenerate game assets from config")
    parser.add_argument("category", choices=["enemies", "chips", "backgrounds", "all"],
                       help="Which category to regenerate")
    args = parser.parse_args()

    config = load_generation_config(CONFIG_PATH)

    if args.category == "all":
        for cat in ["enemies", "chips", "backgrounds"]:
            regenerate_category(cat, config)
    else:
        regenerate_category(args.category, config)


if __name__ == "__main__":
    main()
```

**Step 4: Run tests to verify they pass**

```bash
cd scripts && python -m pytest test_regenerate_all.py -v
```

Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add scripts/regenerate_all.py scripts/test_regenerate_all.py
git commit -m "feat: add config-driven full asset regeneration script"
```

---

## Task 8: Add .gitignore for Temp Files and Final Integration

**Files:**
- Modify: `.gitignore` (add tmp/ directory)
- Create: `tmp/.gitkeep`

**Step 1: Update .gitignore**

Add to `.gitignore`:

```
# CivitAI research samples (large image files)
tmp/civitai-samples/
```

**Step 2: Create tmp directory placeholder**

```bash
mkdir -p tmp && touch tmp/.gitkeep
```

**Step 3: Verify the full tool works end-to-end (dry run)**

```bash
cd scripts && python civitai_research.py --help
python civitai_research.py discover --help
python civitai_research.py setup --help
python civitai_research.py generate --help
python civitai_research.py apply --help
```

Expected: Each subcommand shows its help text without errors.

**Step 4: Run all tests**

```bash
cd scripts && python -m pytest test_civitai_client.py test_civitai_research.py test_regenerate_all.py -v
```

Expected: All tests PASS

**Step 5: Commit**

```bash
git add .gitignore tmp/.gitkeep
git commit -m "chore: add gitignore for research samples, tmp directory"
```

---

## Task 9: Final Commit and Summary

**Step 1: Run all tests one final time**

```bash
cd scripts && python -m pytest test_civitai_client.py test_civitai_research.py test_regenerate_all.py -v
```

**Step 2: Verify no leftover uncommitted changes**

```bash
git status
```

**Step 3: Tag the milestone**

```bash
git tag -a v0.1-civitai-research -m "CivitAI art research tool - discovery, setup, generation, and config update phases"
```

---

## Usage Summary

After implementation, the full workflow is:

```bash
# Phase 1: Discover new models on CivitAI
python scripts/civitai_research.py discover

# Phase 2: Human reviews report (Claude shows images inline)
# Read: docs/plans/YYYY-MM-DD-civitai-research-report.md

# Phase 3: Download approved models to ComfyUI machine
python scripts/civitai_research.py setup --model-ids 12345 67890

# Phase 4: Generate comparison batches
python scripts/civitai_research.py generate --category enemies --checkpoint newModel.safetensors --num-samples 10

# Phase 5: Human selects best results, applies settings
python scripts/civitai_research.py apply --category enemies --checkpoint newModel.safetensors --loras style.safetensors:0.7 --lesson "New model works better at CFG 6.0"

# Phase 6: Full regeneration with approved config
python scripts/regenerate_all.py enemies
```
