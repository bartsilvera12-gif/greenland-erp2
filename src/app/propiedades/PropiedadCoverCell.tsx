"use client";

import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import type { Propiedad } from "@/lib/propiedades/types";

const ACCEPT = "image/jpeg,image/png,image/webp";

interface Props {
  propiedad: Propiedad;
  onChange: (next: Propiedad) => void;
}

export default function PropiedadCoverCell({ propiedad, onChange }: Props) {
  const [url, setUrl] = useState<string | null>(propiedad.imagen_url ?? null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch(`/api/propiedades/${propiedad.id}/imagen`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        const newUrl = json.data?.imagen_url ?? null;
        const newPath = json.data?.imagen_path ?? null;
        setUrl(newUrl);
        onChange({ ...propiedad, imagen_path: newPath, imagen_url: newUrl });
      } else {
        alert(json?.error ?? "No se pudo subir la imagen");
      }
    } catch {
      alert("Error de red al subir la imagen");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <button
      type="button"
      onClick={() => fileRef.current?.click()}
      disabled={busy}
      title={url ? "Cambiar foto" : "Subir foto"}
      className="group relative block h-14 w-20 overflow-hidden rounded-md border border-slate-200 bg-slate-100 transition hover:border-[#4FAEB2] disabled:opacity-50"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={propiedad.titulo} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-slate-400">
          <ImagePlus className="h-5 w-5" />
        </div>
      )}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
        {busy ? "Subiendo…" : url ? "Cambiar" : "Subir"}
      </span>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handleFile}
      />
    </button>
  );
}
