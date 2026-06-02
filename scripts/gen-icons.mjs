import sharp from "sharp";
import fs from "node:fs";

// Indigo rounded-square with a white upward sparkline (finance mark).
const mark = (size, pad) => {
  const s = size;
  const r = Math.round(s * 0.22);
  const inset = pad;
  // sparkline points within the inner area
  const x0 = s * 0.24, x1 = s * 0.40, x2 = s * 0.56, x3 = s * 0.72, x4 = s * 0.78;
  const yBase = s * 0.66;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c6cf5"/>
      <stop offset="1" stop-color="#5b46e0"/>
    </linearGradient>
  </defs>
  <rect x="${inset}" y="${inset}" width="${s - inset * 2}" height="${s - inset * 2}" rx="${r}" fill="url(#g)"/>
  <polyline points="${x0},${yBase} ${x1},${s*0.54} ${x2},${s*0.6} ${x3},${s*0.36} ${x4},${s*0.36}"
    fill="none" stroke="#ffffff" stroke-width="${s*0.055}" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${x4}" cy="${s*0.36}" r="${s*0.045}" fill="#ffffff"/>
  <rect x="${s*0.22}" y="${s*0.72}" width="${s*0.56}" height="${s*0.055}" rx="${s*0.0275}" fill="#ffffff" opacity="0.5"/>
</svg>`;
};

async function png(svg, size, out) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
  console.log("wrote", out);
}

await png(mark(512, 0), 512, "public/icon-512.png");
await png(mark(192, 0), 192, "public/icon-192.png");
// maskable: extra safe-zone padding so it isn't clipped by circular masks
await png(mark(512, Math.round(512*0.10)), 512, "public/icon-maskable-512.png");
await png(mark(180, 0), 180, "public/apple-touch-icon.png");
fs.writeFileSync("public/icon.svg", mark(512, 0));
console.log("done");
