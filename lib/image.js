import sharp from 'sharp';

// Instagram feed images must be JPEG, between 4:5 (portrait) and 1.91:1 (landscape),
// and are shown at up to 1440 px wide. Crops the centre if the photo is outside that range.
export const MIN_RATIO = 4 / 5;
export const MAX_RATIO = 1.91;

export function cropBox(width, height) {
  const ratio = width / height;
  if (ratio < MIN_RATIO) {
    const h = Math.round(width / MIN_RATIO);
    return { left: 0, top: Math.round((height - h) / 2), width, height: h };
  }
  if (ratio > MAX_RATIO) {
    const w = Math.round(height * MAX_RATIO);
    return { left: Math.round((width - w) / 2), top: 0, width: w, height };
  }
  return null;
}

// Centre crop to an exact width/height ratio.
export function cropToRatio(width, height, ratio) {
  if (width / height > ratio) {
    const w = Math.round(height * ratio);
    return { left: Math.round((width - w) / 2), top: 0, width: w, height };
  }
  const h = Math.round(width / ratio);
  return { left: 0, top: Math.round((height - h) / 2), width, height: h };
}

export function clampRatio(ratio) {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
}

// Width/height of a photo once fitted to Instagram's allowed range.
export async function instagramRatio(input) {
  const { data, info } = await sharp(input).rotate().toBuffer({ resolveWithObject: true });
  void data;
  return clampRatio(info.width / info.height);
}

// ratio: crop every carousel slide to the same shape, since Instagram crops all
// slides to the first one's shape anyway.
export async function toInstagramJpeg(input, { ratio } = {}) {
  const base = sharp(input).rotate();
  const { data, info } = await base.toBuffer({ resolveWithObject: true });
  let img = sharp(data);
  const box = ratio ? cropToRatio(info.width, info.height, ratio) : cropBox(info.width, info.height);
  if (box) img = img.extract(box);
  return img
    .resize({ width: 1440, withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

// Photos for X: JPEG, uncropped, at most 2048 px and under X's 5 MB limit.
export async function toPlainJpeg(input) {
  for (const [width, quality] of [[2048, 88], [2048, 75], [1600, 75], [1200, 70]]) {
    const out = await sharp(input).rotate()
      .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (out.length < 4.8 * 1024 * 1024) return out;
  }
  throw new Error('Preparing the post failed: a photo is too large for X even after compressing');
}
