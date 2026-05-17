import sharp from 'sharp';

/**
 * Creates a tiny 100x100 JPEG image.
 */
export async function createTinyImage(): Promise<Buffer> {
  return await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  })
    .jpeg()
    .toBuffer();
}
