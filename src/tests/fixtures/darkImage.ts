import sharp from 'sharp';

/**
 * Creates a dark 400x400 JPEG image.
 */
export async function createDarkImage(): Promise<Buffer> {
  return await sharp({
    create: {
      width: 400,
      height: 400,
      channels: 3,
      background: { r: 10, g: 10, b: 10 }, // #0a0a0a
    },
  })
    .jpeg()
    .toBuffer();
}
