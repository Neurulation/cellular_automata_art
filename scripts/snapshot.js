/**
 * Render a world to a PNG from Node, with no dependencies.
 *
 *   node scripts/snapshot.js --world ecology --seed portrait-1 --steps 900 --size 160 --scale 4 --out docs/img/x.png
 *   node scripts/snapshot.js --world grayscott --preset mitosis --seed 3 --steps 400 --out mitosis.png
 *
 * Because worlds are deterministic, a snapshot is a reproducible artefact:
 * the same arguments give the same bytes. Used for before/after comparisons
 * in pull requests and for portraits in the cycle log.
 *
 * PNG writing is done by hand (zlib is built into Node): signature, IHDR,
 * IDAT with filter byte 0 per row, IEND, CRC32 per chunk.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { deflateSync } from 'node:zlib';
import { WORLDS } from '../src/index.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);
const kind = args.world ?? 'ecology';
const seed = args.seed ?? 'portrait-1';
const steps = +(args.steps ?? 600);
const size = +(args.size ?? 160);
const scale = +(args.scale ?? 4);
const out = args.out ?? `snapshot-${kind}-${seed}-${steps}.png`;

const opts = { seed, width: size, height: size };
if (kind === 'life' && args.rule) opts.rule = args.rule;
if (kind === 'grayscott' && args.preset) opts.preset = args.preset;
if (kind === 'elementary') {
  opts.width = size * 2;
  opts.height = size;
  if (args.rule) opts.rule = +args.rule;
}
const world = WORLDS[kind].create(opts);
for (let i = 0; i < steps; i++) world.step();

const { width, height } = world;
const px = new Uint32Array(width * height);
world.paint(px);
const bytes = new Uint8Array(px.buffer);

const W = width * scale;
const H = height * scale;
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  const row = y * (W * 3 + 1);
  raw[row] = 0; // filter: none
  const sy = Math.floor(y / scale);
  for (let x = 0; x < W; x++) {
    const si = (sy * width + Math.floor(x / scale)) * 4;
    const o = row + 1 + x * 3;
    raw[o] = bytes[si];
    raw[o + 1] = bytes[si + 1];
    raw[o + 2] = bytes[si + 2];
  }
}

const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // colour type: RGB
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
const s = world.stats();
console.log(`${out}  ${W}x${H}  ${kind} seed=${seed} steps=${steps} ${JSON.stringify({ ...s, grazerGenes: undefined, hunterGenes: undefined })}`);
