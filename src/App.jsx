// App.jsx - Root component
import { useState, useEffect } from "react";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";



export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
    if (currentUser) {
      setUser({
        name: currentUser.displayName || "Nurse",
        email: currentUser.email
      });
    } else {
      setUser(null);
    }
    setLoading(false);
  });

  return () => unsubscribe();
}, []);

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm font-medium tracking-widest uppercase">Initializing System</p>
      </div>
    </div>
  );

  return user
    ? <Dashboard user={user} onLogout={() => { localStorage.removeItem("iv_user"); setUser(null); }} />
    : <Login onLogin={(u) => { localStorage.setItem("iv_user", JSON.stringify(u)); setUser(u); }} />;
}
