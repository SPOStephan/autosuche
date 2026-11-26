import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import Login from "./pages/Login";
import Home from "./pages/Home";
import CarDetail from "./pages/CarDetail";
import Profile from "./pages/Profile";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [member, setMember] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    setMember(undefined);
    supabase
      .from("members")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setMember(!!data));
  }, [session?.user.id]);

  if (session === undefined) return <div className="p-8 text-slate-500">Lädt …</div>;
  if (!session) return <Login />;
  if (member === undefined) return <div className="p-8 text-slate-500">Lädt …</div>;
  if (!member) {
    return (
      <div className="p-8 max-w-md mx-auto text-center space-y-3">
        <p className="font-medium">Dieses Konto ist (noch) nicht freigeschaltet.</p>
        <p className="text-sm text-slate-500">{session.user.email}</p>
        <button onClick={() => supabase.auth.signOut()} className="text-sm text-blue-700 underline">Abmelden</button>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Home userId={session.user.id} />} />
      <Route path="/auto/:id" element={<CarDetail />} />
      <Route path="/profil" element={<Profile />} />
    </Routes>
  );
}
