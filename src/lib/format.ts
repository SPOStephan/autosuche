const nf = new Intl.NumberFormat("de-DE");

export const euro = (n: number | null | undefined) => (n == null ? "–" : `${nf.format(n)} €`);
export const km = (n: number | null | undefined) => (n == null ? "–" : `${nf.format(n)} km`);

export function scoreColor(score: number | undefined | null) {
  if (score == null) return "bg-slate-400";
  if (score >= 8) return "bg-emerald-600";
  if (score >= 6) return "bg-lime-600";
  if (score >= 4) return "bg-amber-500";
  return "bg-red-600";
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function towHitchInfo(status: string | null | undefined) {
  switch (status) {
    case "vorhanden":
      return { short: "AHK ✓", label: "Anhängerkupplung vorhanden", cls: "bg-emerald-100 text-emerald-800 border-emerald-300", color: "#059669" };
    case "nachrüstbar":
      return { short: "AHK nachrüstbar", label: "Keine AHK – nachrüstbar", cls: "bg-amber-100 text-amber-800 border-amber-300", color: "#d97706" };
    case "nicht nachrüstbar":
      return { short: "keine AHK ✗", label: "Keine AHK – NICHT nachrüstbar", cls: "bg-red-100 text-red-800 border-red-300", color: "#dc2626" };
    case "unklar":
      return { short: "AHK ?", label: "Anhängerkupplung unklar", cls: "bg-slate-100 text-slate-700 border-slate-300", color: "#64748b" };
    default:
      return null;
  }
}
