import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

function crc(bytes) { let n = 0xffffffff; for (const b of bytes) { n ^= b; for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0); } return (n ^ 0xffffffff) >>> 0; }
function chunk(type, bytes) { const name = Buffer.from(type), length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(bytes.length); checksum.writeUInt32BE(crc(Buffer.concat([name, bytes]))); return Buffer.concat([length, name, bytes, checksum]); }
const clamp = value => Math.max(0, Math.min(1, value));
function roundedRect(x, y, cx, cy, w, h, r) {
  const qx = Math.abs(x - cx) - (w / 2 - r), qy = Math.abs(y - cy) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
function segment(x, y, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, wx = x - ax, wy = y - ay;
  const t = clamp((wx * vx + wy * vy) / (vx * vx + vy * vy));
  return Math.hypot(x - (ax + vx * t), y - (ay + vy * t));
}
function blend(pixel, color, alpha) {
  const a = clamp(alpha), inv = 1 - a;
  pixel[0] = Math.round(pixel[0] * inv + color[0] * a); pixel[1] = Math.round(pixel[1] * inv + color[1] * a);
  pixel[2] = Math.round(pixel[2] * inv + color[2] * a); pixel[3] = Math.round(255 * (a + pixel[3] / 255 * inv));
}
function render(size = 1024) {
  const row = size * 4 + 1, pixels = Buffer.alloc(row * size);
  const scale = size / 1024, aa = Math.max(1, 1.5 * scale);
  const bgA = [22, 24, 28], bgB = [35, 38, 44], gold = [221, 174, 79], muted = [92, 99, 111], ink = [244, 242, 236];
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const x = (px + .5) / scale, y = (py + .5) / scale, i = py * row + 1 + px * 4, pixel = [0, 0, 0, 0];
    const bg = roundedRect(x, y, 512, 512, 884, 884, 202), bgAlpha = clamp(.5 - bg / aa);
    if (bgAlpha > 0) {
      const radial = clamp(1 - Math.hypot(x - 420, y - 360) / 720);
      const color = bgA.map((v, n) => Math.round(v + (bgB[n] - v) * radial)); blend(pixel, color, bgAlpha);
    }
    const radius = Math.hypot(x - 448, y - 438), ring = Math.abs(radius - 246) - 30;
    blend(pixel, muted, clamp(.5 - ring / aa) * .9);
    let angle = Math.atan2(y - 438, x - 448) + Math.PI / 2; if (angle < 0) angle += Math.PI * 2;
    if (angle < Math.PI * 1.52) blend(pixel, gold, clamp(.5 - ring / aa));
    const handle = segment(x, y, 624, 615, 795, 786) - 34; blend(pixel, gold, clamp(.5 - handle / aa));
    for (const yy of [350, 438, 526]) {
      const line = segment(x, y, 430, yy, 570, yy) - 12; blend(pixel, ink, clamp(.5 - line / aa) * .92);
    }
    const box1 = Math.abs(Math.hypot(x - 340, y - 350) - 24) - 7, box2 = Math.abs(Math.hypot(x - 340, y - 438) - 24) - 7, box3 = Math.abs(Math.hypot(x - 340, y - 526) - 24) - 7;
    blend(pixel, gold, clamp(.5 - box1 / aa)); blend(pixel, gold, clamp(.5 - box2 / aa)); blend(pixel, muted, clamp(.5 - box3 / aa));
    for (const [ax, ay, bx, by] of [[323,350,337,365],[337,365,365,333],[323,438,337,453],[337,453,365,421]]) {
      const d = segment(x, y, ax, ay, bx, by) - 8; blend(pixel, ink, clamp(.5 - d / aa));
    }
    pixels[i] = pixel[0]; pixels[i + 1] = pixel[1]; pixels[i + 2] = pixel[2]; pixels[i + 3] = pixel[3];
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}

await mkdir('build', { recursive: true });
await writeFile('build/task-lens-icon.png', render(1024));
console.log('Generated build/task-lens-icon.png');
