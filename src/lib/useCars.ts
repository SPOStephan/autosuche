import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Car } from "./types";

export function useCars() {
  const [cars, setCars] = useState<Car[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from("cars").select("*").order("created_at", { ascending: false });
    setCars((data as Car[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("cars-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "cars" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  return { cars, loading, reload: load };
}

export function useCar(id: string | undefined) {
  const [car, setCar] = useState<Car | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from("cars").select("*").eq("id", id).maybeSingle();
    setCar((data as Car) ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    if (!id) return;
    const ch = supabase
      .channel(`car-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "cars", filter: `id=eq.${id}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, load]);

  return { car, loading, reload: load, setCar };
}
