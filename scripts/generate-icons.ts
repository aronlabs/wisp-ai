// Generate a small antialiased native TGA texture; no font glyph dependency.
import { mkdirSync, writeFileSync } from 'node:fs';
const size = 32, samples = 4;
const tga = Buffer.alloc(18 + size * size * 4);
tga[2] = 2;
tga.writeUInt16LE(size, 12); tga.writeUInt16LE(size, 14);
tga[16] = 32; tga[17] = 0x28;
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  let coverage = 0;
  for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
    const dx = x + (sx + .5) / samples - size / 2;
    const dy = y + (sy + .5) / samples - size / 2;
    const radius = Math.hypot(dx, dy);
    const tooth = Math.cos(Math.atan2(dy, dx) * 8) > .25;
    if (radius >= 5 && radius <= (tooth ? 14 : 11)) coverage++;
  }
  const offset = 18 + (y * size + x) * 4;
  tga[offset] = 110; tga[offset + 1] = 184; tga[offset + 2] = 214;
  tga[offset + 3] = Math.round(255 * coverage / (samples * samples));
}
mkdirSync('addon/WispAI/Textures', { recursive: true });
writeFileSync('addon/WispAI/Textures/Gear.tga', tga);
