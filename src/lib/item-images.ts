import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "item-images";
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

function thumbnail(file: File, max = 400): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * k);
      canvas.height = Math.round(img.height * k);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("thumb"))), "image/webp", 0.85);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/** Uploads original + 400px thumbnail into the user's own folder. Returns storage paths. */
export async function uploadItemImage(itemId: string, file: File): Promise<{ image: string; thumb: string }> {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("Только PNG, JPEG или WebP");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Картинка больше 10 МБ");
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Нужно войти");
  const stamp = Date.now().toString(36);
  const ext = file.type.split("/")[1];
  const base = `${u.user.id}/${itemId}/${stamp}`;
  const thumb = await thumbnail(file);
  const a = await supabase.storage.from(BUCKET).upload(`${base}.${ext}`, file, { contentType: file.type });
  if (a.error) throw new Error("Не удалось загрузить картинку");
  const b = await supabase.storage.from(BUCKET).upload(`${base}-thumb.webp`, thumb, { contentType: "image/webp" });
  if (b.error) throw new Error("Не удалось загрузить картинку");
  return { image: `${base}.${ext}`, thumb: `${base}-thumb.webp` };
}

const cache = new Map<string, { url: string; exp: number }>();

/** Signed URL for a private image path (cached ~50 minutes). */
export function useItemImage(path: string | undefined) {
  const hit = path ? cache.get(path) : undefined;
  const [url, setUrl] = useState<string | null>(hit && hit.exp > Date.now() ? hit.url : null);
  useEffect(() => {
    if (!path) { setUrl(null); return; }
    const c = cache.get(path);
    if (c && c.exp > Date.now()) { setUrl(c.url); return; }
    let alive = true;
    void supabase.storage.from(BUCKET).createSignedUrl(path, 3600).then(({ data }) => {
      if (!alive || !data) return;
      cache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60_000 });
      setUrl(data.signedUrl);
    });
    return () => { alive = false; };
  }, [path]);
  return url;
}
