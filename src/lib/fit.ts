import { supabase } from "./supabase";
import { invokeAnalyze } from "./invoke";
import type { Car } from "./types";

// Gemeinsames Profil (eine Zeile für alle Mitglieder)
export async function loadProfileText(): Promise<string> {
  const { data } = await supabase.from("shared_settings").select("profile_text").eq("id", 1).maybeSingle();
  return data?.profile_text ?? "";
}

export async function saveProfileText(text: string) {
  const { error } = await supabase.from("shared_settings").upsert({ id: 1, profile_text: text });
  if (error) throw error;
}

/** Bewertet die persönliche Eignung eines bereits analysierten Autos (neu). */
export async function assessFit(carId: string): Promise<number> {
  const data = await invokeAnalyze<{ fit_score: number }>({ id: carId, fit_only: true });
  return data.fit_score;
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
