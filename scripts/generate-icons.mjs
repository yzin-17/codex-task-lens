import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
// Small deterministic RGBA PNGs, no external image tooling in the packaging chain.
function crc(bytes) { let n = 0xffffffff; for (const b of bytes) { n ^= b; for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0); } return (n ^ 0xffffffff) >>> 0; }
function chunk(type, bytes) { const name = Buffer.from(type), length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(bytes.length); checksum.writeUInt32BE(crc(Buffer.concat([name, bytes]))); return Buffer.concat([length, name, bytes, checksum]); }
function icon(size, tray = false) {
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x + .5) / size - .5, dy = (y + .5) / size - .5, radius = Math.hypot(dx, dy), angle = (Math.atan2(dy, dx) + Math.PI * 2.5) % (Math.PI * 2);
    const ring = radius > .28 && radius < .4, active = ring && angle < Math.PI * 1.5;
    const visible = tray ? ring : Math.max(Math.abs(dx), Math.abs(dy)) < .45 && (Math.abs(dx) < .32 || Math.abs(dy) < .32 || Math.hypot(Math.abs(dx) - .32, Math.abs(dy) - .32) < .13);
    const value = tray ? 35 : active ? 245 : ring ? 108 : 44;
    const index = y * (size * 4 + 1) + 1 + x * 4; pixels[index] = value; pixels[index + 1] = value + (tray ? 0 : 2); pixels[index + 2] = value + (tray ? 0 : 5); pixels[index + 3] = visible ? 255 : 0;
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
await mkdir('build', { recursive: true }); await mkdir('desktop', { recursive: true });
await writeFile('build/icon.png', icon(512)); await writeFile('desktop/tray.png', icon(32, true));
await writeFile('desktop/build-info.json', JSON.stringify({ commit: process.env.GITHUB_SHA || 'local', platform: process.platform, arch: process.arch }, null, 2));
