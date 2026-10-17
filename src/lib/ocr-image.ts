const MAX_EDGE = 2400;
const JPEG_QUALITY = 0.88;

function clamp(value: number) {
  return Math.max(0, Math.min(255, value));
}

/**
 * Prepara uma foto de documento para OCR sem tocar em PDFs, XMLs ou planilhas.
 * A imagem é orientada pelo EXIF, reduzida para um limite seguro e recebe uma melhoria
 * conservadora de escala de cinza/contraste. O original nunca é alterado no File local.
 */
export async function preprocessDocumentImage(
  file: File,
  options: { preserveColor?: boolean } = {},
): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return file;

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.fillStyle = "white";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    if (!options.preserveColor) {
      const image = context.getImageData(0, 0, width, height);
      const data = image.data;
      let min = 255;
      let max = 0;
      for (let index = 0; index < data.length; index += 4) {
        const luminance =
          0.299 * (data[index] ?? 0) +
          0.587 * (data[index + 1] ?? 0) +
          0.114 * (data[index + 2] ?? 0);
        min = Math.min(min, luminance);
        max = Math.max(max, luminance);
      }

      // Só aumenta contraste quando há uma foto realmente lavada; evita destruir fotos boas.
      const range = max - min;
      const shouldNormalize = range >= 20 && range < 190;
      const contrast = shouldNormalize ? 255 / range : 1;
      const midpoint = (min + max) / 2;

      for (let index = 0; index < data.length; index += 4) {
        const luminance =
          0.299 * (data[index] ?? 0) +
          0.587 * (data[index + 1] ?? 0) +
          0.114 * (data[index + 2] ?? 0);
        // Mantém tons neutros: recibos e cupons são mais legíveis em cinza, sem binarização agressiva.
        const adjusted = shouldNormalize ? (luminance - midpoint) * contrast + 127.5 : luminance;
        const value = clamp(adjusted);
        data[index] = value;
        data[index + 1] = value;
        data[index + 2] = value;
      }
      context.putImageData(image, 0, 0);
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + "-ocr.jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}
