import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "public", "icons");
const logo = path.join(output, "jarbas-logo.jpg");
await mkdir(output, { recursive: true });

const jobs = [
  [192, false, "icon-192.png"],
  [512, false, "icon-512.png"],
  [512, true, "icon-maskable-512.png"],
  [180, false, "apple-touch-icon.png"],
];

for (const [size, maskable, filename] of jobs) {
  if (maskable) {
    const inset = Math.round(size * 0.14);
    const tile = await sharp(logo)
      .resize(size - inset * 2, size - inset * 2, { fit: "cover" })
      .png()
      .toBuffer();
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: "#0B141D",
      },
    })
      .composite([{ input: tile, left: inset, top: inset }])
      .png()
      .toFile(path.join(output, filename));
  } else {
    await sharp(logo)
      .resize(size, size, { fit: "cover" })
      .png()
      .toFile(path.join(output, filename));
  }
}
