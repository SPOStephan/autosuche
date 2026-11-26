import { supabase } from "./supabase";

/** Ruft die Edge Function auf und liefert verständliche Fehlermeldungen. */
export async function invokeAnalyze<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("analyze-listing", { body });
  if (!error) return data as T;

  const res = (error as { context?: Response }).context;
  let msg = "";
  try {
    msg = (await res?.clone().json())?.error ?? "";
  } catch { /* keine JSON-Antwort */ }

  if (res?.status === 401) {
    // Sitzung wurde beendet (z. B. Abmelden auf einem anderen Gerät) -> sauber neu anmelden lassen
    await supabase.auth.signOut({ scope: "local" });
    throw new Error("Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.");
  }
  throw new Error(msg || error.message);
}
