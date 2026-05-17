/**
 * Creates a corrupted file (garbage bytes).
 */
export function createCorruptedFile(): Buffer {
  return Buffer.from('not-an-image-just-garbage-bytes-xyz123');
}
