#!/usr/bin/env node

/**
 * Remove backgrounds from creature sprites using BiRefNet on ComfyUI.
 * Uploads each PNG, runs BiRefNet bg removal, downloads result.
 */

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import http from 'node:http';

const COMFYUI = 'http://127.0.0.1:8188';
const INPUT_DIR = 'tmp/creature-sprites/selected';
const OUTPUT_DIR = 'tmp/creature-sprites/nobg';

// ---------------------------------------------------------------------------
// ComfyUI helpers
// ---------------------------------------------------------------------------

function httpRequest(url, options = {}) {
  return new Promise((resolve_, reject) => {
    const req = http.request(url, options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${body.toString().slice(0, 200)}`));
        } else {
          resolve_({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function uploadImage(filePath) {
  const fileData = await readFile(filePath);
  const filename = basename(filePath);
  const boundary = '----FormBoundary' + Date.now();

  let body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`),
    fileData,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const res = await httpRequest(`${COMFYUI}/upload/image`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
    },
    body,
  });

  const result = JSON.parse(res.body.toString());
  return result.name; // uploaded filename
}

function buildWorkflow(inputFilename) {
  return {
    "1": {
      "class_type": "LoadImage",
      "inputs": { "image": inputFilename }
    },
    "2": {
      "class_type": "BiRefNetRMBG",
      "inputs": {
        "image": ["1", 0],
        "model": "BiRefNet-general",
        "mask_blur": 0,
        "mask_offset": 0,
        "invert_output": false,
        "refine_foreground": true,
        "background": "Alpha"
      }
    },
    "3": {
      "class_type": "SaveImage",
      "inputs": {
        "images": ["2", 0],
        "filename_prefix": "nobg"
      }
    }
  };
}

async function queueAndWait(workflow) {
  // Queue the prompt
  const promptBody = JSON.stringify({ prompt: workflow });
  const res = await httpRequest(`${COMFYUI}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(promptBody) },
    body: promptBody,
  });

  const { prompt_id } = JSON.parse(res.body.toString());

  // Poll history until complete
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const histRes = await httpRequest(`${COMFYUI}/history/${prompt_id}`);
    const hist = JSON.parse(histRes.body.toString());

    if (hist[prompt_id]) {
      const status = hist[prompt_id].status;
      if (status?.completed) {
        // Find output image
        const outputs = hist[prompt_id].outputs;
        for (const nodeId of Object.keys(outputs)) {
          const images = outputs[nodeId]?.images;
          if (images?.length > 0) {
            return images[0]; // { filename, subfolder, type }
          }
        }
        throw new Error('No output images found');
      }
      if (status?.status_str === 'error') {
        throw new Error('Workflow execution failed');
      }
    }
  }
  throw new Error('Timeout waiting for result');
}

async function downloadImage(imageInfo) {
  const params = new URLSearchParams({
    filename: imageInfo.filename,
    subfolder: imageInfo.subfolder || '',
    type: imageInfo.type || 'output',
  });
  const res = await httpRequest(`${COMFYUI}/view?${params}`);
  return res.body;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const files = (await readdir(INPUT_DIR)).filter(f => f.endsWith('.png')).sort();
  console.log(`Processing ${files.length} sprites through BiRefNet...\n`);

  for (const file of files) {
    const id = file.replace('.png', '');
    process.stdout.write(`${id}: uploading... `);

    try {
      // Upload
      const uploadedName = await uploadImage(resolve(INPUT_DIR, file));
      process.stdout.write('queuing... ');

      // Build and queue workflow
      const workflow = buildWorkflow(uploadedName);
      const outputInfo = await queueAndWait(workflow);
      process.stdout.write('downloading... ');

      // Download result
      const imageData = await downloadImage(outputInfo);
      const outPath = resolve(OUTPUT_DIR, `${id}.png`);
      await writeFile(outPath, imageData);

      console.log(`done (${imageData.length} bytes)`);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }

    // Brief pause between jobs
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\nAll done.');
}

main();
