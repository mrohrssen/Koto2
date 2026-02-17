# Nexus Anima LoRA Training — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Train an SDXL LoRA on ~65 Honkai: Nexus Anima creature portraits so Nova v16 can generate creatures in that style locally.

**Architecture:** Scrape images + captions from the Fandom wiki, install kohya_ss sd-scripts on the Windows gaming PC (192.168.1.222), train a LoRA on top of `novaAnimeXL_ilV160.safetensors`, drop the result into ComfyUI's loras folder.

**Tech Stack:** Python 3.10, kohya_ss sd-scripts, PyTorch 2.5 + CUDA 12.1, ComfyUI, RTX 3090 (24GB)

**Remote machine details:**
- SSH: `ssh -i ~/.ssh/id_ed25519_remote_pc michia@192.168.1.222`
- OS: Windows
- User dir: `C:\Users\michi`
- ComfyUI: `C:\Users\michi\ComfyUI` (venv at `ComfyUI\venv\Scripts\python.exe`, torch 2.5.1+cu121)
- Checkpoints: `C:\Users\michi\ComfyUI\models\checkpoints\novaAnimeXL_ilV160.safetensors`
- Loras dir: `C:\Users\michi\ComfyUI\models\loras\`
- System Python: `C:\Users\michi\AppData\Local\Programs\Python\Python310\python.exe`
- Git: available (`C:\Program Files\Git\cmd\git.exe`)

---

### Task 1: Scrape Creature List from Wiki

**Files:**
- Create: `scripts/scrape-anima-training-data.py`

**Step 1: Write the scraper script**

The script visits `https://honkai-nexus-anima.fandom.com/wiki/Anima`, extracts all creature page links, then visits each page to download the portrait image and save the description as a caption.

