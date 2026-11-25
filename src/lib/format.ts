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
