// Nexo's four views: the front from the full render, the sides and back from the sheet's turnaround (upscaled ×3).
import sharp from 'sharp';
const SHEET = 'C:/Users/nurfa/ceritera.io/nexo references/character reference sheet 1.jpeg';
const FULL = 'C:/Users/nurfa/ceritera.io/nexo references/nexo full image 3d.jpeg';
const views = { left: [405, 145], back: [780, 150], right: [1150, 145] };
for (const [name, [left, width]] of Object.entries(views)) {
  await sharp(SHEET).extract({ left, top: 100, width, height: 300 }).resize({ width: width * 3, height: 900, kernel: 'lanczos3' }).png().toFile(`nexo/views/${name}.png`);
}
await sharp(FULL).resize({ height: 1024 }).png().toFile('nexo/views/front.png');
for (const n of ['front', 'left', 'back', 'right']) { const m = await sharp(`nexo/views/${n}.png`).metadata(); console.log(n, m.width, m.height); }
