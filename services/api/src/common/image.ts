import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

/**
 * Re-encodes an uploaded photo of a person: decoded and drawn again (so a file that only pretends to be an image, or carries a
 * payload after the image data, is refused or cleaned), turned upright, shrunk to at most `maxSide` pixels, and saved without
 * metadata, so the camera's EXIF (GPS position of a child's home, device serial, time) never reaches storage. Same format out.
 */
export async function reencodePhoto(data: Buffer, mime: 'image/jpeg' | 'image/png' | 'image/webp', maxSide = 1600): Promise<Buffer> {
  try {
    const img = sharp(data, { limitInputPixels: 50_000_000, failOn: 'error' }).rotate().resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true });
    // sharp drops all metadata unless withMetadata() is asked for.
    if (mime === 'image/png') return await img.png({ compressionLevel: 8 }).toBuffer();
    if (mime === 'image/webp') return await img.webp({ quality: 85 }).toBuffer();
    return await img.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
  } catch {
    throw new BadRequestException('The photo could not be read. Use a JPEG, PNG or WebP image');
  }
}