```python
#!/usr/bin/env python3
"""
Scrape Honkai: Nexus Anima creature portraits + descriptions from Fandom wiki.
Downloads full-res PNGs and creates caption .txt files for LoRA training.

Usage:
  python scripts/scrape-anima-training-data.py
  python scripts/scrape-anima-training-data.py --output-dir /path/to/dataset
  python scripts/scrape-anima-training-data.py --dry-run
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.request
import urllib.parse
from html.parser import HTMLParser

WIKI_BASE = "https://honkai-nexus-anima.fandom.com"
ANIMA_LIST_URL = f"{WIKI_BASE}/wiki/Anima"
DEFAULT_OUTPUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "anima-training-data")
TRIGGER_WORD = "nexus_anima"

# Fandom CDN URL pattern for images
# Full-res: /revision/latest without scale-to-width-down
FANDOM_IMAGE_RE = re.compile(r'(https://static\.wikia\.nocookie\.net/honkai-nexus-anima/images/[^"]+_Portrait\.png)/revision/latest')


def fetch_page(url):
    """Fetch a page and return its HTML content."""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; LoRA-scraper/1.0)"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8")


class AnimalLinkParser(HTMLParser):
    """Extract creature page links from the Anima list page."""
    def __init__(self):
        super().__init__()
        self.links = []
        self.in_table = False

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == "a" and "href" in attrs_dict:
            href = attrs_dict["href"]
            # Creature links are /wiki/CreatureName (not /wiki/Anima or special pages)
            if href.startswith("/wiki/") and ":" not in href and href != "/wiki/Anima":
                title = attrs_dict.get("title", "")
                if title and title not in [a[1] for a in self.links]:
                    self.links.append((href, title))


class CreaturePageParser(HTMLParser):
    """Extract portrait image URL and description from a creature page."""
    def __init__(self):
        super().__init__()
        self.portrait_url = None
        self.in_aside = False
        self.description_parts = []
        self.in_description = False
        self.current_tag = None
        self.capture_text = False
        # Track data-source attributes for description paragraphs
        self._found_first_p_after_aside = False
        self._aside_done = False
        self._p_count = 0

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        self.current_tag = tag

        if tag == "aside":
            self.in_aside = True

        # Look for portrait image in the aside/infobox
        if tag == "img" and "src" in attrs_dict:
            src = attrs_dict["src"]
            if "Portrait" in src and "static.wikia.nocookie.net" in src:
                # Strip any scale-to-width-down parameter to get full res
                clean = re.sub(r'/scale-to-width-down/\d+', '', src)
                # Ensure we have /revision/latest
                if '/revision/latest' not in clean:
                    clean = re.sub(r'(/images/[^?]+)', r'\1/revision/latest', clean)
                self.portrait_url = clean

        # Capture first few paragraphs after the infobox as description
        if tag == "p" and self._aside_done and self._p_count < 3:
            self.capture_text = True

    def handle_endtag(self, tag):
        if tag == "aside":
            self.in_aside = False
            self._aside_done = True
        if tag == "p" and self.capture_text:
            self.capture_text = False
            self._p_count += 1

    def handle_data(self, data):
        if self.capture_text:
            self.description_parts.append(data.strip())


def get_creature_links():
    """Get all creature page links from the Anima list page."""
    html = fetch_page(ANIMA_LIST_URL)
    parser = AnimalLinkParser()
    parser.feed(html)

    # Filter to likely creature pages (exclude navigation/meta pages)
    skip = {"Anima", "Category", "Main Page", "Aspect", "Trait"}
    links = [(href, title) for href, title in parser.links
             if not any(s in title for s in skip)]

    # Deduplicate by href
    seen = set()
    unique = []
    for href, title in links:
        if href not in seen:
            seen.add(href)
            unique.append((href, title))

    return unique


def scrape_creature(href, name):
    """Scrape a single creature page for portrait + description."""
    url = f"{WIKI_BASE}{href}"
    try:
        html = fetch_page(url)
    except Exception as e:
        return None, None, str(e)

    parser = CreaturePageParser()
    parser.feed(html)

    description = " ".join(parser.description_parts).strip()
    return parser.portrait_url, description, None


def download_image(url, output_path):
    """Download an image to the given path."""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; LoRA-scraper/1.0)"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    with open(output_path, "wb") as f:
        f.write(data)
    return len(data)


def main():
    parser = argparse.ArgumentParser(description="Scrape Nexus Anima training data")
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT, help="Output directory for dataset")
    parser.add_argument("--dry-run", action="store_true", help="Preview without downloading")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay between requests (seconds)")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    print("Fetching creature list from wiki...")
    creatures = get_creature_links()
    print(f"Found {len(creatures)} creature pages")

    if args.dry_run:
        for href, name in creatures:
            print(f"  {name}: {WIKI_BASE}{href}")
        return

    results = {"success": 0, "failed": 0, "no_image": 0}
    manifest = []

    for i, (href, name) in enumerate(creatures):
        print(f"[{i+1}/{len(creatures)}] {name}...", end=" ", flush=True)

        portrait_url, description, error = scrape_creature(href, name)

        if error:
            print(f"ERROR: {error}")
            results["failed"] += 1
            continue

        if not portrait_url:
            print("no portrait found")
            results["no_image"] += 1
            continue

        # Download image
        safe_name = re.sub(r'[^\w\-]', '_', name)
        img_path = os.path.join(args.output_dir, f"{safe_name}.png")
        try:
            size = download_image(portrait_url, img_path)
        except Exception as e:
            print(f"download failed: {e}")
            results["failed"] += 1
            continue

        # Write caption
        caption = f"{TRIGGER_WORD}, {description}" if description else TRIGGER_WORD
        txt_path = os.path.join(args.output_dir, f"{safe_name}.txt")
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(caption)

        manifest.append({"name": name, "file": f"{safe_name}.png", "caption_preview": caption[:100]})
        print(f"OK ({size:,} bytes, {len(description)} chars caption)")
        results["success"] += 1

        time.sleep(args.delay)

    # Save manifest
    manifest_path = os.path.join(args.output_dir, "manifest.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"\nDone: {results['success']} downloaded, {results['no_image']} no image, {results['failed']} failed")
    print(f"Dataset: {args.output_dir}")
    print(f"Manifest: {manifest_path}")


if __name__ == "__main__":
    main()
```

**Step 2: Run the scraper (dry-run first)**

```bash
python scripts/scrape-anima-training-data.py --dry-run
```

Expected: List of ~65 creature names and URLs, no downloads.

**Step 3: Run the scraper for real**

```bash
python scripts/scrape-anima-training-data.py --output-dir data/anima-training-data
```

Expected: ~65 PNG files + matching .txt caption files in `data/anima-training-data/`. A `manifest.json` summarizing what was scraped.

**Step 4: Verify the data**

Check a few images visually (serve via HTTP + Playwright), verify captions make sense:
```bash
python3 -m http.server 8787 --directory data/anima-training-data &
# Then browse images in Playwright
```

Verify image count:
```bash
ls data/anima-training-data/*.png | wc -l
```

Expected: 50+ images (some may be missing if wiki pages lack portraits).

**Step 5: Commit**

```bash
git add scripts/scrape-anima-training-data.py
git commit -m "feat: add Nexus Anima wiki scraper for LoRA training data"
```

