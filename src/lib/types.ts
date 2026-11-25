export type ChecklistItem = { item: string; why: string };
export type KnownIssue = { issue: string; relevance: string };

export type TowHitchStatus = "vorhanden" | "nachrüstbar" | "nicht nachrüstbar" | "unklar";

export type TowHitch = {
  status: TowHitchStatus;
  type: string;
  max_trailer_load_kg: number | null;
  retrofit_cost_eur: number | null;
  notes: string;
};

export type Evaluation = {
  score: number;
  verdict: string;
  summary: string;
  price_assessment: { rating: string; explanation: string; negotiation_target_eur: number | null };
  pros: string[];
  cons: string[];
  model_known_issues: KnownIssue[];
  inspection_checklist: ChecklistItem[];
  questions_for_seller: string[];
  red_flags: string[];
  documents_to_check: string[];
  tow_hitch?: TowHitch;
};

export type Vehicle = {
  title: string;
  make: string | null;
  model: string | null;
  variant: string | null;
  price_eur: number | null;
  price_negotiable: boolean | null;
  first_registration: string | null;
  mileage_km: number | null;
  power_kw: number | null;
  power_ps: number | null;
  fuel: string | null;
  transmission: string | null;
  body_type: string | null;
  color: string | null;
  previous_owners: number | null;
  accident_free: boolean | null;
  service_history: string | null;
  hu_until: string | null;
  seller_name: string | null;
  seller_type: string | null;
  zip: string | null;
  city: string | null;
  street: string | null;
  country_code: string | null;
  equipment: string[];
};

export type Car = {
  id: string;
  created_at: string;
  status: "processing" | "done" | "error";
  error: string | null;
  source: string | null;
  url: string | null;
  pdf_path: string | null;
  image_url: string | null;
  title: string | null;
  make: string | null;
  model: string | null;
  price_eur: number | null;
  mileage_km: number | null;
  first_registration: string | null;
  power_ps: number | null;
  fuel: string | null;
  transmission: string | null;
  zip: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  vehicle: Vehicle | null;
  evaluation: Evaluation | null;
  raw: { images?: string[] } | null;
  notes: string | null;
  favorite: boolean;
  tow_hitch: TowHitchStatus | null;
};
