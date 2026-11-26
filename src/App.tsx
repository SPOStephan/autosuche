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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <div className="p-8 text-slate-500">Lädt …</div>;
  if (!session) return <Login />;

  return (
    <Routes>
      <Route path="/" element={<Home userId={session.user.id} />} />
      <Route path="/auto/:id" element={<CarDetail />} />
      <Route path="/profil" element={<Profile userId={session.user.id} />} />
    </Routes>
  );
}
