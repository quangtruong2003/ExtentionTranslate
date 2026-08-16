// Resizes the source icon (public/icons/source.png) into the three sizes that
// Chrome / Edge expect: 16x16, 48x48, 128x128.
// Uses bilinear interpolation for clean, sharp results.
//
// If `public/icons/source.png` is missing, the script falls back to a solid-color
// placeholder so the build never breaks.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.resolve(__dirname, "..", "public", "icons");
const sourcePath = path.resolve(__dirname, "..", "assets", "source-icon.png");
fs.mkdirSync(iconsDir, { recursive: true });

function makeSolidPng(size, [r, g, b, a]) {
  // Build a 1x1 RGBA image and let PNG handle scaling - actually build a size-sized image.
  const png = new PNG({ width: size, height: size });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = a;
  }
  return PNG.sync.write(png);
}

function bilinearResize(srcPng, targetSize) {
  const dst = new PNG({ width: targetSize, height: targetSize });
  const sw = srcPng.width;
  const sh = srcPng.height;
  const sdata = srcPng.data;
  const ddata = dst.data;

  const scaleX = sw / targetSize;
  const scaleY = sh / targetSize;

  for (let y = 0; y < targetSize; y++) {
    const sy = y * scaleY;
    const sy0 = Math.floor(sy);
    const sy1 = Math.min(sy0 + 1, sh - 1);
    const fy = sy - sy0;

    for (let x = 0; x < targetSize; x++) {
      const sx = x * scaleX;
      const sx0 = Math.floor(sx);
      const sx1 = Math.min(sx0 + 1, sw - 1);
      const fx = sx - sx0;

      const i00 = (sy0 * sw + sx0) * 4;
      const i10 = (sy0 * sw + sx1) * 4;
      const i01 = (sy1 * sw + sx0) * 4;
      const i11 = (sy1 * sw + sx1) * 4;

      const dx = (y * targetSize + x) * 4;

      for (let c = 0; c < 4; c++) {
        const v0 = sdata[i00 + c] * (1 - fx) + sdata[i10 + c] * fx;
        const v1 = sdata[i01 + c] * (1 - fx) + sdata[i11 + c] * fx;
        ddata[dx + c] = Math.round(v0 * (1 - fy) + v1 * fy);
      }
    }
  }

  return dst;
}

function writeIcon(size, png) {
  const buffer = PNG.sync.write(png);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buffer);
}

let source;
if (fs.existsSync(sourcePath)) {
  try {
    const buf = fs.readFileSync(sourcePath);
    source = PNG.sync.read(buf);
    console.log(`Loaded source icon: ${source.width}x${source.height}`);
  } catch (err) {
    console.warn("Failed to read source.png:", err.message);
    source = null;
  }
}

if (!source) {
  console.warn("source.png missing or invalid - writing solid-color placeholders.");
  for (const size of [16, 48, 128]) {
    writeIcon(size, PNG.sync.read(makeSolidPng(size, [79, 70, 229, 255])));
    console.log(`wrote icon${size}.png (placeholder)`);
  }
} else {
  for (const size of [16, 48, 128]) {
    const resized = bilinearResize(source, size);
    writeIcon(size, resized);
    console.log(`wrote icon${size}.png`);
  }
}