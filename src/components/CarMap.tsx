import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import { useNavigate } from "react-router-dom";
import type { Car } from "../lib/types";
import { escapeHtml, euro, km, towHitchInfo } from "../lib/format";

function icon(car: Car) {
  const img = car.image_url
    ? `<img src="${escapeHtml(car.image_url)}" alt="" loading="lazy" />`
    : "🚗";
  const cls = ["car-marker", car.favorite ? "fav" : "", car.status === "processing" ? "processing" : ""].join(" ");
  const ahk = towHitchInfo(car.tow_hitch);
  const ahkHtml = ahk ? `<div class="ahk" style="background:${ahk.color}">${escapeHtml(ahk.short)}</div>` : "";
  return L.divIcon({
    className: "",
    html: `<div class="${cls}"><div class="thumb">${img}</div><div class="price">${escapeHtml(euro(car.price_eur))}</div>${ahkHtml}</div>`,
    iconSize: [84, 90],
    iconAnchor: [42, 90],
    tooltipAnchor: [0, -90],
  });
}

function FitBounds({ cars, focusId }: { cars: Car[]; focusId?: string | null }) {
  const map = useMap();
  const key = cars.map((c) => c.id).join(",");
  useEffect(() => {
    const focus = cars.find((c) => c.id === focusId);
    if (focus) {
      map.panTo([focus.lat!, focus.lng!]);
      return;
    }
    if (cars.length === 0) return;
    const b = L.latLngBounds(cars.map((c) => [c.lat!, c.lng!] as [number, number]));
    map.fitBounds(b, { padding: [60, 60], maxZoom: 11 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, focusId]);
  return null;
}

export default function CarMap({ cars, focusId }: { cars: Car[]; focusId?: string | null }) {
  const navigate = useNavigate();
  const located = useMemo(() => cars.filter((c) => c.lat != null && c.lng != null), [cars]);

  return (
    <MapContainer center={[51.1657, 10.4515]} zoom={6} className="h-full w-full" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds cars={located} focusId={focusId} />
      {located.map((car) => (
        <Marker
          key={car.id}
          position={[car.lat!, car.lng!]}
          icon={icon(car)}
          eventHandlers={{ click: () => navigate(`/auto/${car.id}`) }}
        >
          <Tooltip direction="top" offset={[0, -4]}>
            <div className="font-semibold">{car.title}</div>
            <div>
              {euro(car.price_eur)} · {km(car.mileage_km)} · {car.first_registration ?? "–"}
            </div>
            {car.evaluation && <div>KI-Note: {car.evaluation.score}/10</div>}
            {towHitchInfo(car.tow_hitch) && <div>{towHitchInfo(car.tow_hitch)!.label}</div>}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
