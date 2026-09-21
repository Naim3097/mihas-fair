// Pictures exhibitors upload (their logo, a photo of their booth), made small in the browser before they are sent:
// a logo stays a PNG so its transparency survives; a photo becomes a JPEG.

export async function shrink(file: File, kind: 'logo' | 'photo'): Promise<string> {
  const url = URL.createObjectURL(file), max = kind === 'logo' ? 512 : 1280;
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('That file is not an image we can read')); i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    if (kind === 'photo') return c.toDataURL('image/jpeg', 0.85);
    const png = c.toDataURL('image/png');
    return png.length < 450_000 ? png : c.toDataURL('image/webp', 0.88);
  } finally { URL.revokeObjectURL(url); }
}
