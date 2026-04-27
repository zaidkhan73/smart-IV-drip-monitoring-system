// src/pages/Login.jsx
import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";

export default function Login({ onLogin }) {
  const [email, setEmail]     = useState("");
  const [pass, setPass]       = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      onLogin({ name: cred.user.displayName || "Nurse", email: cred.user.email });
    } catch (err) {
      setError(err.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">

      {/* Subtle background grid — light version */}
      <div className="fixed inset-0 opacity-[0.04]" style={{
        backgroundImage: "linear-gradient(#0891b2 1px, transparent 1px), linear-gradient(90deg, #0891b2 1px, transparent 1px)",
        backgroundSize: "40px 40px"
      }} />

      <div className="w-full max-w-sm relative">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 items-center justify-center mb-4 shadow-xl shadow-cyan-200">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v6 M8 6s0 2 4 2 4-2 4-2 M7 14c0 3.31 2.24 6 5 6s5-2.69 5-6c0-3-5-9-5-9S7 11 7 14z" />
            </svg>
          </div>
          {/* Title — slate-900 for strong contrast on light bg */}
          <h1 className="text-2xl font-bold text-slate-900">IV Monitor</h1>
          {/* Subtitle — slate-500 */}
          <p className="text-slate-500 text-sm mt-1">Healthcare Dashboard — Sign in</p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleLogin}
          className="bg-white border border-slate-300 rounded-2xl p-6 space-y-4 shadow-lg shadow-slate-200"
        >
          <div className="space-y-2">
            {/* Label — slate-600 */}
            <label className="text-slate-600 text-xs font-semibold tracking-wide uppercase">Email</label>
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="nurse@hospital.com"
              className="w-full bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-500 transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-slate-600 text-xs font-semibold tracking-wide uppercase">Password</label>
            <input
              type="password" required value={pass} onChange={e => setPass(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-500 transition-all"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-300 rounded-xl px-3 py-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />
              {/* Error text — rose-700 for readable contrast */}
              <p className="text-rose-700 text-xs">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold py-3 rounded-xl text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md shadow-cyan-200"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Signing in...
              </>
            ) : "Sign In"}
          </button>

          {/* Footer hint — slate-500 */}
          <p className="text-center text-slate-500 text-xs pt-2">
            Demo: any email + 4+ char password
          </p>
        </form>
      </div>
    </div>
  );
}