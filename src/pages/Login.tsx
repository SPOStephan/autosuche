import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError("Anmeldung fehlgeschlagen. E-Mail oder Passwort falsch?");
    setBusy(false);
  }

  return (
    <div className="min-h-full flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow p-6 space-y-4">
        <div className="text-center">
          <img src="/car.svg" alt="" className="w-10 h-10 mx-auto" />
          <h1 className="text-xl font-semibold mt-2">Autosuche</h1>
          <p className="text-sm text-slate-500">Bitte anmelden</p>
        </div>
        <input
          type="email" required autoComplete="email" placeholder="E-Mail" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        <input
          type="password" required autoComplete="current-password" placeholder="Passwort" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-blue-700 text-white py-2 font-medium disabled:opacity-50">
          {busy ? "…" : "Anmelden"}
        </button>
      </form>
    </div>
  );
}
