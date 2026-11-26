import { supabase } from "./supabase";
import type { Car } from "./types";

export async function loadProfileText(): Promise<string> {
  const { data } = await supabase.from("profiles").select("profile_text").maybeSingle();
  return data?.profile_text ?? "";
}

export async function saveProfileText(userId: string, text: string) {
  const { error } = await supabase.from("profiles").upsert({ user_id: userId, profile_text: text });
  if (error) throw error;
}

/** Bewertet die persönliche Eignung eines bereits analysierten Autos (neu). */
export async function assessFit(carId: string): Promise<number> {
  const { data, error } = await supabase.functions.invoke("analyze-listing", { body: { id: carId, fit_only: true } });
  if (error) {
    let msg = error.message;
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) msg = body.error;
    } catch { /* Standardmeldung */ }
    throw new Error(msg);
  }
  return data.fit_score as number;
}

/** Mehrere Autos nacheinander bewerten (je 2 gleichzeitig). */
export async function assessMany(
  cars: Car[],
  onProgress: (done: number, total: number, failed: number) => void,
) {
  const queue = cars.filter((c) => c.status === "done");
  let done = 0;
  let failed = 0;
  onProgress(0, queue.length, 0);
  const worker = async () => {
    while (queue.length) {
      const car = queue.shift()!;
      try {
        await assessFit(car.id);
      } catch (e) {
        console.warn("Eignung fehlgeschlagen", car.id, e);
        failed++;
      }
      done++;
      onProgress(done, done + queue.length, failed);
    }
  };
  await Promise.all([worker(), worker()]);
}