Note: Don't commit the scraped images themselves (they're third-party assets, ~100MB+). Add to `.gitignore` if needed.

---

### Task 2: Prepare Dataset for Training

**Files:**
- Create: `scripts/prepare-anima-dataset.py`

This script takes the raw scraped data and prepares it for kohya_ss training: resizes images to 1024x1024, organizes into the repeats folder structure, and validates captions.

**Step 1: Write the dataset preparation script**

```python
#!/usr/bin/env python3
"""
Prepare scraped Anima images for kohya_ss LoRA training.

- Resizes/pads images to 1024x1024 (SDXL native)
- Organizes into kohya folder structure with repeats
- Validates caption files exist for every image

Usage:
  python scripts/prepare-anima-dataset.py --input data/anima-training-data --output data/anima-lora-dataset
  python scripts/prepare-anima-dataset.py --input data/anima-training-data --output data/anima-lora-dataset --repeats 5
"""

import argparse
import os
import shutil

try:
    from PIL import Image
except ImportError:
    print("Pillow required: pip install Pillow")
    exit(1)

TARGET_SIZE = 1024
DEFAULT_REPEATS = 5


def resize_and_pad(img_path, output_path, size=TARGET_SIZE):
    """Resize image to fit within size x size, pad with black to make square."""
    img = Image.open(img_path).convert("RGBA")

    # Create white background (better for anime-style art)
    bg = Image.new("RGBA", (size, size), (255, 255, 255, 255))

    # Scale to fit
    ratio = min(size / img.width, size / img.height)
    new_w = int(img.width * ratio)
    new_h = int(img.height * ratio)
    img_resized = img.resize((new_w, new_h), Image.LANCZOS)

    # Center on background
    x = (size - new_w) // 2
    y = (size - new_h) // 2
    bg.paste(img_resized, (x, y), img_resized)

    # Save as RGB PNG (no alpha for training)
    bg.convert("RGB").save(output_path, "PNG")
    return new_w, new_h


def main():
    parser = argparse.ArgumentParser(description="Prepare Anima dataset for LoRA training")
    parser.add_argument("--input", required=True, help="Input directory with scraped images")
    parser.add_argument("--output", required=True, help="Output directory for kohya dataset")
    parser.add_argument("--repeats", type=int, default=DEFAULT_REPEATS, help="Repeats per epoch")
    args = parser.parse_args()

    # kohya folder structure: output/{repeats}_{trigger}/
    trigger = "nexus_anima"
    dataset_dir = os.path.join(args.output, f"{args.repeats}_{trigger}")
    os.makedirs(dataset_dir, exist_ok=True)

    # Find all images
    images = [f for f in os.listdir(args.input) if f.endswith(".png") and f != "manifest.json"]

    processed = 0
    skipped = 0

    for img_file in sorted(images):
        name = os.path.splitext(img_file)[0]
        img_path = os.path.join(args.input, img_file)
        txt_path = os.path.join(args.input, f"{name}.txt")

        if not os.path.exists(txt_path):
            print(f"  SKIP {name}: no caption file")
            skipped += 1
            continue

        # Resize image
        out_img = os.path.join(dataset_dir, img_file)
        w, h = resize_and_pad(img_path, out_img)

        # Copy caption
        out_txt = os.path.join(dataset_dir, f"{name}.txt")
        shutil.copy2(txt_path, out_txt)

        print(f"  {name}: {w}x{h} -> 1024x1024")
        processed += 1

    print(f"\nDataset ready: {processed} images, {skipped} skipped")
    print(f"Folder: {dataset_dir}")
    print(f"Structure: {args.repeats} repeats x {processed} images = {args.repeats * processed} steps/epoch")


if __name__ == "__main__":
    main()
```

**Step 2: Run the preparation**

```bash
python scripts/prepare-anima-dataset.py \
  --input data/anima-training-data \
  --output data/anima-lora-dataset \
  --repeats 5
```

Expected: `data/anima-lora-dataset/5_nexus_anima/` containing 1024x1024 PNGs + matching .txt files.

**Step 3: Verify**

```bash
ls data/anima-lora-dataset/5_nexus_anima/*.png | wc -l
# Should match scraped count

python3 -c "from PIL import Image; img = Image.open('data/anima-lora-dataset/5_nexus_anima/Puddlipup.png'); print(img.size)"
# Should print: (1024, 1024)
```

**Step 4: Commit**

```bash
git add scripts/prepare-anima-dataset.py
git commit -m "feat: add dataset preparation script for Anima LoRA training"
```

---

### Task 3: Upload Dataset to Gaming PC

**Step 1: Create the training directory on the gaming PC**

