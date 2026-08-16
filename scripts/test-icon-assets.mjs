import crypto from "node:crypto";
import fs from "node:fs";
import { PNG } from "pngjs";

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function bilinearResize(source, targetSize) {
  const result = new PNG({ width: targetSize, height: targetSize });
  const scaleX = source.width / targetSize;
  const scaleY = source.height / targetSize;

  for (let y = 0; y < targetSize; y += 1) {
    const sourceY = y * scaleY;
    const sourceY0 = Math.floor(sourceY);
    const sourceY1 = Math.min(sourceY0 + 1, source.height - 1);
    const fy = sourceY - sourceY0;

    for (let x = 0; x < targetSize; x += 1) {
      const sourceX = x * scaleX;
      const sourceX0 = Math.floor(sourceX);
      const sourceX1 = Math.min(sourceX0 + 1, source.width - 1);
      const fx = sourceX - sourceX0;
      const i00 = (sourceY0 * source.width + sourceX0) * 4;
      const i10 = (sourceY0 * source.width + sourceX1) * 4;
      const i01 = (sourceY1 * source.width + sourceX0) * 4;
      const i11 = (sourceY1 * source.width + sourceX1) * 4;
      const outputIndex = (y * targetSize + x) * 4;

      for (let channel = 0; channel < 4; channel += 1) {
        const top = source.data[i00 + channel] * (1 - fx) + source.data[i10 + channel] * fx;
        const bottom = source.data[i01 + channel] * (1 - fx) + source.data[i11 + channel] * fx;
        result.data[outputIndex + channel] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }

  return PNG.sync.write(result);
}

function hash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, received ${actual}`);
}

const source = readPng("assets/source-icon.png");
const rootIcon = fs.readFileSync("icon.png");
assertEqual(hash(rootIcon), hash(fs.readFileSync("assets/source-icon.png")), "source icon differs from icon.png");

for (const size of [16, 48, 128]) {
  const expected = bilinearResize(source, size);
  const publicIcon = fs.readFileSync(`public/icons/icon${size}.png`);
  const distIcon = fs.readFileSync(`dist/icons/icon${size}.png`);
  assertEqual(hash(publicIcon), hash(expected), `public icon${size} was not generated from the source icon`);
  assertEqual(hash(distIcon), hash(expected), `dist icon${size} is stale compared with the source icon`);
}

const manifest = JSON.parse(fs.readFileSync("dist/manifest.json", "utf8"));
assertEqual(manifest.icons["16"], "icons/icon16.png", "manifest 16px icon path is wrong");
assertEqual(manifest.icons["48"], "icons/icon48.png", "manifest 48px icon path is wrong");
assertEqual(manifest.icons["128"], "icons/icon128.png", "manifest 128px icon path is wrong");
console.log("PASS: source, generated, dist, and manifest icon assets are synchronized.");
