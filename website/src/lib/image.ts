const MAX_DIMENSION = 2048;
const QUALITY = 0.82;
const RETRY_QUALITY = 0.6;
const RETRY_THRESHOLD_BYTES = 1.5 * 1024 * 1024;
const SKIP_TYPES = new Set(["image/gif", "image/svg+xml"]);

function withExtension(name: string, ext: string): string {
  const dot = name.lastIndexOf(".");
  return `${dot === -1 ? name : name.slice(0, dot)}.${ext}`;
}

async function encode(
  bitmap: ImageBitmap,
  quality: number,
): Promise<Blob | null> {
  const scale = Math.min(
    1,
    MAX_DIMENSION / Math.max(bitmap.width, bitmap.height),
  );
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, width, height);

  return new Promise((resolve) =>
    canvas.toBlob(resolve, "image/webp", quality),
  );
}

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || SKIP_TYPES.has(file.type)) return file;

  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    let blob = await encode(bitmap, QUALITY);
    if (blob && blob.size > RETRY_THRESHOLD_BYTES) {
      blob = (await encode(bitmap, RETRY_QUALITY)) ?? blob;
    }
    bitmap.close();
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], withExtension(file.name, "webp"), {
      type: "image/webp",
    });
  } catch {
    return file;
  }
}