```bash
ssh -i ~/.ssh/id_ed25519_remote_pc michia@192.168.1.222 \
  "mkdir C:\Users\michi\anima-lora-training && mkdir C:\Users\michi\anima-lora-training\dataset && mkdir C:\Users\michi\anima-lora-training\output"
```

**Step 2: Upload the prepared dataset**

```bash
scp -i ~/.ssh/id_ed25519_remote_pc -r \
  data/anima-lora-dataset/* \
  michia@192.168.1.222:"C:/Users/michi/anima-lora-training/dataset/"
```

**Step 3: Verify upload**

```bash
ssh -i ~/.ssh/id_ed25519_remote_pc michia@192.168.1.222 \
  "dir /b C:\Users\michi\anima-lora-training\dataset\5_nexus_anima\*.png | find /c /v \"\""
```

Expected: Same count as local dataset.

---

### Task 4: Install kohya_ss sd-scripts on Gaming PC

**Step 1: Clone sd-scripts**

```bash
ssh -i ~/.ssh/id_ed25519_remote_pc michia@192.168.1.222 \
  "cd C:\Users\michi\anima-lora-training && git clone https://github.com/kohya-ss/sd-scripts.git"
```

**Step 2: Create Python venv and install dependencies**

```bash
ssh -i ~/.ssh/id_ed25519_remote_pc michia@192.168.1.222 \
  "cd C:\Users\michi\anima-lora-training && python -m venv venv && venv\Scripts\python.exe -m pip install --upgrade pip"
```

**Step 3: Install PyTorch with CUDA 12.1**

```bash
ssh -i ~/.ssh/id_ed25519_remote_pc michia@192.168.1.222 \
  "C:\Users\michi\anima-lora-training\venv\Scripts\python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121"
```

**Step 4: Install sd-scripts requirements**

```bash
ssh -i ~/.ssh/id_ed25519_remote_pc michia@192.168.1.222 \
  "cd C:\Users\michi\anima-lora-training\sd-scripts && ..\venv\Scripts\python.exe -m pip install -r requirements.txt"
```

**Step 5: Install accelerate**

```bash
ssh -i ~/.ssh/id_ed25519_remote_pc michia@192.168.1.222 \
  "C:\Users\michi\anima-lora-training\venv\Scripts\python.exe -m pip install accelerate"
```

**Step 6: Verify installation**

```bash
ssh -i ~/.ssh/id_ed25519_remote_pc michia@192.168.1.222 \
  "C:\Users\michi\anima-lora-training\venv\Scripts\python.exe -c \"import torch; print(f'torch={torch.__version__}, CUDA={torch.cuda.is_available()}'); import accelerate; print(f'accelerate={accelerate.__version__}')\""
```

Expected: torch with CUDA=True, accelerate version printed.

---

### Task 5: Create Training Config

**Files:**
- Create (on gaming PC): `C:\Users\michi\anima-lora-training\train_config.toml`

**Step 1: Write the TOML config via SSH**

```bash
ssh -i ~/.ssh/id_ed25519_remote_pc michia@192.168.1.222 \
  "cd C:\Users\michi\anima-lora-training && (
echo [model]
echo pretrained_model_name_or_path = \"C:/Users/michi/ComfyUI/models/checkpoints/novaAnimeXL_ilV160.safetensors\"
echo.
echo [dataset]
echo train_data_dir = \"C:/Users/michi/anima-lora-training/dataset\"
echo resolution = 1024
echo enable_bucket = true
echo min_bucket_reso = 768
echo max_bucket_reso = 1280
echo bucket_reso_steps = 64
echo.
echo [training]
echo output_dir = \"C:/Users/michi/anima-lora-training/output\"
echo output_name = \"nexus-anima-lora\"
echo save_every_n_epochs = 3
echo max_train_epochs = 12
echo seed = 42
echo gradient_checkpointing = true
echo mixed_precision = \"bf16\"
echo cache_latents = true
echo cache_latents_to_disk = true
echo.
echo [optimizer]
echo optimizer_type = \"AdamW8bit\"
echo learning_rate = 1e-4
echo text_encoder_lr = 5e-5
echo lr_scheduler = \"cosine\"
echo lr_warmup_steps = 50
echo.
echo [network]
echo network_module = \"networks.lora\"
echo network_dim = 32
echo network_alpha = 16
echo.
echo [other]
echo max_data_loader_n_workers = 2
echo train_batch_size = 1
echo clip_skip = 2
) > train_config.toml"
```

Note: The exact config file format may need adjustment based on the sd-scripts version cloned. Check `sd-scripts/README.md` for the current config format and adjust before running.

