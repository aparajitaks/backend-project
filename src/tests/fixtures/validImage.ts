import sharp from 'sharp';

/**
 * Creates a valid 400x400 JPEG image.
 * Solid mid-gray background with sharp white text to ensure high Laplacian variance.
 */
export async function createValidImage(): Promise<Buffer> {
  return await sharp({
    create: {
      width: 400,
      height: 400,
      channels: 3,
      background: { r: 136, g: 136, b: 136 }, // #888
    },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg><text x="50" y="200" font-family="Arial" font-size="60" fill="white">SHARP EDGES</text></svg>'
        ),
        top: 0,
        left: 0,
      },
    ])
    .jpeg()
    .toBuffer();
}
