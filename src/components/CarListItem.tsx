import { Link } from "react-router-dom";
import type { Car } from "../lib/types";
import { euro, km, scoreColor } from "../lib/format";

export default function CarListItem({ car, onHover }: { car: Car; onHover?: (id: string | null) => void }) {
  return (
    <Link
      to={`/auto/${car.id}`}
      onMouseEnter={() => onHover?.(car.id)}
      onMouseLeave={() => onHover?.(null)}
      className="flex gap-3 bg-white rounded-xl border border-slate-200 p-2 hover:border-blue-400 hover:shadow-sm transition"
    >
      <div className="w-24 h-16 shrink-0 rounded-lg overflow-hidden bg-slate-200 flex items-center justify-center text-2xl">
        {car.image_url ? <img src={car.image_url} alt="" className="w-full h-full object-cover" /> : "🚗"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="font-medium text-sm leading-snug line-clamp-2 flex-1">
            {car.favorite && "⭐ "}
            {car.title ?? "Unbenannt"}
          </div>
          {car.status === "done" && car.evaluation && (
            <span className={`shrink-0 text-white text-xs font-bold rounded-md px-1.5 py-0.5 ${scoreColor(car.evaluation.score)}`}>
              {car.evaluation.score}
            </span>
          )}
        </div>
        {car.status === "processing" && <div className="text-xs text-blue-700 mt-1 animate-pulse">KI analysiert …</div>}
        {car.status === "error" && <div className="text-xs text-red-600 mt-1 line-clamp-2">{car.error}</div>}
        {car.status === "done" && (
          <div className="text-xs text-slate-500 mt-1">
            <span className="font-semibold text-slate-800">{euro(car.price_eur)}</span> · {km(car.mileage_km)} ·{" "}
            {car.first_registration ?? "–"}
            {car.city && <> · {car.city}</>}
            {car.lat == null && <span className="text-amber-600"> · kein Standort</span>}
          </div>
        )}
      </div>
    </Link>
  );
}