**Step 2: Verify config was written**

```bash
ssh -i ~/.ssh/id_ed25519_remote_pc michia@192.168.1.222 \
  "type C:\Users\michi\anima-lora-training\train_config.toml"
```

---

### Task 6: Run LoRA Training

**Step 1: Configure accelerate**

```bash
ssh -i ~/.ssh/id_ed25519_remote_pc michia@192.168.1.222 \
  "C:\Users\michi\anima-lora-training\venv\Scripts\accelerate.exe config default"
```

**Step 2: Launch training**

```bash
ssh -i ~/.ssh/id_ed25519_remote_pc michia@192.168.1.222 \
  "cd C:\Users\michi\anima-lora-training\sd-scripts && ..\venv\Scripts\accelerate.exe launch sdxl_train_network.py --config_file ..\train_config.toml"
```

This will take ~30-60 minutes. Monitor progress via the SSH output (loss values, step count).

Note: If the TOML config format doesn't match what sd-scripts expects, fall back to passing all arguments on the command line instead. See the sd-scripts SDXL LoRA training documentation.

**Step 3: Verify output**

```bash
ssh -i ~/.ssh/id_ed25519_remote_pc michia@192.168.1.222 \
  "dir C:\Users\michi\anima-lora-training\output\*.safetensors"
```

Expected: Multiple checkpoint files — `nexus-anima-lora-epoch3.safetensors`, `epoch6`, `epoch9`, `epoch12`.

---

### Task 7: Deploy LoRA to ComfyUI and Test

**Step 1: Copy the final LoRA to ComfyUI's loras directory**

```bash
ssh -i ~/.ssh/id_ed25519_remote_pc michia@192.168.1.222 \
  "copy C:\Users\michi\anima-lora-training\output\nexus-anima-lora.safetensors C:\Users\michi\ComfyUI\models\loras\"
```

Also copy intermediate checkpoints for comparison:
```bash
ssh -i ~/.ssh/id_ed25519_remote_pc michia@192.168.1.222 \
  "copy C:\Users\michi\anima-lora-training\output\nexus-anima-lora-epoch*.safetensors C:\Users\michi\ComfyUI\models\loras\"
```

**Step 2: Restart ComfyUI** (so it picks up new loras)

If ComfyUI is running, it should auto-detect new loras on refresh. Otherwise restart via the bat file.

**Step 3: Test via ComfyUI API**

Generate a test image using an existing bakeoff creature (e.g., kamedor) with and without the LoRA. Use the existing `bakeoff_checkpoints.py` as a reference for building the ComfyUI workflow JSON, but add a LoRA loader node.

Quick manual test via ComfyUI web UI:
1. Open `http://192.168.1.222:8188` in browser
2. Load a basic txt2img workflow with Nova v16
3. Add a LoRA Loader node, select `nexus-anima-lora.safetensors`, strength 0.7
4. Prompt: `nexus_anima, masterpiece, best quality, game-ready creature sprite, single character on solid magenta background, full body, front-facing idle pose, a fierce dragon-like creature with crystal armor and flame effects`
5. Generate and compare with/without LoRA

**Step 4: If results are weak or overfitted**

- Weak: try the epoch 12 checkpoint, or increase rank to 64 and retrain
- Overfitted: use epoch 3 or 6 checkpoint instead
- Adjust LoRA strength (0.3-1.0) to dial in the effect

---

### Task 8: Add --lora Flag to Bakeoff Script

**Files:**
- Modify: `scripts/bakeoff_checkpoints.py`

**Step 1: Read the current bakeoff script to understand the ComfyUI workflow structure**

Read `scripts/bakeoff_checkpoints.py` and identify where the checkpoint loader node is built in the workflow JSON.

**Step 2: Add a --lora CLI argument**

Add `--lora` argument that accepts a LoRA filename. When provided, inject a `LoraLoader` node into the ComfyUI workflow between the checkpoint loader and the KSampler, with a default strength of 0.7.

**Step 3: Add lora_strength argument**

Add `--lora-strength` argument (default 0.7) to control LoRA weight.

**Step 4: Test the modified script**

```bash
python scripts/bakeoff_checkpoints.py kamedor --models nova --lora nexus-anima-lora --lora-strength 0.7
python scripts/bakeoff_checkpoints.py kamedor --models nova  # without lora, for comparison
```

Compare the HTML output pages side by side.

**Step 5: Commit**

```bash
git add scripts/bakeoff_checkpoints.py
git commit -m "feat: add --lora flag to bakeoff script for A/B testing LoRA effects"
```
