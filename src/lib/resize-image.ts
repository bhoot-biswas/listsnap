/**
 * Shrinks a photo in the browser before upload: longest side 2048 px, JPEG.
 * A 12 MP phone photo drops from ~4 MB to ~0.6 MB, which matters on mobile data. If the
 * browser can't decode the file (HEIC on Chrome, for one), the original is sent and the
 * server decides.
 */
export async function resizeForUpload(file: File, maxSide = 2048): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.type === "image/jpeg") {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  return blob ?? file;
}
