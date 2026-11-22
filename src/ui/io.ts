/**
 * ui/io.ts — ÚNICA área do oko autorizada a usar APIs prontas de codec
 * (createImageBitmap / canvas). Decodifica arquivo -> ImageBuf e vice-versa.
 */
import { type ImageBuf, fromData } from "../core/image";

export async function loadImageFile(file: File): Promise<ImageBuf> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("falha ao criar contexto 2d");
    // decode apenas: desenhar o bitmap cru, sem resize/filtro do canvas
    ctx.drawImage(bitmap, 0, 0);
    const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return fromData(img.width, img.height, new Uint8ClampedArray(img.data));
  } finally {
    bitmap.close();
  }
}

export function bufToBlob(img: ImageBuf, type = "image/png", quality?: number): Promise<Blob> {
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("falha ao criar contexto 2d");
  let data = new Uint8ClampedArray(img.data);
  if (type === "image/jpeg") {
    // JPEG não tem alfa: compor transparente sobre branco (sem isso o encode
    // usa preto e qualquer borda oval/circular sairia com halo escuro)
    const white = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3]! / 255;
      white[i] = Math.round(data[i]! * a + 255 * (1 - a));
      white[i + 1] = Math.round(data[i + 1]! * a + 255 * (1 - a));
      white[i + 2] = Math.round(data[i + 2]! * a + 255 * (1 - a));
      white[i + 3] = 255;
    }
    data = white;
  }
  // encode apenas: blit final, canvas não faz nenhuma transformação
  ctx.putImageData(new ImageData(data, img.width, img.height), 0, 0);
  return canvas.convertToBlob({ type, quality });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
