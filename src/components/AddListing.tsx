import { useRef, useState } from "react";
import { supabase } from "../lib/supabase";

export default function AddListing({ userId, onAdded }: { userId: string; onAdded?: (id: string) => void }) {
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!url.trim() && !file) {
      setError("Bitte einen Link einfügen oder ein PDF auswählen.");
      return;
    }
    try {
      let pdf_path: string | undefined;
      let image_path: string | undefined;
      if (file) {
        setBusy("PDF wird hochgeladen …");
        const key = crypto.randomUUID();
        pdf_path = `${userId}/${key}.pdf`;
        const up = await supabase.storage.from("listings").upload(pdf_path, file, { contentType: "application/pdf" });
        if (up.error) throw up.error;

        setBusy("Titelbild wird gesucht …");
        const { extractCoverImage } = await import("../lib/pdfImage");
        const img = await extractCoverImage(file);
        if (img) {
          image_path = `${userId}/${key}.jpg`;
          const r = await supabase.storage.from("car-images").upload(image_path, img, { contentType: "image/jpeg" });
          if (r.error) image_path = undefined;
        }
      }
      setBusy("Analyse wird gestartet …");
      const { data, error } = await supabase.functions.invoke("analyze-listing", {
        body: { url: url.trim() || undefined, pdf_path, image_path },
      });
      if (error) throw error;
      setUrl("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onAdded?.(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 space-y-2">
      <input
        type="url" placeholder="Link zur Anzeige (mobile.de, autoscout24 …)" value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-2">
        <label className="flex-1 min-w-0 cursor-pointer rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 truncate">
          <input
            ref={fileRef} type="file" accept="application/pdf" className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? `📄 ${file.name}` : "📄 PDF der Anzeige (optional)"}
        </label>
        <button
          disabled={!!busy}
          className="shrink-0 rounded-lg bg-blue-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Hinzufügen
        </button>
      </div>
      {busy && <p className="text-xs text-slate-500">{busy}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-[11px] text-slate-400 leading-snug">
        Tipp: Wenn mobile.de den Abruf blockiert, die Anzeige im Browser über „Drucken → Als PDF speichern“ sichern und hier hochladen
        (Link gern zusätzlich eintragen).
      </p>
    </form>
  );
}
