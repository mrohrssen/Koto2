# Image Optimization Design

## Problem

Background images, enemy sprites, and icons are large PNGs (1.7-2.5 MB each). On mobile networks, this causes 5-10 second delays per room transition.

## Solution

Build-time script to convert all PNGs to WebP format, reducing file sizes by ~90%.

## Scope

| Directory | Current Size | Purpose |
|-----------|--------------|---------|
| `public/assets/backgrounds/` | ~172 MB | Floor/room backgrounds |
| `public/assets/enemies/` | ~39 MB | Enemy sprites |
| `public/assets/icons/` | ~11 MB | UI icons, chips |

## Implementation

### 1. Optimization Script

**Location:** `scripts/optimize-images.js`

**Behavior:**
- Recursively scan `public/assets/` for PNG files
- Convert each to WebP at quality 80
- Output as `filename.webp` alongside original
- Skip files where WebP already exists and is newer than PNG
- Print summary: files converted, bytes saved

**NPM script:** `npm run optimize-images`

**Dependency:** `sharp` (add to devDependencies)

### 2. Codebase Updates

- Find-and-replace `.png` → `.webp` for all asset paths in JS/CSS/HTML
- Update `.gitignore` to exclude original PNGs from version control
- Commit only the WebP files

### 3. Gitignore Changes

```gitignore
# Original PNGs (keep locally for regeneration, don't commit)
public/assets/**/*.png
```

## Expected Results

| Metric | Before | After |
|--------|--------|-------|
| Background image size | ~2 MB | ~150-200 KB |
| Room load time (3G) | 5-10s | <1s |
| Total assets size | ~220 MB | ~25-30 MB |

## Future Considerations

- Could add AVIF format for even smaller files (less browser support)
- Could generate multiple sizes for responsive images
- Could lazy-load off-screen backgrounds
