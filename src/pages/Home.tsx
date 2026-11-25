import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useCars } from "../lib/useCars";
import AddListing from "../components/AddListing";
import CarMap from "../components/CarMap";
import CarListItem from "../components/CarListItem";
import type { Car } from "../lib/types";
import { fillMissingLocations } from "../lib/geocode";

type SortKey = "neu" | "note" | "preis" | "km";

const sorters: Record<SortKey, (a: Car, b: Car) => number> = {
  neu: (a, b) => b.created_at.localeCompare(a.created_at),
  note: (a, b) => (b.evaluation?.score ?? -1) - (a.evaluation?.score ?? -1),
  preis: (a, b) => (a.price_eur ?? Infinity) - (b.price_eur ?? Infinity),
  km: (a, b) => (a.mileage_km ?? Infinity) - (b.mileage_km ?? Infinity),
};

export default function Home({ userId }: { userId: string }) {
  const { cars, loading } = useCars();

  // Fehlende Standorte im Browser nachtragen
  useEffect(() => {
    fillMissingLocations(cars);
  }, [cars]);
  const [hover, setHover] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("neu");
  const [onlyFav, setOnlyFav] = useState(false);
  const [ahkFilter, setAhkFilter] = useState<"alle" | "mit" | "mit_nachr">("alle");

  const shown = useMemo(
    () =>
      cars
        .filter((c) => !onlyFav || c.favorite)
        .filter((c) => {
          if (ahkFilter === "alle" || c.status !== "done") return true;
          if (ahkFilter === "mit") return c.tow_hitch === "vorhanden";
          return c.tow_hitch === "vorhanden" || c.tow_hitch === "nachrüstbar";
        })
        .sort(sorters[sort]),
    [cars, sort, onlyFav, ahkFilter],
  );

  return (
    <div className="h-full flex flex-col md:flex-row">
      <aside className="md:w-[400px] md:h-full flex flex-col border-r border-slate-200 bg-slate-50 order-2 md:order-1">
        <header className="flex items-center justify-between px-4 pt-4">
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <img src="/car.svg" alt="" className="w-6 h-6" /> Autosuche
          </h1>
          <button onClick={() => supabase.auth.signOut()} className="text-xs text-slate-500 hover:text-slate-800">
            Abmelden
          </button>
        </header>
        <div className="p-4 pb-2">
          <AddListing userId={userId} />
        </div>
        <div className="flex items-center gap-2 px-4 py-1 text-xs text-slate-600">
          <span>{shown.length} Fahrzeuge</span>
          <span className="flex-1" />
          <select
            value={ahkFilter}
            onChange={(e) => setAhkFilter(e.target.value as typeof ahkFilter)}
            className="border rounded px-1 py-0.5 bg-white"
            title="Anhängerkupplung"
          >
            <option value="alle">AHK: alle</option>
            <option value="mit">nur mit AHK</option>
            <option value="mit_nachr">mit oder nachrüstbar</option>
          </select>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} /> ⭐ nur Favoriten
          </label>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="border rounded px-1 py-0.5 bg-white">
            <option value="neu">Neueste</option>
            <option value="note">Beste KI-Note</option>
            <option value="preis">Preis ↑</option>
            <option value="km">Kilometer ↑</option>
          </select>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-1 space-y-2">
          {loading && <p className="text-sm text-slate-500">Lädt …</p>}
          {!loading && shown.length === 0 && (
            <p className="text-sm text-slate-500 py-6 text-center">Noch keine Fahrzeuge. Füge oben den ersten Link ein.</p>
          )}
          {shown.map((c) => (
            <CarListItem key={c.id} car={c} onHover={setHover} />
          ))}
        </div>
      </aside>
      <main className="h-[55vh] md:h-full md:flex-1 order-1 md:order-2">
        <CarMap cars={shown} focusId={hover} />
      </main>
    </div>
  );
}
