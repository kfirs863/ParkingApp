const sharp = require('sharp');
const path = require('path');

const src = path.join(__dirname, '../assets/icon.png');
const outDir = path.join(__dirname, '../public');

const icons = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-maskable-512.png', size: 512 },
];

async function generate() {
  for (const { file, size } of icons) {
    const dest = path.join(outDir, file);
    await sharp(src).resize(size, size).toFile(dest);
    console.log(`Generated ${file} (${size}x${size})`);
  }
}

generate().catch(err => { console.error(err); process.exit(1); });
