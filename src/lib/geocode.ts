// Standortsuche im Browser (Fallback, falls der Server keinen Standort ermitteln konnte).
import { supabase } from "./supabase";
import type { Car } from "./types";

async function lookup(q: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, countrycodes: "de,at,ch,nl,be,lu,fr,it,pl,cz,dk", format: "json", limit: "1" })}`,
      { headers: { "Accept-Language": "de" } },
    );
    if (r.ok) {
      const hits = await r.json();
      if (hits?.[0]) return { lat: Number(hits[0].lat), lng: Number(hits[0].lon) };
    }
  } catch { /* weiter mit Photon */ }
  try {
    const r = await fetch(`https://photon.komoot.io/api/?${new URLSearchParams({ q, limit: "1", lang: "de" })}`);
    if (r.ok) {
      const c = (await r.json())?.features?.[0]?.geometry?.coordinates;
      if (Array.isArray(c)) return { lat: Number(c[1]), lng: Number(c[0]) };
    }
  } catch { /* nichts gefunden */ }
  return null;
}

const tried = new Set<string>();

/** Sucht für fertig analysierte Autos ohne Koordinaten den Standort und speichert ihn. */
export async function fillMissingLocations(cars: Car[]) {
  for (const car of cars) {
    if (car.status !== "done" || car.lat != null || tried.has(car.id)) continue;
    const street = car.vehicle?.street;
    const queries = [
      street && (car.zip || car.city) ? [street, car.zip, car.city].filter(Boolean).join(", ") : null,
      car.zip || car.city ? [car.zip, car.city].filter(Boolean).join(" ") : null,
    ].filter((q): q is string => !!q);
    if (!queries.length) continue;
    tried.add(car.id);
    for (const q of queries) {
      const hit = await lookup(q);
      if (hit) {
        await supabase.from("cars").update({ lat: hit.lat, lng: hit.lng }).eq("id", car.id);
        break;
      }
      await new Promise((r) => setTimeout(r, 1100));
    }
  }
}
