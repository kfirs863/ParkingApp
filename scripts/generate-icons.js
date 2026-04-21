const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const assetsDir = path.join(__dirname, '../assets');
const publicDir = path.join(__dirname, '../public');
const src = path.join(assetsDir, 'icon-1024x1024.png');

const BG_RGB = { r: 10, g: 10, b: 15, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

async function cropToLogo(srcPath) {
  const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  let minX = width, maxX = 0, minY = height, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a > 128 && r > 100 && r > b + 30) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  return sharp(srcPath).ensureAlpha().extract({ left: minX, top: minY, width: w, height: h });
}

async function flattenFull(destPath, size) {
  await sharp(src)
    .resize(size, size, { fit: 'contain', background: BG_RGB })
    .flatten({ background: BG_RGB })
    .png()
    .toFile(destPath);
  console.log(`Generated ${path.relative(process.cwd(), destPath)} (${size}x${size})`);
}

async function generateAdaptiveIcon(destPath, size, safeZonePct, bgRgb) {
  const logoSize = Math.round(size * safeZonePct);
  const logoBuf = await (await cropToLogo(src))
    .resize(logoSize, logoSize, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: bgRgb },
  })
    .composite([{ input: logoBuf, gravity: 'center' }])
    .png()
    .toFile(destPath);
  console.log(`Generated ${path.relative(process.cwd(), destPath)} (${size}x${size}, logo ${Math.round(safeZonePct * 100)}%)`);
}

async function generateSplashIcon(destPath, size) {
  const logoSize = Math.round(size * 0.6);
  const logoBuf = await (await cropToLogo(src))
    .resize(logoSize, logoSize, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: TRANSPARENT },
  })
    .composite([{ input: logoBuf, gravity: 'center' }])
    .png()
    .toFile(destPath);
  console.log(`Generated ${path.relative(process.cwd(), destPath)} (${size}x${size}, logo 60% transparent bg)`);
}

async function generateNotificationIcon(destPath, size) {
  const cropped = await cropToLogo(src);
  const { data, info } = await cropped.raw().toBuffer({ resolveWithObject: true });
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
    .resize(size, size, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toFile(destPath);
  console.log(`Generated ${path.relative(process.cwd(), destPath)} (${size}x${size})`);
}

async function generate() {
  await flattenFull(path.join(assetsDir, 'icon.png'), 1024);
  await generateAdaptiveIcon(path.join(assetsDir, 'adaptive-icon.png'), 1024, 0.65, BG_RGB);
  await generateSplashIcon(path.join(assetsDir, 'splash-icon.png'), 1024);
  await generateNotificationIcon(path.join(assetsDir, 'notification-icon.png'), 96);

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  for (const { file, size } of [
    { file: 'icon-192.png', size: 192 },
    { file: 'icon-512.png', size: 512 },
    { file: 'icon-maskable-512.png', size: 512 },
  ]) {
    await flattenFull(path.join(publicDir, file), size);
  }
}

generate().catch((err) => { console.error(err); process.exit(1); });
