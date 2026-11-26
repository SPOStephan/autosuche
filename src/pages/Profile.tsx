import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { loadProfileText, saveProfileText, assessMany } from "../lib/fit";
import { useCars } from "../lib/useCars";

export default function Profile({ userId }: { userId: string }) {
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const { cars } = useCars();
  const doneCars = cars.filter((c) => c.status === "done");

  useEffect(() => {
    loadProfileText().then((t) => {
      setText(t);
      setLoaded(true);
    });
  }, []);

  async function save() {
    await saveProfileText(userId, text.trim());
    setSaved("Gespeichert. Neue Fahrzeuge werden ab sofort nach diesem Profil bewertet.");
  }

  async function rateAll() {
    if (!confirm(`Eignung für alle ${doneCars.length} Fahrzeuge neu bewerten? Das kostet pro Fahrzeug ein paar Cent und dauert etwas.`)) return;
    await saveProfileText(userId, text.trim());
    await assessMany(doneCars, (done, total, failed) => setProgress({ done, total, failed }));
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <Link to="/" className="text-sm text-blue-700 hover:underline">← Zur Karte</Link>
      <h1 className="text-xl font-semibold">Unser Profil</h1>
      <p className="text-sm text-slate-600">
        Beschreibt in eigenen Worten, wofür ihr das Auto braucht. Daraus bildet die KI die zweite Note
        <b> „Eignung für uns“</b> – unabhängig davon, ob das Angebot preislich gut ist.
      </p>
      <textarea
        value={text}
        disabled={!loaded}
        onChange={(e) => { setText(e.target.value); setSaved(null); }}
        rows={10}
        placeholder="z. B. Anhängerbetrieb, typische Strecken, Anzahl Personen, Budget für Unterhalt, Wünsche …"
        className="w-full rounded-lg border border-slate-300 p-3 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <button onClick={save} className="rounded-lg bg-blue-700 text-white px-4 py-2 text-sm font-medium">Speichern</button>
        <button
          onClick={rateAll}
          disabled={!text.trim() || !!(progress && progress.done < progress.total) || doneCars.length === 0}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-40"
        >
          Speichern & alle {doneCars.length} Fahrzeuge neu bewerten
        </button>
      </div>
      {saved && <p className="text-sm text-emerald-700">{saved}</p>}
      {progress && (
        <p className="text-sm text-blue-800">
          Bewertet: {progress.done} von {progress.total}
          {progress.failed > 0 && <span className="text-red-600"> · {progress.failed} fehlgeschlagen</span>}
          {progress.done === progress.total && " – fertig"}
        </p>
      )}
    </div>
  );
}
