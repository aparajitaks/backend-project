import sharp from 'sharp';

/**
 * Creates a blurry 400x400 JPEG image.
 */
export async function createBlurryImage(): Promise<Buffer> {
  return await sharp({
    create: {
      width: 400,
      height: 400,
      channels: 3,
      background: { r: 136, g: 136, b: 136 },
    },
  })
    .blur(20)
    .jpeg()
    .toBuffer();
}
