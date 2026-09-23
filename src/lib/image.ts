const AVATAR_MAX_SIZE = 512;
// Generous headroom before we even try to decode the file — just here to fail fast (and
// with a clear message) on a huge or mis-picked file instead of hanging on createImageBitmap.
const MAX_SOURCE_FILE_SIZE = 20 * 1024 * 1024;

// Phone photos are routinely larger than the upload limit (5 MB), so crop to a centred
// square and shrink before sending. Re-encoding as JPEG also normalises PNG/WebP input.
export async function prepareAvatarImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    throw new Error("That doesn't look like an image file. Try a JPG or PNG photo.");
  }
  if (file.size > MAX_SOURCE_FILE_SIZE) {
    throw new Error('That photo is too large. Try one under 20 MB.');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That file couldn't be read as an image. Try a JPG or PNG photo.");
  }

  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const size = Math.min(side, AVATAR_MAX_SIZE);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext('2d');
    if (!context) throw new Error("Couldn't process that photo on this device.");

    // JPEG has no transparency — put transparent PNGs on white instead of black.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, size, size);
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!blob) throw new Error("Couldn't process that photo on this device.");
    return new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}
