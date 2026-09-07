import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
const out = new URL('../apps/web/public/icons/', import.meta.url);
await mkdir(out, { recursive: true });
function crc(b) {
  let c = 0xffffffff;
  for (const x of b) {
    c ^= x;
    for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const type = Buffer.from(name),
    size = Buffer.alloc(4),
    check = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  check.writeUInt32BE(crc(Buffer.concat([type, data])));
  return Buffer.concat([size, type, data, check]);
}
for (const n of [192, 512]) {
  const raw = Buffer.alloc(n * (n * 4 + 1));
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const xx = x / n,
        yy = y / n,
        dx = xx - 0.5,
        dy = yy - 0.5;
      const u = (dx - dy) * 0.707,
        v = (dx + dy) * 0.707;
      const leaf = (u * u) / 0.104 + (v * v) / 0.026 < 1;
      const vein = Math.abs(v) < 0.013 && u > -0.31 && u < 0.28;
      const color = leaf && !vein ? [204, 219, 177] : [23, 63, 54];
      const i = y * (n * 4 + 1) + 1 + x * 4;
      raw[i] = color[0];
      raw[i + 1] = color[1];
      raw[i + 2] = color[2];
      raw[i + 3] = 255;
    }
  const h = Buffer.alloc(13);
  h.writeUInt32BE(n);
  h.writeUInt32BE(n, 4);
  h[8] = 8;
  h[9] = 6;
  await writeFile(
    new URL('icon-' + n + '.png', out),
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', h),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
console.log('Created 192px and 512px install icons.');
