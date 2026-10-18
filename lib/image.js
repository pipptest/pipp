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

export async function toInstagramJpeg(input) {
  const base = sharp(input).rotate();
  const { data, info } = await base.toBuffer({ resolveWithObject: true });
  let img = sharp(data);
  const box = cropBox(info.width, info.height);
  if (box) img = img.extract(box);
  return img
    .resize({ width: 1440, withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}
