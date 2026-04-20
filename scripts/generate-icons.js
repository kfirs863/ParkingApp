const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const assetsDir = path.join(__dirname, '../assets');
const publicDir = path.join(__dirname, '../public');
const src = path.join(assetsDir, 'icon-1024x1024.png');

const BG = '#0A0A0F';
const BG_RGB = { r: 10, g: 10, b: 15, alpha: 1 };

async function flatten(srcPath, destPath, size) {
  await sharp(srcPath)
    .resize(size, size, { fit: 'contain', background: BG_RGB })
    .flatten({ background: BG_RGB })
    .toFile(destPath);
  console.log(`Generated ${path.relative(process.cwd(), destPath)} (${size}x${size})`);
}

async function generateSplash(destPath, width, height) {
  const iconSize = Math.round(Math.min(width, height) * 0.5);
  const iconBuf = await sharp(src)
    .resize(iconSize, iconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await sharp({
    create: { width, height, channels: 4, background: BG_RGB },
  })
    .composite([{ input: iconBuf, gravity: 'center' }])
    .png()
    .toFile(destPath);
  console.log(`Generated ${path.relative(process.cwd(), destPath)} (${width}x${height})`);
}

async function generateNotificationIcon(destPath, size) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
    const isLogo = a > 32 && r > 100 && r > b + 20;
    out[i * 4] = 255;
    out[i * 4 + 1] = 255;
    out[i * 4 + 2] = 255;
    out[i * 4 + 3] = isLogo ? 255 : 0;
  }
  await sharp(out, { raw: { width, height, channels: 4 } })
    .resize(size, size)
    .png()
    .toFile(destPath);
  console.log(`Generated ${path.relative(process.cwd(), destPath)} (${size}x${size})`);
}

async function generate() {
  await flatten(src, path.join(assetsDir, 'icon.png'), 1024);
  await flatten(src, path.join(assetsDir, 'adaptive-icon.png'), 1024);
  await generateSplash(path.join(assetsDir, 'splash.png'), 1284, 2778);
  await generateNotificationIcon(path.join(assetsDir, 'notification-icon.png'), 96);

  for (const { file, size } of [
    { file: 'icon-192.png', size: 192 },
    { file: 'icon-512.png', size: 512 },
    { file: 'icon-maskable-512.png', size: 512 },
  ]) {
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
    await flatten(src, path.join(publicDir, file), size);
  }
}

generate().catch((err) => { console.error(err); process.exit(1); });
