export async function thumbnail(file: File): Promise<string> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 30 * 1024 * 1024
  )
    throw Error(
      "预览请选择 30MB 以内的 JPG / PNG / WebP；大原件请通过素材库登记",
    );
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.width || !image.height) throw Error("无法读取图片");
    const scale = Math.min(1, 800 / Math.max(image.width, image.height)),
      canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("此浏览器不支持图片预览");
    ctx.fillStyle = "#FAF9F5";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.78, 0.6, 0.4]) {
      const result = canvas.toDataURL("image/jpeg", quality);
      if (result.length <= 350000) return result;
    }
    throw Error("缩略图过大，请选择较小的图片");
  } finally {
    URL.revokeObjectURL(url);
  }
}
