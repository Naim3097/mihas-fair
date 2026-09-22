// Cut the orthographic views out of a reference sheet, each padded to a square in the sheet's own background and
// upscaled, so a multiview generator gets one clean object per image at a size it likes.
//   node tools/rig/crop-views.mjs <sheet.png> <outdir> <name> front=x0,y0,x1,y1 left=... back=... right=... [scale=3]
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const [src, outDir, name, ...rest] = process.argv.slice(2);
if (!src || !outDir || !name) { console.error('usage: crop-views.mjs sheet.png outdir name view=x0,y0,x1,y1 ... [scale=3]'); process.exit(1); }
mkdirSync(outDir, { recursive: true });
let scale = 3;
const views = {};
for (const a of rest) { const [k, v] = a.split('='); if (k === 'scale') scale = Number(v); else views[k] = v.split(',').map(Number); }

const meta = await sharp(src).metadata();
for (const [view, [x0, y0, x1, y1]] of Object.entries(views)) {
  const w = x1 - x0, h = y1 - y0, side = Math.max(w, h) + 60;
  // the sheet's background at the crop's corner, so the padding is invisible
  const { data } = await sharp(src).extract({ left: Math.max(0, x0 + 3), top: Math.max(0, y0 + 3), width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  const background = { r: data[0], g: data[1], b: data[2], alpha: 1 };
  const out = `${outDir}/${name}-${view}.png`;
  await sharp(src)
    .extract({ left: x0, top: y0, width: Math.min(w, meta.width - x0), height: Math.min(h, meta.height - y0) })
    .extend({ top: Math.floor((side - h) / 2), bottom: Math.ceil((side - h) / 2), left: Math.floor((side - w) / 2), right: Math.ceil((side - w) / 2), background })
    .resize(Math.round(side * scale), Math.round(side * scale), { kernel: 'lanczos3' })
    .png({ compressionLevel: 6 })
    .toFile(out);
  console.log(`${view}: ${w}×${h} → ${Math.round(side * scale)} px square, background rgb(${data[0]},${data[1]},${data[2]}) → ${out}`);
}
