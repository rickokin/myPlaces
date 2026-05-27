// One-shot stub-icon generator. Produces solid blue PNGs at the sizes
// needed by app/manifest.ts. Replace with real artwork when ready.
//
// Run: node scripts/generate-stub-icons.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "..", "public", "icons");
mkdirSync(OUT, { recursive: true });

// Brand color: tailwind blue-600 (#2563eb)
const R = 0x25;
const G = 0x63;
const B = 0xeb;
// Soft white "plate" disc in center for visual interest.
const PLATE = { r: 0xff, g: 0xff, b: 0xff, a: 0xff };

function crc32(buf) {
  let c;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePng(size) {
  // RGBA scanlines with filter byte 0 per row.
  const cx = size / 2;
  const cy = size / 2;
  const plateRadius = size * 0.34;
  const rowBytes = 1 + size * 4;
  const raw = Buffer.alloc(rowBytes * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * rowBytes;
    raw[rowStart] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const inPlate = Math.sqrt(dx * dx + dy * dy) < plateRadius;
      const off = rowStart + 1 + x * 4;
      if (inPlate) {
        raw[off] = PLATE.r;
        raw[off + 1] = PLATE.g;
        raw[off + 2] = PLATE.b;
        raw[off + 3] = PLATE.a;
      } else {
        raw[off] = R;
        raw[off + 1] = G;
        raw[off + 2] = B;
        raw[off + 3] = 0xff;
      }
    }
  }
  const idatData = deflateSync(raw);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idatData),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const targets = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "icon-maskable-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

for (const { name, size } of targets) {
  const png = makePng(size);
  writeFileSync(resolve(OUT, name), png);
  console.log(`wrote ${name} (${size}x${size}, ${png.length} bytes)`);
}
