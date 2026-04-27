// src/pages/Dashboard.jsx
import { useState, useEffect } from "react";
import { ref, onValue } from "firebase/database";
import { signOut } from "firebase/auth";
import { database, auth } from "../firebase";

// ─── ICONS ────────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const icons = {
  dashboard: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
  logout:    "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  bell:      "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0",
  drip:      "M12 2v6 M8 6s0 2 4 2 4-2 4-2 M7 14c0 3.31 2.24 6 5 6s5-2.69 5-6c0-3-5-9-5-9S7 11 7 14z",
  warn:      "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01",
  check:     "M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3",
  menu:      "M3 12h18 M3 6h18 M3 18h18",
  bed:       "M3 9l2-2h14l2 2v8H3V9z M3 17v2 M21 17v2 M7 9V7 M17 9V7 M12 9V7",
  activity:  "M22 12h-4l-3 9L9 3l-3 9H2",
  wifi:      "M1 6s4-4 11-4 11 4 11 4 M5 10s2.5-2.5 7-2.5 7 2.5 7 2.5 M9 14s1-1 3-1 3 1 3 1 M12 18h.01",
};

// ─── LOGOUT CONFIRM MODAL ─────────────────────────────────────────────────────
function LogoutModal({ onConfirm, onCancel, loading }) {
  return (
    <div
      style={{ minHeight: "100vh", background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}
      className="fixed inset-0 z-50 backdrop-blur-sm"
      onClick={onCancel}>
      <div
        className="bg-white border border-slate-300 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-rose-100 border border-rose-200 mx-auto mb-4">
          <Icon d={icons.logout} size={20} />
        </div>
        <h2 className="text-slate-900 font-bold text-center text-base mb-1">Sign out?</h2>
        <p className="text-slate-600 text-sm text-center mb-6">
          You will be returned to the login screen. Active alerts will continue to be monitored.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-all disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {loading
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Signing out...</>
              : <><Icon d={icons.logout} size={14} /> Sign out</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EMPTY STATE ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <div className="w-14 h-14 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center">
        <Icon d={icons.wifi} size={22} />
      </div>
      <p className="text-slate-800 font-semibold text-sm">No bed data found</p>
      <p className="text-slate-500 text-xs max-w-xs">
        No beds are currently reporting. Check your Firebase database path or ensure your ESP32 devices are online and sending data.
      </p>
    </div>
  );
}

// ─── SPARKLINE ────────────────────────────────────────────────────────────────
function Sparkline({ data, color = "#0891b2", width = 100, height = 40 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── LINE CHART ───────────────────────────────────────────────────────────────
function LineChart({ history, bedIds }) {
  const W = 600, H = 220, padL = 40, padB = 30, padT = 16, padR = 16;
  const chartW = W - padL - padR, chartH = H - padB - padT;
  const max = 520;
  const colors = ["#0891b2", "#f43f5e", "#7c3aed", "#059669", "#ea580c", "#4f46e5"];
  const yTicks = [0, 100, 200, 300, 400, 500];
  const x = (i, total) => padL + (i / Math.max(total - 1, 1)) * chartW;
  const y = (v) => padT + chartH - (v / max) * chartH;

  const hasHistory = bedIds.some(id => (history[id] ?? []).length >= 2);
  if (!hasHistory) return (
    <div className="flex items-center justify-center h-32 text-slate-500 text-xs">
      History will appear as the ESP32 devices send more readings...
    </div>
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {yTicks.map(t => (
        <g key={t}>
          <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke="#cbd5e1" strokeWidth="1" />
          <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#64748b">{t}</text>
        </g>
      ))}
      {bedIds.slice(0, 6).map((bedId, bi) => {
        const readings = history[bedId] ?? [];
        if (readings.length < 2) return null;
        const pts = readings.map((v, i) => `${x(i, readings.length)},${y(v)}`).join(" ");
        return (
          <g key={bedId}>
            <polyline points={pts} fill="none" stroke={colors[bi]} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <rect x={W - 90} y={padT + bi * 20} width="12" height="4" rx="2" fill={colors[bi]} />
            <text x={W - 74} y={padT + bi * 20 + 5} fontSize="10" fill="#334155">
              {bedId.replace("bed", "Bed ")}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── BAR CHART ────────────────────────────────────────────────────────────────
function BarChart({ beds }) {
  const entries = Object.entries(beds);
  const W = 400, H = 200, padL = 36, padB = 36, padT = 12, padR = 12;
  const chartW = W - padL - padR, chartH = H - padB - padT;
  const barW = Math.min(32, (chartW / entries.length) - 8);
  const max = 500;
  const getColor = (b) => b.status === "LOW" ? "#f43f5e" : "#0891b2";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {[0, 100, 200, 300, 400, 500].map(t => {
        const yy = padT + chartH - (t / max) * chartH;
        return (
          <g key={t}>
            <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="#cbd5e1" strokeWidth="1" />
            <text x={padL - 4} y={yy + 4} textAnchor="end" fontSize="9" fill="#64748b">{t}</text>
          </g>
        );
      })}
      {entries.map(([id, b], i) => {
        const bx = padL + (i / entries.length) * chartW + (chartW / entries.length - barW) / 2;
        const bh = ((b.weight ?? 0) / max) * chartH;
        const by = padT + chartH - bh;
        return (
          <g key={id}>
            <rect x={bx} y={by} width={barW} rx="4" height={bh} fill={getColor(b)} opacity="0.85" />
            <text x={bx + barW / 2} y={H - padB + 14} textAnchor="middle" fontSize="9" fill="#475569">
              {id.replace("bed", "B")}
            </text>
            <text x={bx + barW / 2} y={by - 4} textAnchor="middle" fontSize="9" fill={getColor(b)}>
              {Math.round(b.weight ?? 0)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── BED CARD ─────────────────────────────────────────────────────────────────
function BedCard({ id, data, index, weightHistory }) {
  const isLow    = data.status === "LOW";
  const capacity = data.capacity ?? 500;
  const weight   = data.weight ?? 0;
  const pct      = Math.round((weight / capacity) * 100);

  return (
    <div
      className={`relative rounded-2xl border p-5 flex flex-col gap-3 transition-all duration-300 hover:-translate-y-0.5 ${
        isLow
          ? "bg-rose-50 border-rose-300 shadow-lg shadow-rose-100"
          : "bg-white border-slate-300 shadow-lg shadow-slate-100"
      }`}
      style={{ animationDelay: `${index * 60}ms` }}>

      {isLow && (
        <div className="absolute -top-px left-4 right-4 h-0.5 rounded-b bg-gradient-to-r from-transparent via-rose-400 to-transparent" />
      )}

      <div className="flex items-start justify-between">
        <div>
          {/* Bed label — bumped up from slate-400 to slate-500 */}
          <p className="text-xs font-semibold tracking-widest text-slate-500 uppercase">
            {id.replace("bed", "Bed ")}
          </p>
          {/* Patient name — was slate-800, keeping it strong */}
          <p className="text-slate-900 font-semibold mt-0.5 text-sm">{data.patient ?? "Unknown Patient"}</p>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tracking-wide ${
          isLow ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isLow ? "bg-rose-500 animate-pulse" : "bg-emerald-500"}`} />
          {data.status ?? "UNKNOWN"}
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div>
          {/* Big weight number */}
          <p className="text-3xl font-bold text-slate-900 tabular-nums">
            {Math.round(weight)}<span className="text-base text-slate-500 font-normal ml-1">ml</span>
          </p>
          {/* "% remaining" — was slate-400, bumped to slate-500 */}
          <p className="text-xs text-slate-500 mt-0.5">{pct}% remaining</p>
        </div>
        {weightHistory && weightHistory.length >= 2 && (
          <Sparkline data={weightHistory} color={isLow ? "#f43f5e" : "#0891b2"} />
        )}
      </div>

      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${
            isLow ? "bg-gradient-to-r from-rose-500 to-rose-400" : "bg-gradient-to-r from-cyan-600 to-cyan-400"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {isLow && (
        <div className="flex items-center gap-2 bg-rose-100 border border-rose-300 rounded-lg px-3 py-2">
          <Icon d={icons.warn} size={14} />
          {/* Alert text — rose-700 instead of rose-600 for better contrast */}
          <span className="text-rose-700 text-xs font-medium">IV level critically low — replace bottle</span>
        </div>
      )}

      {data.lastUpdate && (
        /* Last update timestamp — was [10px] slate-400, bumped to slate-500 */
        <p className="text-slate-500 text-[10px]">
          Last update:{" "}
          {new Date(data.lastUpdate * 1000).toLocaleTimeString([], {
            hour: "2-digit", minute: "2-digit", second: "2-digit",
          })}
        </p>
      )}
    </div>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function Sidebar({ activeTab, onTab, onLogoutRequest, open, onClose }) {
  const nav = [{ id: "dashboard", label: "Dashboard", icon: icons.dashboard }];
  return (
    <>
      {open && <div className="fixed inset-0 bg-black/30 z-20 lg:hidden" onClick={onClose} />}
      <aside className={`fixed left-0 top-0 h-screen z-30 w-64 bg-white border-r border-slate-300 flex flex-col transition-transform duration-300 ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:static lg:z-auto lg:h-auto lg:flex`}>
        <div className="px-6 py-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <Icon d={icons.drip} size={16} />
            </div>
            <div>
              {/* App name — slate-900 for max contrast */}
              <p className="text-slate-900 font-bold text-sm leading-tight">IV Monitor</p>
              {/* Subtitle — bumped from slate-400 to slate-500 */}
              <p className="text-slate-500 text-xs">Healthcare System</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(n => (
            <button key={n.id} onClick={() => { onTab(n.id); onClose(); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === n.id
                  ? "bg-cyan-50 text-cyan-700 border border-cyan-200"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}>
              <Icon d={n.icon} size={16} />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="px-3 pb-6">
          <button
            onClick={() => { onClose(); onLogoutRequest(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:text-rose-700 hover:bg-rose-50 transition-all">
            <Icon d={icons.logout} size={16} />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}

// ─── NAVBAR ───────────────────────────────────────────────────────────────────
function Navbar({ user, alerts, onMenuToggle, onLogoutRequest }) {
  return (
    <header className="h-16 bg-white/90 backdrop-blur border-b border-slate-300 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <button onClick={onMenuToggle} className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
          <Icon d={icons.menu} size={20} />
        </button>
        <div>
          {/* Main heading — slate-900 */}
          <h1 className="text-slate-900 font-bold text-base leading-tight">IV Drip Monitoring System</h1>
          {/* Subtitle — slate-500 instead of slate-400 */}
          <p className="text-slate-500 text-xs hidden sm:block">Real-time patient IV tracking</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {alerts > 0 && (
          <div className="relative">
            <button className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors">
              <Icon d={icons.bell} size={20} />
            </button>
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-rose-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
              {alerts}
            </span>
          </div>
        )}
        <button
          onClick={onLogoutRequest}
          className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-full transition-all group border border-slate-200">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-[10px] font-bold">
            {user?.name?.[0] ?? "N"}
          </div>
          {/* Username text — slate-700 instead of slate-600 */}
          <span className="text-slate-700 text-xs font-medium hidden sm:block group-hover:text-slate-900 transition-colors">
            {user?.name ?? "Nurse"}
          </span>
          <Icon d={icons.logout} size={12} />
        </button>
      </div>
    </header>
  );
}

// ─── ALERTS PANEL ─────────────────────────────────────────────────────────────
function AlertsPanel({ beds }) {
  const alerts = Object.entries(beds).filter(([, b]) => b.status === "LOW");
  return (
    <div className="bg-white border border-slate-300 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Icon d={icons.warn} size={16} />
        {/* Section heading — slate-900 */}
        <h3 className="text-slate-900 font-semibold text-sm">Active Alerts</h3>
        {alerts.length > 0 && (
          <span className="ml-auto px-2 py-0.5 bg-rose-500 text-white text-xs font-bold rounded-full animate-pulse">
            {alerts.length}
          </span>
        )}
      </div>
      {alerts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
            <Icon d={icons.check} size={18} />
          </div>
          <p className="text-emerald-700 text-sm font-medium">All clear</p>
          <p className="text-slate-500 text-xs">No active alerts at this time</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map(([id, b]) => (
            <div key={id} className="flex items-center gap-3 bg-rose-50 border border-rose-300 rounded-xl px-3 py-2.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse flex-shrink-0" />
              <div className="flex-1 min-w-0">
                {/* Alert bed/patient — rose-800 for sharp contrast */}
                <p className="text-rose-800 text-xs font-semibold">
                  {id.replace("bed", "Bed ")} — {b.patient ?? "Unknown"}
                </p>
                {/* Alert detail — rose-600 */}
                <p className="text-rose-600 text-xs truncate">
                  IV critically low: {Math.round(b.weight ?? 0)}ml remaining
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── STATS ROW ────────────────────────────────────────────────────────────────
function StatsRow({ beds }) {
  const total  = Object.keys(beds).length;
  const low    = Object.values(beds).filter(b => b.status === "LOW").length;
  const avgPct = total > 0
    ? Math.round(Object.values(beds).reduce((s, b) => s + (b.weight ?? 0) / (b.capacity ?? 500), 0) / total * 100)
    : 0;
  const stats = [
    { label: "Total Beds",    value: total,       color: "text-cyan-700",    bg: "bg-cyan-50 border-cyan-200"      },
    { label: "Active Alerts", value: low,          color: "text-rose-700",    bg: "bg-rose-50 border-rose-200"      },
    { label: "Avg IV Level",  value: avgPct + "%", color: "text-violet-700",  bg: "bg-violet-50 border-violet-200"  },
    { label: "Normal",        value: total - low,  color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200"},
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map(s => (
        <div key={s.label} className={`${s.bg} border rounded-2xl p-4 flex flex-col gap-1`}>
          {/* Stat label — slate-600 instead of slate-500 */}
          <p className="text-slate-600 text-xs font-medium">{s.label}</p>
          <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export default function Dashboard({ user, onLogout }) {
  const [beds, setBeds]                   = useState({});
  const [weightHistory, setWeightHistory] = useState({});
  const [tab, setTab]                     = useState("dashboard");
  const [sidebarOpen, setSidebarOpen]     = useState(false);
  const [loading, setLoading]             = useState(true);
  const [dbError, setDbError]             = useState("");

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [logoutLoading, setLogoutLoading]     = useState(false);
  const [logoutError, setLogoutError]         = useState("");

  useEffect(() => {
    const bedsRef = ref(database, "wards/ward1/beds");
    const unsub = onValue(
      bedsRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          setBeds(data);
          setWeightHistory(prev => {
            const updated = { ...prev };
            Object.entries(data).forEach(([id, b]) => {
              const current = updated[id] ?? [];
              updated[id] = [...current, b.weight ?? 0].slice(-12);
            });
            return updated;
          });
        } else {
          setBeds({});
        }
        setDbError("");
        setLoading(false);
      },
      (error) => {
        console.error("Firebase error:", error);
        setDbError(error.message ?? "Unable to reach the database.");
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const handleLogoutConfirm = async () => {
    setLogoutLoading(true);
    setLogoutError("");
    try {
      await signOut(auth);
      onLogout();
    } catch (err) {
      console.error("Logout error:", err);
      setLogoutError("Sign-out failed. Please try again.");
      setLogoutLoading(false);
    }
  };

  const alertCount = Object.values(beds).filter(b => b.status === "LOW").length;
  const bedIds     = Object.keys(beds);

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-600 text-sm tracking-widest uppercase">Loading patient data...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">

      {showLogoutModal && (
        <LogoutModal
          onConfirm={handleLogoutConfirm}
          onCancel={() => { setShowLogoutModal(false); setLogoutError(""); }}
          loading={logoutLoading}
        />
      )}

      {logoutError && (
        <div className="fixed bottom-4 right-4 z-50 bg-rose-50 border border-rose-300 text-rose-700 text-xs px-4 py-3 rounded-xl shadow-xl">
          {logoutError}
        </div>
      )}

      <Sidebar
        activeTab={tab}
        onTab={setTab}
        onLogoutRequest={() => setShowLogoutModal(true)}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          user={user}
          alerts={alertCount}
          onMenuToggle={() => setSidebarOpen(o => !o)}
          onLogoutRequest={() => setShowLogoutModal(true)}
        />

        <main className="flex-1 p-4 lg:p-6 space-y-5 overflow-auto">

          {dbError && (
            <div className="flex items-center gap-3 bg-rose-50 border border-rose-300 rounded-2xl px-4 py-3">
              <Icon d={icons.warn} size={16} />
              <p className="text-rose-700 text-sm">Database error: {dbError}</p>
            </div>
          )}

          {bedIds.length > 0 && <StatsRow beds={beds} />}

          <div>
            <h2 className="text-slate-700 font-semibold text-sm mb-3 flex items-center gap-2">
              <Icon d={icons.bed} size={14} />
              Patient Beds
            </h2>
            {bedIds.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {bedIds.map((id, i) => (
                  <BedCard
                    key={id}
                    id={id}
                    data={beds[id]}
                    index={i}
                    weightHistory={weightHistory[id]}
                  />
                ))}
              </div>
            )}
          </div>

          {bedIds.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 space-y-5">
                <div className="bg-white border border-slate-300 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <Icon d={icons.activity} size={16} />
                    <h3 className="text-slate-900 font-semibold text-sm">IV Level Over Time (ml)</h3>
                    <span className="ml-auto text-xs text-slate-500">Last 12 readings</span>
                  </div>
                  <LineChart history={weightHistory} bedIds={bedIds} />
                </div>
                <div className="bg-white border border-slate-300 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <Icon d={icons.activity} size={16} />
                    <h3 className="text-slate-900 font-semibold text-sm">Current IV Level by Bed (ml)</h3>
                  </div>
                  <BarChart beds={beds} />
                </div>
              </div>
              <AlertsPanel beds={beds} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}