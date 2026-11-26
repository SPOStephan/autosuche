import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import L from "leaflet";
import { supabase } from "../lib/supabase";
import { useCar } from "../lib/useCars";
import { euro, km, scoreColor, towHitchInfo } from "../lib/format";
import { assessFit } from "../lib/fit";
import type { Car } from "../lib/types";

const pin = L.divIcon({
  className: "",
  html: '<div style="font-size:30px;line-height:30px">📍</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 30],
});

function Section({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "red" }) {
  return (
    <section className={`bg-white rounded-xl border p-4 ${tone === "red" ? "border-red-300 bg-red-50" : "border-slate-200"}`}>
      <h2 className="font-semibold mb-2">{title}</h2>
      {children}
    </section>
  );
}

function Bullets({ items, icon }: { items: string[]; icon: string }) {
  if (!items?.length) return <p className="text-sm text-slate-500">–</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2">
          <span className="shrink-0">{icon}</span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-sm font-medium">{value ?? "–"}</div>
    </div>
  );
}

function Checklist({ car }: { car: Car }) {
  const storageKey = `checklist-${car.id}`;
  const [done, setDone] = useState<Record<number, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(done));
    } catch {
      /* egal */
    }
  }, [done, storageKey]);

  const items = car.evaluation?.inspection_checklist ?? [];
  return (
    <ul className="space-y-2 text-sm">
      {items.map((c, i) => (
        <li key={i}>
          <label className="flex gap-2 cursor-pointer">
            <input
              type="checkbox" className="mt-1 shrink-0" checked={!!done[i]}
              onChange={(e) => setDone({ ...done, [i]: e.target.checked })}
            />
            <span className={done[i] ? "line-through text-slate-400" : ""}>
              <span className="font-medium">{c.item}</span>
              <span className="block text-slate-500">{c.why}</span>
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

export default function CarDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { car, loading, setCar } = useCar(id);
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(true);
  const [fitBusy, setFitBusy] = useState(false);

  useEffect(() => {
    if (car) setNotes(car.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [car?.id]);

  if (loading) return <div className="p-8 text-slate-500">Lädt …</div>;
  if (!car) return <div className="p-8">Nicht gefunden. <Link to="/" className="text-blue-700 underline">Zurück</Link></div>;

  const v = car.vehicle;
  const e = car.evaluation;

  async function update(patch: Partial<Car>) {
    setCar({ ...car!, ...patch });
    await supabase.from("cars").update(patch).eq("id", car!.id);
  }

  async function reanalyze() {
    setCar({ ...car!, status: "processing", error: null });
    const { error } = await supabase.functions.invoke("analyze-listing", { body: { id: car!.id } });
    if (error) alert(error.message);
  }

  async function rateFit() {
    setFitBusy(true);
    try {
      await assessFit(car!.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setFitBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Fahrzeug wirklich löschen?")) return;
    if (car!.pdf_path) await supabase.storage.from("listings").remove([car!.pdf_path]);
    await supabase.from("cars").delete().eq("id", car!.id);
    navigate("/");
  }

  async function openPdf() {
    const { data } = await supabase.storage.from("listings").createSignedUrl(car!.pdf_path!, 600);
    if (data) window.open(data.signedUrl, "_blank");
  }

  return (
    <div className="max-w-5xl mx-auto p-4 pb-16 space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <Link to="/" className="text-blue-700 hover:underline">← Zur Karte</Link>
        <span className="flex-1" />
        <button onClick={() => update({ favorite: !car.favorite })} className="hover:underline">
          {car.favorite ? "⭐ Favorit" : "☆ Als Favorit merken"}
        </button>
        <button onClick={reanalyze} disabled={car.status === "processing"} className="hover:underline disabled:opacity-40">
          ↻ Neu analysieren
        </button>
        <button onClick={remove} className="text-red-600 hover:underline">Löschen</button>
      </div>

      <div className="grid md:grid-cols-[1.2fr_1fr] gap-4">
        <div className="rounded-xl overflow-hidden bg-slate-200 aspect-[4/3] flex items-center justify-center text-6xl">
          {car.image_url ? <img src={car.image_url} alt="" className="w-full h-full object-cover" /> : "🚗"}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <h1 className="text-xl font-semibold leading-snug">{car.title}</h1>
          <div className="text-2xl font-bold">
            {euro(car.price_eur)}
            {v?.price_negotiable && <span className="text-sm font-normal text-slate-500"> VB</span>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Fact label="Erstzulassung" value={car.first_registration} />
            <Fact label="Kilometer" value={km(car.mileage_km)} />
            <Fact label="Leistung" value={v?.power_ps ? `${v.power_ps} PS${v.power_kw ? ` (${v.power_kw} kW)` : ""}` : null} />
            <Fact label="Kraftstoff" value={car.fuel} />
            <Fact label="Getriebe" value={car.transmission} />
            <Fact label="Vorbesitzer" value={v?.previous_owners} />
            <Fact label="Unfallfrei" value={v?.accident_free == null ? "unbekannt" : v.accident_free ? "ja" : "nein"} />
            <Fact label="HU bis" value={v?.hu_until} />
            <Fact label="Scheckheft" value={v?.service_history} />
            <Fact label="Farbe" value={v?.color} />
            <Fact label="Verkäufer" value={[v?.seller_type, v?.seller_name].filter(Boolean).join(" · ") || null} />
            <Fact label="Standort" value={[car.zip, car.city].filter(Boolean).join(" ") || null} />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {car.url && (
              <a href={car.url} target="_blank" rel="noreferrer" className="rounded-lg bg-blue-700 text-white px-3 py-1.5 text-sm font-medium">
                Zur Anzeige ↗
              </a>
            )}
            {car.pdf_path && (
              <button onClick={openPdf} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">📄 PDF öffnen</button>
            )}
          </div>
        </div>
      </div>

      {car.status === "processing" && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-blue-800 animate-pulse">
          Die KI liest und bewertet die Anzeige. Das dauert meist ein bis zwei Minuten, die Seite aktualisiert sich von selbst.
        </div>
      )}
      {car.status === "error" && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-800 text-sm">{car.error}</div>
      )}

      {e && (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            <section className="bg-white rounded-xl border border-slate-200 p-4 flex gap-4 items-start">
              <div className={`shrink-0 w-16 h-16 rounded-xl text-white flex flex-col items-center justify-center ${scoreColor(e.score)}`}>
                <div className="text-2xl font-bold leading-none">{e.score}</div>
                <div className="text-[10px] opacity-80">von 10</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Angebot (objektiv)</div>
                <div className="font-semibold">{e.verdict}</div>
                <p className="text-sm text-slate-700 mt-1">{e.summary}</p>
              </div>
            </section>
            <section className="bg-white rounded-xl border-2 border-blue-200 p-4 flex gap-4 items-start">
              <div className={`shrink-0 w-16 h-16 rounded-xl text-white flex flex-col items-center justify-center ${scoreColor(e.personal_fit?.score)}`}>
                <div className="text-2xl font-bold leading-none">{e.personal_fit?.score ?? "–"}</div>
                <div className="text-[10px] opacity-80">von 10</div>
              </div>
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Eignung für uns</div>
                {e.personal_fit ? (
                  <>
                    <div className="font-semibold">{e.personal_fit.verdict}</div>
                    <p className="text-sm text-slate-700 mt-1">{e.personal_fit.summary}</p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500 mt-1">
                    Noch nicht bewertet. <Link to="/profil" className="text-blue-700 underline">Profil</Link> prüfen und dann bewerten.
                  </p>
                )}
                <button
                  onClick={rateFit}
                  disabled={fitBusy || car.status !== "done"}
                  className="mt-2 text-xs text-blue-700 hover:underline disabled:opacity-40"
                >
                  {fitBusy ? "Wird bewertet … (ca. 1 Min.)" : e.personal_fit ? "↻ Eignung neu bewerten" : "Eignung jetzt bewerten"}
                </button>
              </div>
            </section>
          </div>

          {e.personal_fit && (
            <Section title="🐴 Passt es zu uns?">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium mb-1">Spricht dafür</div>
                  <Bullets items={e.personal_fit.strengths} icon="✓" />
                </div>
                <div>
                  <div className="text-sm font-medium mb-1">Spricht dagegen</div>
                  <Bullets items={e.personal_fit.concerns} icon="✗" />
                </div>
              </div>
              {e.personal_fit.checks.length > 0 && (
                <div className="mt-3">
                  <div className="text-sm font-medium mb-1">Für euren Einsatz konkret prüfen</div>
                  <Bullets items={e.personal_fit.checks} icon="→" />
                </div>
              )}
            </Section>
          )}

          {e.tow_hitch && (() => {
            const t = e.tow_hitch;
            const info = towHitchInfo(t.status)!;
            return (
              <section className={`rounded-xl border-2 p-4 ${info.cls}`}>
                <h2 className="font-semibold text-lg">🔗 {info.label}</h2>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm mt-1">
                  {t.type && <span>Bauart: <b>{t.type}</b></span>}
                  {t.max_trailer_load_kg != null && <span>Anhängelast gebremst: <b>{t.max_trailer_load_kg.toLocaleString("de-DE")} kg</b></span>}
                  {t.retrofit_cost_eur != null && <span>Nachrüstung ca.: <b>{euro(t.retrofit_cost_eur)}</b></span>}
                </div>
                {t.notes && <p className="text-sm mt-2">{t.notes}</p>}
              </section>
            );
          })()}

          {e.red_flags?.length > 0 && (
            <Section title="⚠️ Warnsignale" tone="red">
              <Bullets items={e.red_flags} icon="•" />
            </Section>
          )}

          <Section title={`💶 Preis: ${e.price_assessment.rating}`}>
            <p className="text-sm text-slate-700">{e.price_assessment.explanation}</p>
            {e.price_assessment.negotiation_target_eur != null && (
              <p className="text-sm mt-2">
                Verhandlungsziel: <span className="font-semibold">{euro(e.price_assessment.negotiation_target_eur)}</span>
              </p>
            )}
          </Section>

          <div className="grid md:grid-cols-2 gap-4">
            <Section title="👍 Vorteile"><Bullets items={e.pros} icon="✓" /></Section>
            <Section title="👎 Nachteile"><Bullets items={e.cons} icon="✗" /></Section>
          </div>

          <Section title="🔍 Checkliste für die Besichtigung">
            <Checklist car={car} />
          </Section>

          <div className="grid md:grid-cols-2 gap-4">
            <Section title="🔧 Bekannte Schwachstellen des Modells">
              <ul className="space-y-2 text-sm">
                {e.model_known_issues.map((k, i) => (
                  <li key={i}>
                    <span className="font-medium">{k.issue}</span>
                    <span className="block text-slate-500">{k.relevance}</span>
                  </li>
                ))}
              </ul>
            </Section>
            <div className="space-y-4">
              <Section title="📞 Fragen an den Verkäufer"><Bullets items={e.questions_for_seller} icon="?" /></Section>
              <Section title="📑 Unterlagen prüfen"><Bullets items={e.documents_to_check} icon="•" /></Section>
            </div>
          </div>
        </>
      )}

      <Section title="📝 Meine Notizen">
        <textarea
          value={notes}
          onChange={(ev) => { setNotes(ev.target.value); setSaved(false); }}
          onBlur={async () => { await update({ notes }); setSaved(true); }}
          rows={4}
          placeholder="z. B. Termin, Eindrücke von der Besichtigung, Telefonat …"
          className="w-full rounded-lg border border-slate-300 p-2 text-sm"
        />
        <div className="text-xs text-slate-400">{saved ? "gespeichert" : "wird beim Verlassen des Feldes gespeichert"}</div>
      </Section>

      {v?.equipment?.length ? (
        <Section title="Ausstattung laut Anzeige">
          <div className="flex flex-wrap gap-1.5">
            {v.equipment.map((x, i) => (
              <span key={i} className="text-xs bg-slate-100 rounded-full px-2 py-0.5">{x}</span>
            ))}
          </div>
        </Section>
      ) : null}

      {car.lat != null && car.lng != null && (
        <div className="h-64 rounded-xl overflow-hidden border border-slate-200">
          <MapContainer center={[car.lat, car.lng]} zoom={11} className="h-full w-full">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={[car.lat, car.lng]} icon={pin} />
          </MapContainer>
        </div>
      )}

      {car.raw?.images && car.raw.images.length > 1 && (
        <Section title="Weitere Bilder">
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {car.raw.images.slice(0, 20).map((src) => (
              <a key={src} href={src} target="_blank" rel="noreferrer">
                <img src={src} alt="" loading="lazy" className="w-full aspect-[4/3] object-cover rounded-lg" />
              </a>
            ))}
          </div>
        </Section>
      )}

      <p className="text-xs text-slate-400">
        Die KI-Bewertung ist eine Einschätzung auf Basis der Anzeige und ersetzt keine Gebrauchtwagenprüfung durch eine Werkstatt oder einen Gutachter.
      </p>
    </div>
  );
}
