export type ImageCropBox = { fileIndex: number; x: number; y: number; width: number; height: number };

export async function cropMenuImage(file: File, box: ImageCropBox): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("O recorte só pode ser aplicado a um arquivo de imagem.");
  if (!Number.isInteger(box.fileIndex) || box.fileIndex < 1 ||
      ![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
      box.x < 0 || box.y < 0 || box.width < 0.03 || box.height < 0.03 ||
      box.x + box.width > 1 || box.y + box.height > 1) {
    throw new Error("A IA retornou coordenadas de recorte inválidas.");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const sourceX = Math.round(box.x * bitmap.width);
    const sourceY = Math.round(box.y * bitmap.height);
    const sourceWidth = Math.min(bitmap.width - sourceX, Math.round(box.width * bitmap.width));
    const sourceHeight = Math.min(bitmap.height - sourceY, Math.round(box.height * bitmap.height));
    if (sourceWidth < 8 || sourceHeight < 8) throw new Error("A área sugerida para a foto é pequena demais.");
    const scale = Math.min(1, 2400 / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a foto recortada.");
    context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error("Não foi possível gerar o recorte da foto.")), "image/jpeg", 0.92));
    const baseName = file.name.replace(/\.[^.]+$/, "") || "foto-item";
    return new File([blob], `${baseName}-recortada.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } finally { bitmap.close(); }
}
