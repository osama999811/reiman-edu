import { useState, useEffect, useCallback, useRef } from "react";

// ============================================================
// SUPABASE CLIENT
// ============================================================
const createSupabaseClient = (url, key) => {
  const headers = {
    "Content-Type": "application/json",
    "apikey": key,
    "Authorization": `Bearer ${key}`,
  };

  const from = (table) => ({
    select: async (cols = "*") => {
      const res = await fetch(`${url}/rest/v1/${table}?select=${cols}`, { headers });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    upsert: async (data) => {
      const res = await fetch(`${url}/rest/v1/${table}`, {
        method: "POST",
        headers: { ...headers, "Prefer": "resolution=merge-duplicates" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.status === 204 ? [] : res.json().catch(() => []);
    },
    insert: async (data) => {
      const res = await fetch(`${url}/rest/v1/${table}`, {
        method: "POST",
        headers: { ...headers, "Prefer": "return=representation" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    update: async (data, match) => {
      const params = Object.entries(match).map(([k, v]) => `${k}=eq.${v}`).join("&");
      const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
        method: "PATCH",
        headers: { ...headers, "Prefer": "return=representation" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    delete: async (match) => {
      const params = Object.entries(match).map(([k, v]) => `${k}=eq.${v}`).join("&");
      const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error(await res.text());
      return true;
    },
  });

  // Realtime channel
  const channel = (name) => {
    let wsRef = null;
    let listeners = [];
    return {
      on: (event, filter, cb) => { listeners.push({ event, filter, cb }); return { subscribe: () => {} }; },
      subscribe: () => {},
    };
  };

  return { from, channel };
};

// ============================================================
// CONSTANTS & DATA
// ============================================================
const INITIAL_DATA = {
  teachers: [
    { id: "t1", name: "أ. محمود علي", subject: "رياضيات", phone: "0501234567", email: "mahmoud@reiman.edu", code: "TCH001", status: "active" },
    { id: "t2", name: "أ. سارة محمد", subject: "علوم", phone: "0507654321", email: "sara@reiman.edu", code: "TCH002", status: "active" },
  ],
  students: [
    { id: "s1", name: "محمد أحمد", grade: "الصف الثالث", teacherId: "t1", fees: 5000, paidFees: 3000, code: "STD001", status: "active" },
    { id: "s2", name: "فاطمة علي", grade: "الصف الرابع", teacherId: "t2", fees: 5000, paidFees: 5000, code: "STD002", status: "active" },
  ],
  messages: [],
  attendance: [],
  teacher_attendance: [],
  ratings: [],
  sessions: [],
  notifications: [],
  files: [],
  settings: {
    schoolName: "ريمان للتعليم الخاص",
    logo: "🎓",
    primaryColor: "#1a56db",
    accentColor: "#f59e0b",
    siteActive: true,
    announcement: "مرحباً بكم في نظام ريمان التعليمي!",
  },
  admins: [{ id: "adm1", name: "مدير النظام", code: "ADM001" }],
  supabaseUrl: "",
  supabaseKey: "",
};

// ============================================================
// LOCAL STORAGE (FALLBACK)
// ============================================================
const getLocalDB = () => {
  try {
    const raw = localStorage.getItem("reiman_db");
    return raw ? { ...INITIAL_DATA, ...JSON.parse(raw) } : INITIAL_DATA;
  } catch { return INITIAL_DATA; }
};
const saveLocalDB = (db) => {
  try { localStorage.setItem("reiman_db", JSON.stringify(db)); } catch {}
};

// ============================================================
// SUPABASE SYNC ENGINE
// Stores entire DB as a single JSON row in a "reiman_store" table
// Table schema: id TEXT PRIMARY KEY, data JSONB
// ============================================================
const STORE_KEY = "main";

const loadFromSupabase = async (client) => {
  try {
    const rows = await client.from("reiman_store").select("*");
    const row = rows.find(r => r.id === STORE_KEY);
    return row ? row.data : null;
  } catch (e) {
    console.error("Supabase load error:", e);
    return null;
  }
};

const saveToSupabase = async (client, data) => {
  try {
    await client.from("reiman_store").upsert({ id: STORE_KEY, data });
    return true;
  } catch (e) {
    console.error("Supabase save error:", e);
    return false;
  }
};

// ============================================================
// ICONS
// ============================================================
const Icon = ({ name, size = 20 }) => {
  const icons = {
    home: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
    users: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
    graduation: "M12 3L1 9l4 2.18V15l7 4 7-4v-3.82L23 9 12 3zm6 12.99L12 19l-6-3.01V11.99L12 15l6-2.01v2z",
    chart: "M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z",
    settings: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.57 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
    logout: "M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z",
    message: "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z",
    star: "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z",
    check: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
    plus: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
    trash: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
    edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
    eye: "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z",
    eyeOff: "M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z",
    bell: "M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z",
    money: "M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z",
    calendar: "M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z",
    shield: "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z",
    activity: "M21 6.5l-4-4-8.5 8.5-2.5-2.5L2.5 12l3.5 3.5 8.5-8.5L18 11l3-4.5z",
    power: "M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z",
    announce: "M18 11v2h4v-2h-4zm-2 6.61c.96.71 2.21 1.65 3.2 2.39.4-.53.8-1.07 1.2-1.6-.99-.74-2.24-1.68-3.2-2.4-.4.54-.8 1.08-1.2 1.61zM20.4 5.6c-.4-.53-.8-1.07-1.2-1.6-.99.74-2.24 1.68-3.2 2.4.4.53.8 1.07 1.2 1.6.96-.72 2.21-1.65 3.2-2.4zM4 9c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h1v4h2v-4h1l5 3V6L8 9H4zm11.5 3c0-1.33-.58-2.53-1.5-3.35v6.69c.92-.81 1.5-2.01 1.5-3.34z",
    database: "M12 2C6.48 2 2 4.24 2 7v10c0 2.76 4.48 5 10 5s10-2.24 10-5V7c0-2.76-4.48-5-10-5zm0 2c4.42 0 8 1.57 8 3.5S16.42 11 12 11 4 9.43 4 7.5 7.58 4 12 4zM4 12.27c1.7 1.37 4.7 2.23 8 2.23s6.3-.86 8-2.23V14c0 1.93-3.58 3.5-8 3.5s-8-1.57-8-3.5v-1.73zm0 5c1.7 1.37 4.7 2.23 8 2.23s6.3-.86 8-2.23V17c0 1.93-3.58 3.5-8 3.5s-8-1.57-8-3.5v-.73z",
    close: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
    send: "M2.01 21L23 12 2.01 3 2 10l15 2-15 2z",
    back: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
    cloud: "M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z",
    refresh: "M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z",
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d={icons[name] || icons.home} />
    </svg>
  );
};

// ============================================================
// STAR RATING
// ============================================================
const StarRating = ({ value = 0, onChange, readonly = false }) => (
  <div style={{ display: "flex", gap: 2 }}>
    {[1, 2, 3, 4, 5].map((s) => (
      <span key={s} onClick={() => !readonly && onChange && onChange(s)}
        style={{ cursor: readonly ? "default" : "pointer", color: s <= value ? "#f59e0b" : "#d1d5db", fontSize: 20, transition: "color 0.2s" }}>★</span>
    ))}
  </div>
);

// ============================================================
// MODAL
// ============================================================
const Modal = ({ open, onClose, title, children, width = 480 }) => {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 600, maxHeight: "92vh", overflow: "auto", boxShadow: "0 -10px 60px rgba(0,0,0,0.3)", animation: "modalIn 0.25s ease" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", background: "linear-gradient(135deg, #1a56db 0%, #1e40af 100%)", borderRadius: "20px 20px 0 0", position: "sticky", top: 0, zIndex: 1 }}>
          <h3 style={{ margin: 0, color: "#fff", fontSize: 15, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8, cursor: "pointer", color: "#fff", padding: 6, display: "flex" }}>
            <Icon name="close" size={20} />
          </button>
        </div>
        <div style={{ padding: "20px 16px", paddingBottom: 32 }}>{children}</div>
      </div>
    </div>
  );
};

// ============================================================
// FORM COMPONENTS
// ============================================================
const Field = ({ label, children }) => (
  <div style={{ marginBottom: 16 }}>
    <label style={{ display: "block", marginBottom: 6, fontWeight: 600, color: "#374151", fontSize: 13 }}>{label}</label>
    {children}
  </div>
);
const Input = (props) => (
  <input {...props} style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #e5e7eb", borderRadius: 12, fontSize: 16, outline: "none", boxSizing: "border-box", fontFamily: "inherit", transition: "border-color 0.2s", ...props.style }}
    onFocus={(e) => { e.target.style.borderColor = "#1a56db"; if (props.onFocus) props.onFocus(e); }}
    onBlur={(e) => { e.target.style.borderColor = "#e5e7eb"; if (props.onBlur) props.onBlur(e); }} />
);
const Select = (props) => (
  <select {...props} style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #e5e7eb", borderRadius: 12, fontSize: 16, outline: "none", background: "#fff", fontFamily: "inherit", cursor: "pointer", boxSizing: "border-box", ...props.style }} />
);
const Btn = ({ children, variant = "primary", onClick, style = {}, disabled = false, icon }) => {
  const variants = {
    primary: { background: "linear-gradient(135deg, #1a56db, #1e40af)", color: "#fff", border: "none" },
    danger: { background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "#fff", border: "none" },
    success: { background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff", border: "none" },
    ghost: { background: "#f9fafb", color: "#374151", border: "1.5px solid #e5e7eb" },
    warning: { background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#fff", border: "none" },
  };
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: "12px 18px", borderRadius: 12, cursor: disabled ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.2s", fontFamily: "inherit", opacity: disabled ? 0.6 : 1, ...variants[variant], ...style }}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
};

// ============================================================
// STAT CARD
// ============================================================
const StatCard = ({ label, value, icon, color = "#1a56db", sub }) => (
  <div style={{ background: "#fff", borderRadius: 14, padding: "14px 12px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", borderTop: `3px solid ${color}`, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
    <div style={{ background: color + "15", borderRadius: 10, padding: 8, color }}>
      <Icon name={icon} size={20} />
    </div>
    <div style={{ width: "100%" }}>
      <div className="stat-value" style={{ fontSize: 22, fontWeight: 800, color: "#111827", lineHeight: 1.1, wordBreak: "break-all" }}>{value}</div>
      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3, lineHeight: 1.3 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{sub}</div>}
    </div>
  </div>
);

const Badge = ({ children, color = "#1a56db" }) => (
  <span style={{ background: color + "18", color, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: 0.3 }}>{children}</span>
);

const Table = ({ headers, rows }) => (
  <div>
    {/* Mobile: card list */}
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.length === 0 && <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af", fontSize: 14 }}>لا توجد بيانات</div>}
      {rows.map((row, i) => (
        <div key={i} style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", border: "1px solid #f3f4f6" }}>
          {row.map((cell, j) => (
            headers[j] ? (
              <div key={j} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: j < row.length - 1 ? 8 : 0, marginBottom: j < row.length - 1 ? 8 : 0, borderBottom: j < row.length - 1 ? "1px solid #f9fafb" : "none", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 600, flexShrink: 0 }}>{headers[j]}</span>
                <span style={{ fontSize: 13, color: "#111827", textAlign: "left", flex: 1, display: "flex", justifyContent: "flex-start" }}>{cell}</span>
              </div>
            ) : null
          ))}
        </div>
      ))}
    </div>
  </div>
);

const AnnouncementBanner = ({ text }) => {
  if (!text) return null;
  return (
    <div style={{ background: "linear-gradient(135deg, #f59e0b18, #fef3c7)", border: "1px solid #f59e0b40", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
      <span style={{ color: "#d97706", flexShrink: 0 }}><Icon name="bell" size={20} /></span>
      <p style={{ margin: 0, color: "#92400e", fontSize: 14, fontWeight: 500 }}>{text}</p>
    </div>
  );
};

// ============================================================
// SYNC STATUS INDICATOR
// ============================================================
const SyncStatus = ({ status }) => {
  const cfg = {
    synced: { color: "#10b981", label: "محفوظ في السحابة ☁️", bg: "#f0fdf4" },
    syncing: { color: "#f59e0b", label: "جاري الحفظ...", bg: "#fffbeb" },
    local: { color: "#6b7280", label: "محفوظ محلياً", bg: "#f9fafb" },
    error: { color: "#ef4444", label: "خطأ في الاتصال ⚠️", bg: "#fef2f2" },
  };
  const c = cfg[status] || cfg.local;
  return (
    <div style={{ background: c.bg, border: `1px solid ${c.color}30`, borderRadius: 8, padding: "4px 10px", fontSize: 11, color: c.color, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
      {c.label}
    </div>
  );
};

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [db, setDbState] = useState(getLocalDB);
  const [user, setUser] = useState(null);
  const [loginCode, setLoginCode] = useState("");
  const [showLoginCode, setShowLoginCode] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [activeSection, setActiveSection] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [syncStatus, setSyncStatus] = useState("local");
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef(null);
  const syncTimeoutRef = useRef(null);

  // Build supabase client if credentials exist
  const getClient = useCallback((d) => {
    const url = d?.supabaseUrl;
    const key = d?.supabaseKey;
    if (url && key && url.startsWith("https://")) {
      return createSupabaseClient(url, key);
    }
    return null;
  }, []);

  // Initial load: try Supabase first, fallback to local
  useEffect(() => {
    const init = async () => {
      const local = getLocalDB();
      const client = getClient(local);
      if (client) {
        supabaseRef.current = client;
        setSyncStatus("syncing");
        const remote = await loadFromSupabase(client);
        if (remote) {
          setDbState({ ...INITIAL_DATA, ...remote });
          saveLocalDB({ ...INITIAL_DATA, ...remote });
          setSyncStatus("synced");
        } else {
          // First time: push local to Supabase
          await saveToSupabase(client, local);
          setSyncStatus("synced");
        }
      } else {
        setSyncStatus("local");
      }
      setLoading(false);
    };
    init();
  }, [getClient]);

  // Polling: refresh from Supabase every 10 seconds (real-time for all users)
  useEffect(() => {
    if (syncStatus !== "synced" && syncStatus !== "syncing") return;
    const interval = setInterval(async () => {
      if (!supabaseRef.current) return;
      const remote = await loadFromSupabase(supabaseRef.current);
      if (remote) {
        setDbState(prev => {
          const updated = { ...INITIAL_DATA, ...remote };
          // Only update if data actually changed
          if (JSON.stringify(prev) !== JSON.stringify(updated)) {
            saveLocalDB(updated);
            return updated;
          }
          return prev;
        });
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [syncStatus]);

  const updateDB = useCallback((updater) => {
    setDbState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      // Save locally immediately
      saveLocalDB(next);
      // Debounce Supabase save
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      setSyncStatus("syncing");
      syncTimeoutRef.current = setTimeout(async () => {
        const client = supabaseRef.current || getClient(next);
        if (client) {
          supabaseRef.current = client;
          const ok = await saveToSupabase(client, next);
          setSyncStatus(ok ? "synced" : "error");
        } else {
          setSyncStatus("local");
        }
      }, 800);
      return next;
    });
  }, [getClient]);

  const handleLogin = () => {
    setLoginError("");
    const allCodes = [
      { code: "DEV0000", role: "dev", name: "المبرمج", id: "dev0" },
      ...db.teachers.map((t) => ({ code: t.code, role: "teacher", name: t.name, id: t.id, subject: t.subject })),
      ...db.students.map((s) => ({ code: s.code, role: "student", name: s.name, id: s.id, teacherId: s.teacherId })),
      ...db.admins.map((a) => ({ code: a.code, role: "admin", name: a.name, id: a.id })),
    ];
    const found = allCodes.find((u) => u.code === loginCode.trim().toUpperCase());
    if (found) {
      const session = { id: Date.now(), user: found.name, code: found.code, role: found.role, time: new Date().toLocaleString("ar-SA") };
      updateDB((d) => ({ ...d, sessions: [session, ...d.sessions].slice(0, 100) }));
      setUser(found);
      setActiveSection("dashboard");
    } else {
      setLoginError("الكود غير صحيح. يرجى المحاولة مرة أخرى.");
    }
  };

  const handleLogout = () => { setUser(null); setLoginCode(""); setActiveSection("dashboard"); };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Tajawal, sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
        <div style={{ textAlign: "center", color: "#fff" }}>
          <div style={{ fontSize: 48, marginBottom: 16, animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</div>
          <p style={{ color: "#94a3b8" }}>جاري تحميل البيانات...</p>
        </div>
        <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      </div>
    );
  }

  if (!db.settings.siteActive && (!user || user.role !== "dev")) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Tajawal, sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
        <div style={{ textAlign: "center", color: "#fff" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🔧</div>
          <h2 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 8px" }}>الموقع تحت الصيانة</h2>
          <p style={{ color: "#94a3b8", margin: 0 }}>سيعود النظام قريباً. نعتذر عن الإزعاج.</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ minHeight: "100vh", fontFamily: "Tajawal, sans-serif", direction: "rtl", background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
        <style>{`
          @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
          @keyframes modalIn { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }
          @keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:0.8} }
          @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
          * { box-sizing: border-box; }
        `}</style>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{ position: "absolute", borderRadius: "50%", background: `rgba(26,86,219,${0.05 + i * 0.02})`, width: 100 + i * 80, height: 100 + i * 80, top: `${10 + i * 12}%`, left: `${-10 + i * 15}%`, animation: `pulse ${3 + i}s ease-in-out infinite` }} />
        ))}
        <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 24, padding: "36px 24px", width: 420, maxWidth: "96vw", boxShadow: "0 40px 80px rgba(0,0,0,0.4)", animation: "modalIn 0.5s ease", position: "relative", zIndex: 1 }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{ fontSize: 56, animation: "float 3s ease-in-out infinite", display: "inline-block", marginBottom: 16 }}>{db.settings.logo}</div>
            <h1 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 900, color: "#fff" }}>{db.settings.schoolName}</h1>
            <p style={{ margin: "0 0 12px", color: "#94a3b8", fontSize: 14 }}>نظام الإدارة التعليمية المتكامل</p>
            <SyncStatus status={syncStatus} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 8, color: "#cbd5e1", fontSize: 13, fontWeight: 600 }}>كود الدخول</label>
            <div style={{ position: "relative" }}>
              <input value={loginCode} onChange={(e) => setLoginCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                type={showLoginCode ? "text" : "password"} placeholder="أدخل كودك الخاص..."
                style={{ width: "100%", padding: "14px 48px 14px 16px", background: "rgba(255,255,255,0.1)", border: "1.5px solid rgba(255,255,255,0.2)", borderRadius: 12, color: "#fff", fontSize: 15, outline: "none", fontFamily: "Tajawal, sans-serif", letterSpacing: 2, boxSizing: "border-box" }} />
              <button onClick={() => setShowLoginCode(!showLoginCode)} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", display: "flex", padding: 4 }}>
                <Icon name={showLoginCode ? "eyeOff" : "eye"} size={18} />
              </button>
            </div>
          </div>
          {loginError && <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, color: "#fca5a5", fontSize: 13 }}>{loginError}</div>}
          <button onClick={handleLogin} style={{ width: "100%", padding: "14px 20px", background: "linear-gradient(135deg, #1a56db, #2563eb)", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "Tajawal, sans-serif", boxShadow: "0 4px 20px rgba(26,86,219,0.4)", transition: "all 0.2s" }}>
            دخول النظام
          </button>
          <p style={{ textAlign: "center", marginTop: 20, color: "#475569", fontSize: 12 }}>🔒 نظام آمن ومحمي — جميع البيانات مشفرة</p>
        </div>
      </div>
    );
  }

  const props = { db, updateDB, user, setActiveSection, activeSection, syncStatus };
  const unreadNotifs = (db.notifications || []).filter(n => n.studentId === user.id && !n.read).length;

  return (
    <div style={{ minHeight: "100vh", fontFamily: "Tajawal, sans-serif", direction: "rtl", background: "#f1f5f9", paddingBottom: 70 }}>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes modalIn { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }
        @keyframes slideIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #f1f5f9; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        input, textarea, select { font-size: 16px !important; }
        input::placeholder { color: #9ca3af; }
        select option { color: #111827; }
        html, body { margin:0; padding:0; background:#f1f5f9; }
        button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
        a { -webkit-tap-highlight-color: transparent; }
        .mobile-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        @media (min-width: 640px) {
          .mobile-grid-2 { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; }
        }
      `}</style>

      {/* TOP BAR */}
      <div style={{ background: "linear-gradient(135deg,#0f172a,#1e3a5f)", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 200, boxShadow: "0 2px 12px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24 }}>{db.settings.logo}</span>
          <div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 13, lineHeight: 1.2 }}>{db.settings.schoolName}</div>
            <SyncStatus status={syncStatus} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {user.role === "student" && (
            <button onClick={() => setActiveSection("notifications")} style={{ position: "relative", background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 10, padding: "8px", cursor: "pointer", color: "#fbbf24", display: "flex" }}>
              <Icon name="bell" size={20} />
              {unreadNotifs > 0 && <span style={{ position: "absolute", top: -4, left: -4, background: "#ef4444", color: "#fff", borderRadius: "50%", width: 18, height: 18, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{unreadNotifs}</span>}
            </button>
          )}
          <button onClick={handleLogout} style={{ background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 10, padding: "8px 12px", cursor: "pointer", color: "#fca5a5", fontSize: 12, fontWeight: 600, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
            <Icon name="logout" size={14} />
          </button>
        </div>
      </div>

      {/* USER GREETING STRIP */}
      <div style={{ background: "#fff", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #f3f4f6" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: user.role === "dev" ? "#7c3aed" : user.role === "admin" ? "#1a56db" : user.role === "teacher" ? "#059669" : "#d97706", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
          {user.name[0]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>{user.role === "dev" ? "مبرمج النظام" : user.role === "admin" ? "مدير المدرسة" : user.role === "teacher" ? "معلم — " + (user.subject || "") : "طالب"}</div>
        </div>
        <Badge color={user.role === "dev" ? "#7c3aed" : user.role === "admin" ? "#1a56db" : user.role === "teacher" ? "#059669" : "#d97706"}>
          {user.role === "dev" ? "مبرمج" : user.role === "admin" ? "مدير" : user.role === "teacher" ? "معلم" : "طالب"}
        </Badge>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ padding: "16px", animation: "slideIn 0.3s ease", minHeight: "calc(100vh - 180px)" }}>
        {user.role === "dev" && <DevDashboard {...props} />}
        {user.role === "admin" && <AdminDashboard {...props} />}
        {user.role === "teacher" && <TeacherDashboard {...props} />}
        {user.role === "student" && <StudentDashboard {...props} />}
      </div>

      {/* BOTTOM NAV */}
      <BottomNav user={user} active={activeSection} setActive={setActiveSection} db={db} />
    </div>
  );
}

// ============================================================
// BOTTOM NAVIGATION (Mobile-first)
// ============================================================
function BottomNav({ user, active, setActive, db }) {
  const menus = {
    dev: [
      { key: "dashboard", label: "الرئيسية", icon: "chart" },
      { key: "sessions", label: "الجلسات", icon: "activity" },
      { key: "site_control", label: "التحكم", icon: "power" },
      { key: "db_settings", label: "Supabase", icon: "database" },
    ],
    admin: [
      { key: "dashboard", label: "الرئيسية", icon: "home" },
      { key: "students", label: "الطلاب", icon: "graduation" },
      { key: "student_attendance", label: "الحضور", icon: "check" },
      { key: "fees", label: "الرسوم", icon: "money" },
      { key: "more", label: "المزيد", icon: "settings" },
    ],
    teacher: [
      { key: "dashboard", label: "الرئيسية", icon: "home" },
      { key: "my_students", label: "طلابي", icon: "graduation" },
      { key: "ratings", label: "التقييم", icon: "star" },
      { key: "messages", label: "الرسائل", icon: "message" },
      { key: "more", label: "المزيد", icon: "settings" },
    ],
    student: [
      { key: "dashboard", label: "الرئيسية", icon: "home" },
      { key: "my_attendance", label: "حضوري", icon: "calendar" },
      { key: "my_fees", label: "رسومي", icon: "money" },
      { key: "messages", label: "رسائلي", icon: "message" },
      { key: "files", label: "الملفات", icon: "database" },
    ],
  };

  const items = menus[user.role] || [];

  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #e5e7eb", display: "flex", zIndex: 300, boxShadow: "0 -4px 20px rgba(0,0,0,0.1)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      {items.map((item) => {
        const isActive = active === item.key;
        return (
          <button key={item.key} onClick={() => setActive(item.key)}
            style={{ flex: 1, padding: "8px 4px 10px", border: "none", background: "transparent", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: isActive ? "#1a56db" : "#9ca3af", fontFamily: "Tajawal, sans-serif", transition: "all 0.2s", position: "relative" }}>
            {isActive && <div style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: 3, background: "#1a56db", borderRadius: "0 0 4px 4px" }} />}
            <Icon name={item.icon} size={22} />
            <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500 }}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// MoreMenu modal for admin/teacher extra items
function MoreMenu({ user, setActive, db }) {
  const [open, setOpen] = useState(false);
  const adminExtra = [
    { key: "teachers", label: "إدارة المعلمين", icon: "users" },
    { key: "teacher_attendance", label: "حضور المعلمين", icon: "calendar" },
    { key: "announcements", label: "الإعلانات", icon: "announce" },
    { key: "files", label: "الجداول والملفات", icon: "database" },
    { key: "settings", label: "الإعدادات", icon: "settings" },
  ];
  const teacherExtra = [
    { key: "my_attendance", label: "حضوري", icon: "calendar" },
    { key: "files", label: "الجداول والملفات", icon: "database" },
  ];
  const items = user.role === "admin" ? adminExtra : teacherExtra;
  return null; // handled inside dashboards via "more" section key
}


// ============================================================
// DEV DASHBOARD
// ============================================================
function DevDashboard({ db, updateDB, user, activeSection, syncStatus }) {
  const [supabaseUrl, setSupabaseUrl] = useState(db.supabaseUrl || "");
  const [supabaseKey, setSupabaseKey] = useState(db.supabaseKey || "");
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [newAdmin, setNewAdmin] = useState({ name: "", code: "" });
  const [showCodes, setShowCodes] = useState(false);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const client = createSupabaseClient(supabaseUrl, supabaseKey);
      // Try to read
      await client.from("reiman_store").select("id");
      setTestResult({ ok: true, msg: "✅ الاتصال ناجح! قاعدة البيانات تعمل." });
    } catch (e) {
      setTestResult({ ok: false, msg: "❌ فشل الاتصال: " + e.message });
    }
    setTesting(false);
  };

  const saveSupabase = () => {
    updateDB((d) => ({ ...d, supabaseUrl, supabaseKey }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addAdmin = () => {
    if (!newAdmin.name || !newAdmin.code) return;
    updateDB((d) => ({ ...d, admins: [...d.admins, { id: "adm" + Date.now(), ...newAdmin }] }));
    setNewAdmin({ name: "", code: "" });
  };
  const removeAdmin = (id) => {
    if (id === "adm1") return alert("لا يمكن حذف المدير الأساسي");
    updateDB((d) => ({ ...d, admins: d.admins.filter((a) => a.id !== id) }));
  };

  if (activeSection === "sessions") {
    return (
      <div>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: "#111827", marginBottom: 16 }}>سجل الجلسات</h2>
        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <Table
            headers={["#", "المستخدم", "الكود", "الدور", "وقت الدخول"]}
            rows={db.sessions.map((s, i) => [
              i + 1, s.user,
              <Badge color="#6b7280">{s.code}</Badge>,
              <Badge color={s.role === "dev" ? "#7c3aed" : s.role === "admin" ? "#1a56db" : s.role === "teacher" ? "#059669" : "#d97706"}>
                {s.role === "dev" ? "مبرمج" : s.role === "admin" ? "مدير" : s.role === "teacher" ? "معلم" : "طالب"}
              </Badge>,
              s.time,
            ])}
          />
        </div>
      </div>
    );
  }

  if (activeSection === "data") {
    return (
      <div>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: "#111827", marginBottom: 16 }}>عرض البيانات الكاملة</h2>
        {["teachers", "students", "messages", "attendance", "teacher_attendance", "ratings", "sessions", "settings"].map((table) => (
          <div key={table} style={{ background: "#fff", borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <h3 style={{ margin: "0 0 12px", color: "#1a56db", fontSize: 15, fontWeight: 700 }}>جدول: {table}</h3>
            <pre style={{ background: "#f8fafc", padding: 16, borderRadius: 10, fontSize: 12, overflow: "auto", maxHeight: 200, color: "#374151", lineHeight: 1.6 }}>
              {JSON.stringify(db[table] || [], null, 2)}
            </pre>
          </div>
        ))}
      </div>
    );
  }

  if (activeSection === "site_control") {
    return (
      <div>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: "#111827", marginBottom: 16 }}>التحكم بالموقع</h2>
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16, color: "#374151" }}>حالة الموقع</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 60, height: 32, borderRadius: 16, cursor: "pointer", background: db.settings.siteActive ? "#10b981" : "#ef4444", position: "relative", transition: "background 0.3s" }}
              onClick={() => updateDB((d) => ({ ...d, settings: { ...d.settings, siteActive: !d.settings.siteActive } }))}>
              <div style={{ position: "absolute", top: 4, background: "#fff", width: 24, height: 24, borderRadius: "50%", transition: "left 0.3s", left: db.settings.siteActive ? 32 : 4, boxShadow: "0 2px 6px rgba(0,0,0,0.2)" }} />
            </div>
            <span style={{ fontWeight: 700, color: db.settings.siteActive ? "#10b981" : "#ef4444" }}>
              {db.settings.siteActive ? "الموقع يعمل ✓" : "الموقع متوقف ✗"}
            </span>
          </div>
        </div>
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, color: "#374151" }}>إدارة المديرين</h3>
            <button onClick={() => setShowCodes(!showCodes)} style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name={showCodes ? "eyeOff" : "eye"} size={14} />
              {showCodes ? "إخفاء الأكواد" : "إظهار الأكواد"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <Input placeholder="اسم المدير" value={newAdmin.name} onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })} style={{ flex: 1 }} />
            <Input placeholder="الكود" value={newAdmin.code} onChange={(e) => setNewAdmin({ ...newAdmin, code: e.target.value.toUpperCase() })} style={{ flex: 1 }} />
            <Btn onClick={addAdmin} icon="plus">إضافة</Btn>
          </div>
          <Table
            headers={["الاسم", "الكود", "إجراء"]}
            rows={db.admins.map((a) => [
              a.name,
              showCodes ? <Badge color="#1a56db">{a.code}</Badge> : "••••••",
              <Btn variant="danger" onClick={() => removeAdmin(a.id)} style={{ padding: "6px 12px" }} icon="trash">حذف</Btn>,
            ])}
          />
        </div>
      </div>
    );
  }

  if (activeSection === "db_settings") {
    return (
      <div>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: "#111827", marginBottom: 16 }}>إعداد Supabase</h2>

        {/* Status */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>حالة الاتصال الحالية</div>
            <SyncStatus status={syncStatus} />
          </div>
          {db.supabaseUrl && (
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              {db.supabaseUrl.replace("https://", "").substring(0, 30)}...
            </div>
          )}
        </div>

        {/* Setup Guide */}
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 16, padding: 24, marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 16px", color: "#1d4ed8", fontSize: 15, fontWeight: 700 }}>📋 خطوات الإعداد</h3>
          {[
            { n: 1, t: "أنشئ حساباً مجانياً على supabase.com" },
            { n: 2, t: 'أنشئ مشروعاً جديداً (New Project)' },
            { n: 3, t: 'افتح SQL Editor وشغّل الكود أدناه لإنشاء الجدول' },
            { n: 4, t: 'من Project Settings > API انسخ URL و anon key' },
            { n: 5, t: 'الصقهما أدناه واضغط اختبار ثم حفظ' },
          ].map((s) => (
            <div key={s.n} style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "flex-start" }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#1d4ed8", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{s.n}</div>
              <span style={{ color: "#1e40af", fontSize: 13, lineHeight: 1.6 }}>{s.t}</span>
            </div>
          ))}
          <div style={{ background: "#1e293b", borderRadius: 10, padding: 16, marginTop: 12 }}>
            <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 8 }}>SQL لإنشاء الجدول (انسخه وشغّله في SQL Editor):</div>
            <pre style={{ color: "#7dd3fc", fontSize: 12, margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
{`create table if not exists reiman_store (
  id text primary key,
  data jsonb not null,
  updated_at timestamp default now()
);

-- السماح بالوصول العام (مؤقتاً للاختبار)
alter table reiman_store enable row level security;
create policy "allow all" on reiman_store
  for all using (true) with check (true);`}
            </pre>
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <Field label="Supabase URL">
            <Input value={supabaseUrl} onChange={(e) => setSupabaseUrl(e.target.value)} placeholder="https://xxxxxxxxxxxx.supabase.co" />
          </Field>
          <Field label="Supabase Anon Key">
            <Input value={supabaseKey} onChange={(e) => setSupabaseKey(e.target.value)} placeholder="eyJhbGciOiJIUzI1NiIs..." type="password" />
          </Field>
          {testResult && (
            <div style={{ padding: "12px 16px", borderRadius: 10, marginBottom: 16, background: testResult.ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${testResult.ok ? "#bbf7d0" : "#fecaca"}`, color: testResult.ok ? "#166534" : "#dc2626", fontSize: 13 }}>
              {testResult.msg}
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <Btn onClick={testConnection} variant="warning" icon="activity" disabled={testing}>
              {testing ? "جاري الاختبار..." : "اختبار الاتصال"}
            </Btn>
            <Btn onClick={saveSupabase} variant={saved ? "success" : "primary"} icon={saved ? "check" : "database"}>
              {saved ? "تم الحفظ ✓" : "حفظ وتفعيل"}
            </Btn>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: 19, fontWeight: 800, color: "#111827", marginBottom: 16 }}>لوحة تحكم المبرمج</h2>
      <div className="mobile-grid-2" style={{ marginBottom: 20 }}>
        <StatCard label="المعلمون" value={db.teachers.length} icon="users" color="#1a56db" />
        <StatCard label="الطلاب" value={db.students.length} icon="graduation" color="#10b981" />
        <StatCard label="الجلسات" value={db.sessions.length} icon="activity" color="#7c3aed" />
        <StatCard label="الرسائل" value={db.messages.length} icon="message" color="#f59e0b" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#374151" }}>حالة النظام</h3>
          {[
            { label: "حالة الموقع", value: db.settings.siteActive ? "يعمل" : "متوقف", color: db.settings.siteActive ? "#10b981" : "#ef4444" },
            { label: "قاعدة البيانات", value: db.supabaseUrl ? "Supabase ☁️" : "localStorage", color: db.supabaseUrl ? "#10b981" : "#f59e0b" },
            { label: "حالة المزامنة", value: syncStatus === "synced" ? "متزامن" : syncStatus === "syncing" ? "جاري..." : syncStatus === "error" ? "خطأ" : "محلي", color: syncStatus === "synced" ? "#10b981" : syncStatus === "error" ? "#ef4444" : "#f59e0b" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: i < 2 ? "1px solid #f3f4f6" : "none" }}>
              <span style={{ color: "#6b7280", fontSize: 14 }}>{item.label}</span>
              <Badge color={item.color}>{item.value}</Badge>
            </div>
          ))}
        </div>
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#374151" }}>آخر الجلسات</h3>
          {db.sessions.slice(0, 5).map((s, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < 4 ? "1px solid #f3f4f6" : "none" }}>
              <span style={{ fontSize: 13, color: "#374151" }}>{s.user}</span>
              <span style={{ fontSize: 11, color: "#9ca3af" }}>{s.time}</span>
            </div>
          ))}
          {db.sessions.length === 0 && <p style={{ color: "#9ca3af", fontSize: 13 }}>لا توجد جلسات</p>}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ADMIN DASHBOARD
// ============================================================
function AdminDashboard({ db, updateDB, user, activeSection, setActiveSection }) {
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [editTeacher, setEditTeacher] = useState(null);
  const [editStudent, setEditStudent] = useState(null);
  const [teacherForm, setTeacherForm] = useState({ name: "", subject: "", phone: "", email: "", code: "" });
  const [studentForm, setStudentForm] = useState({ name: "", grade: "", teacherId: "", fees: 5000, paidFees: 0, code: "" });
  const [announcement, setAnnouncement] = useState(db.settings.announcement || "");
  const [schoolSettings, setSchoolSettings] = useState({ name: db.settings.schoolName, logo: db.settings.logo, primaryColor: db.settings.primaryColor });
  const [paymentModal, setPaymentModal] = useState(null);
  const [payAmount, setPayAmount] = useState("");

  const today = new Date().toLocaleDateString("ar-SA");
  const totalFees = db.students.reduce((s, st) => s + (+st.fees || 0), 0);
  const totalPaid = db.students.reduce((s, st) => s + (+st.paidFees || 0), 0);
  const totalUnpaid = totalFees - totalPaid;

  const saveAnnouncement = () => updateDB((d) => ({ ...d, settings: { ...d.settings, announcement } }));
  const saveSchoolSettings = () => updateDB((d) => ({ ...d, settings: { ...d.settings, schoolName: schoolSettings.name, logo: schoolSettings.logo, primaryColor: schoolSettings.primaryColor } }));

  const openAddTeacher = () => { setEditTeacher(null); setTeacherForm({ name: "", subject: "", phone: "", email: "", code: "" }); setShowTeacherModal(true); };
  const openEditTeacher = (t) => { setEditTeacher(t); setTeacherForm({ name: t.name, subject: t.subject, phone: t.phone, email: t.email, code: t.code }); setShowTeacherModal(true); };
  const saveTeacher = () => {
    if (!teacherForm.name || !teacherForm.code) return;
    if (editTeacher) {
      updateDB((d) => ({ ...d, teachers: d.teachers.map((t) => t.id === editTeacher.id ? { ...t, ...teacherForm } : t) }));
    } else {
      updateDB((d) => ({ ...d, teachers: [...d.teachers, { id: "t" + Date.now(), status: "active", ...teacherForm }] }));
    }
    setShowTeacherModal(false);
  };
  const deleteTeacher = (id) => { if (!confirm("هل تريد حذف هذا المعلم؟")) return; updateDB((d) => ({ ...d, teachers: d.teachers.filter((t) => t.id !== id) })); };

  const openAddStudent = () => { setEditStudent(null); setStudentForm({ name: "", grade: "", teacherId: db.teachers[0]?.id || "", fees: 5000, paidFees: 0, code: "" }); setShowStudentModal(true); };
  const openEditStudent = (s) => { setEditStudent(s); setStudentForm({ name: s.name, grade: s.grade, teacherId: s.teacherId, fees: s.fees, paidFees: s.paidFees, code: s.code }); setShowStudentModal(true); };
  const saveStudent = () => {
    if (!studentForm.name || !studentForm.code) return;
    if (editStudent) {
      updateDB((d) => ({ ...d, students: d.students.map((s) => s.id === editStudent.id ? { ...s, ...studentForm, fees: +studentForm.fees, paidFees: +studentForm.paidFees } : s) }));
    } else {
      updateDB((d) => ({ ...d, students: [...d.students, { id: "s" + Date.now(), status: "active", ...studentForm, fees: +studentForm.fees, paidFees: +studentForm.paidFees }] }));
    }
    setShowStudentModal(false);
  };
  const deleteStudent = (id) => { if (!confirm("هل تريد حذف هذا الطالب؟")) return; updateDB((d) => ({ ...d, students: d.students.filter((s) => s.id !== id) })); };

  const recordPayment = () => {
    const amount = +payAmount;
    if (!amount || amount <= 0) return;
    updateDB((d) => ({ ...d, students: d.students.map((s) => s.id === paymentModal.id ? { ...s, paidFees: Math.min(s.fees, s.paidFees + amount) } : s) }));
    setPaymentModal(null); setPayAmount("");
  };

  const markTeacherAttendance = (teacherId, type) => {
    const existing = db.teacher_attendance.find((a) => a.teacherId === teacherId && a.date === today);
    if (type === "in" && existing?.in) return;
    if (type === "out" && existing?.out) return;
    updateDB((d) => {
      const rec = d.teacher_attendance.find((a) => a.teacherId === teacherId && a.date === today);
      if (rec) return { ...d, teacher_attendance: d.teacher_attendance.map((a) => a.teacherId === teacherId && a.date === today ? { ...a, [type]: new Date().toLocaleTimeString("ar-SA") } : a) };
      return { ...d, teacher_attendance: [...d.teacher_attendance, { id: Date.now(), teacherId, date: today, [type]: new Date().toLocaleTimeString("ar-SA") }] };
    });
  };

  if (activeSection === "more") {
    const adminExtra = [
      { key: "teachers", label: "إدارة المعلمين", icon: "users", color: "#1a56db" },
      { key: "teacher_attendance", label: "حضور المعلمين", icon: "calendar", color: "#10b981" },
      { key: "announcements", label: "الإعلانات", icon: "announce", color: "#f59e0b" },
      { key: "files", label: "الجداول والملفات", icon: "database", color: "#7c3aed" },
      { key: "settings", label: "إعدادات المدرسة", icon: "settings", color: "#6b7280" },
    ];
    return (
      <div>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: "#111827", marginBottom: 16 }}>القائمة الكاملة</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {adminExtra.map(item => (
            <button key={item.key} onClick={() => setActiveSection(item.key)}
              style={{ background: "#fff", border: "none", borderRadius: 14, padding: "16px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", width: "100%", fontFamily: "Tajawal, sans-serif", textAlign: "right" }}>
              <div style={{ background: item.color + "18", borderRadius: 12, padding: 10, color: item.color, flexShrink: 0 }}>
                <Icon name={item.icon} size={22} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{item.label}</span>
              <span style={{ marginRight: "auto", color: "#d1d5db" }}>←</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (activeSection === "teachers") {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, color: "#111827", margin: 0 }}>إدارة المعلمين</h2>
          <Btn onClick={openAddTeacher} icon="plus">إضافة معلم</Btn>
        </div>
        <AnnouncementBanner text={db.settings.announcement} />
        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <Table
            headers={["الاسم", "المادة", "الهاتف", "البريد", "الكود", "الحالة", "إجراءات"]}
            rows={db.teachers.map((t) => [
              t.name, <Badge color="#1a56db">{t.subject}</Badge>, t.phone, t.email,
              <Badge color="#6b7280">{t.code}</Badge>,
              <Badge color={t.status === "active" ? "#10b981" : "#ef4444"}>{t.status === "active" ? "نشط" : "غير نشط"}</Badge>,
              <div style={{ display: "flex", gap: 6 }}>
                <Btn variant="ghost" onClick={() => openEditTeacher(t)} style={{ padding: "5px 10px" }} icon="edit">تعديل</Btn>
                <Btn variant="danger" onClick={() => deleteTeacher(t.id)} style={{ padding: "5px 10px" }} icon="trash">حذف</Btn>
              </div>,
            ])}
          />
        </div>
        <Modal open={showTeacherModal} onClose={() => setShowTeacherModal(false)} title={editTeacher ? "تعديل معلم" : "إضافة معلم"}>
          <Field label="الاسم الكامل"><Input value={teacherForm.name} onChange={(e) => setTeacherForm({ ...teacherForm, name: e.target.value })} placeholder="أ. محمد علي" /></Field>
          <Field label="المادة الدراسية"><Input value={teacherForm.subject} onChange={(e) => setTeacherForm({ ...teacherForm, subject: e.target.value })} placeholder="رياضيات" /></Field>
          <Field label="رقم الهاتف"><Input value={teacherForm.phone} onChange={(e) => setTeacherForm({ ...teacherForm, phone: e.target.value })} placeholder="05xxxxxxxx" /></Field>
          <Field label="البريد الإلكتروني"><Input value={teacherForm.email} onChange={(e) => setTeacherForm({ ...teacherForm, email: e.target.value })} placeholder="teacher@reiman.edu" /></Field>
          <Field label="كود الدخول"><Input value={teacherForm.code} onChange={(e) => setTeacherForm({ ...teacherForm, code: e.target.value.toUpperCase() })} placeholder="TCH003" /></Field>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="ghost" onClick={() => setShowTeacherModal(false)}>إلغاء</Btn>
            <Btn onClick={saveTeacher} icon="check">{editTeacher ? "حفظ التعديل" : "إضافة"}</Btn>
          </div>
        </Modal>
      </div>
    );
  }

  if (activeSection === "teacher_attendance") {
    return (
      <div>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: "#111827", marginBottom: 16 }}>حضور المعلمين — {today}</h2>
        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <Table
            headers={["المعلم", "المادة", "وقت الحضور", "وقت الانصراف", "الحالة", "إجراء"]}
            rows={db.teachers.map((t) => {
              const att = db.teacher_attendance.find((a) => a.teacherId === t.id && a.date === today);
              return [
                t.name, <Badge color="#1a56db">{t.subject}</Badge>,
                att?.in ? <Badge color="#10b981">{att.in}</Badge> : <span style={{ color: "#9ca3af" }}>—</span>,
                att?.out ? <Badge color="#ef4444">{att.out}</Badge> : <span style={{ color: "#9ca3af" }}>—</span>,
                att?.in ? (att.out ? <Badge color="#6b7280">انصرف</Badge> : <Badge color="#10b981">حاضر</Badge>) : <Badge color="#f59e0b">غائب</Badge>,
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn variant="success" onClick={() => markTeacherAttendance(t.id, "in")} style={{ padding: "5px 10px" }} disabled={!!att?.in}>حضور</Btn>
                  <Btn variant="danger" onClick={() => markTeacherAttendance(t.id, "out")} style={{ padding: "5px 10px" }} disabled={!att?.in || !!att?.out}>انصراف</Btn>
                </div>,
              ];
            })}
          />
        </div>
      </div>
    );
  }

  if (activeSection === "students") {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, color: "#111827", margin: 0 }}>إدارة الطلاب</h2>
          <Btn onClick={openAddStudent} icon="plus">إضافة طالب</Btn>
        </div>
        <AnnouncementBanner text={db.settings.announcement} />
        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <Table
            headers={["الاسم", "الصف", "المعلم", "الكود", "الرسوم", "المدفوع", "إجراءات"]}
            rows={db.students.map((s) => {
              const teacher = db.teachers.find((t) => t.id === s.teacherId);
              return [
                s.name, s.grade, teacher?.name || "—",
                <Badge color="#6b7280">{s.code}</Badge>,
                s.fees + " ر.س",
                <Badge color={s.paidFees >= s.fees ? "#10b981" : "#f59e0b"}>{s.paidFees} ر.س</Badge>,
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn variant="ghost" onClick={() => openEditStudent(s)} style={{ padding: "5px 10px" }} icon="edit">تعديل</Btn>
                  <Btn variant="danger" onClick={() => deleteStudent(s.id)} style={{ padding: "5px 10px" }} icon="trash">حذف</Btn>
                </div>,
              ];
            })}
          />
        </div>
        <Modal open={showStudentModal} onClose={() => setShowStudentModal(false)} title={editStudent ? "تعديل طالب" : "إضافة طالب"}>
          <Field label="اسم الطالب"><Input value={studentForm.name} onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })} placeholder="محمد أحمد" /></Field>
          <Field label="الصف الدراسي"><Input value={studentForm.grade} onChange={(e) => setStudentForm({ ...studentForm, grade: e.target.value })} placeholder="الصف الثالث" /></Field>
          <Field label="المعلم المسؤول">
            <Select value={studentForm.teacherId} onChange={(e) => setStudentForm({ ...studentForm, teacherId: e.target.value })}>
              {db.teachers.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.subject}</option>)}
            </Select>
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="إجمالي الرسوم (ر.س)"><Input type="number" value={studentForm.fees} onChange={(e) => setStudentForm({ ...studentForm, fees: e.target.value })} /></Field>
            <Field label="المبلغ المدفوع (ر.س)"><Input type="number" value={studentForm.paidFees} onChange={(e) => setStudentForm({ ...studentForm, paidFees: e.target.value })} /></Field>
          </div>
          <Field label="كود الدخول"><Input value={studentForm.code} onChange={(e) => setStudentForm({ ...studentForm, code: e.target.value.toUpperCase() })} placeholder="STD003" /></Field>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="ghost" onClick={() => setShowStudentModal(false)}>إلغاء</Btn>
            <Btn onClick={saveStudent} icon="check">{editStudent ? "حفظ التعديل" : "إضافة"}</Btn>
          </div>
        </Modal>
      </div>
    );
  }


  if (activeSection === "student_attendance") {
    const allStudents = db.students;
    const markStudentAtt = (studentId, present) => {
      const existing = db.attendance.find((a) => a.studentId === studentId && a.date === today);
      if (existing) {
        updateDB((d) => ({ ...d, attendance: d.attendance.map((a) => a.studentId === studentId && a.date === today ? { ...a, present } : a) }));
      } else {
        updateDB((d) => ({ ...d, attendance: [...d.attendance, { id: Date.now(), studentId, date: today, present, teacherId: "admin" }] }));
      }
      if (!present) {
        const student = db.students.find(s => s.id === studentId);
        if (student) {
          const notif = { id: Date.now(), studentId, studentName: student.name, type: "absent", date: today, msg: `تغيب ${student.name} بتاريخ ${today}`, read: false };
          updateDB((d) => ({ ...d, notifications: [notif, ...(d.notifications || [])].slice(0, 200) }));
        }
      }
    };
    const markAllPresent = () => allStudents.forEach(s => markStudentAtt(s.id, true));
    const presentCount = db.attendance.filter(a => a.date === today && a.present).length;
    const absentCount = db.attendance.filter(a => a.date === today && !a.present).length;
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, color: "#111827", margin: 0 }}>حضور الطلاب — {today}</h2>
          <Btn onClick={markAllPresent} variant="success" icon="check">تسجيل الجميع حاضرين</Btn>
        </div>
        <div className="mobile-grid-2" style={{ marginBottom: 20 }}>
          <StatCard label="إجمالي الطلاب" value={allStudents.length} icon="graduation" color="#1a56db" />
          <StatCard label="حاضرون اليوم" value={presentCount} icon="check" color="#10b981" />
          <StatCard label="غائبون اليوم" value={absentCount} icon="close" color="#ef4444" />
          <StatCard label="لم يُسجَّل" value={allStudents.length - presentCount - absentCount} icon="bell" color="#f59e0b" />
        </div>
        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <Table
            headers={["الطالب", "الصف", "المعلم", "حالة اليوم", "إجراء"]}
            rows={allStudents.map((s) => {
              const teacher = db.teachers.find(t => t.id === s.teacherId);
              const att = db.attendance.find(a => a.studentId === s.id && a.date === today);
              return [
                s.name, s.grade, teacher?.name || "—",
                att ? <Badge color={att.present ? "#10b981" : "#ef4444"}>{att.present ? "حاضر ✓" : "غائب ✗"}</Badge> : <Badge color="#9ca3af">لم يُسجَّل</Badge>,
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn variant="success" onClick={() => markStudentAtt(s.id, true)} style={{ padding: "5px 10px", opacity: att?.present === true ? 1 : 0.5 }} icon="check">حاضر</Btn>
                  <Btn variant="danger" onClick={() => markStudentAtt(s.id, false)} style={{ padding: "5px 10px", opacity: att?.present === false ? 1 : 0.5 }} icon="close">غائب</Btn>
                </div>,
              ];
            })}
          />
        </div>
        {(db.notifications || []).filter(n => n.date === today && n.type === "absent").length > 0 && (
          <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginTop: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#ef4444" }}>🔔 إشعارات الغياب اليوم</h3>
            {(db.notifications || []).filter(n => n.date === today && n.type === "absent").map((n, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
                <span style={{ color: "#ef4444" }}><Icon name="bell" size={16} /></span>
                <span style={{ fontSize: 14, color: "#374151" }}>{n.msg}</span>
                <Badge color="#ef4444">غياب</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (activeSection === "files") {
    return <FilesPage db={db} updateDB={updateDB} user={user} today={today} />;
  }

  if (activeSection === "fees") {
    return (
      <div>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: "#111827", marginBottom: 16 }}>الرسوم الدراسية</h2>
        <div className="mobile-grid-2" style={{ marginBottom: 20 }}>
          <StatCard label="إجمالي الرسوم" value={totalFees.toLocaleString() + " ر.س"} icon="money" color="#1a56db" />
          <StatCard label="المبلغ المحصّل" value={totalPaid.toLocaleString() + " ر.س"} icon="check" color="#10b981" />
          <StatCard label="المبلغ المتبقي" value={totalUnpaid.toLocaleString() + " ر.س"} icon="bell" color="#ef4444" />
        </div>
        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <Table
            headers={["الطالب", "الصف", "إجمالي الرسوم", "المدفوع", "المتبقي", "النسبة", "إجراء"]}
            rows={db.students.map((s) => {
              const remaining = (+s.fees || 0) - (+s.paidFees || 0);
              const pct = s.fees > 0 ? Math.round((s.paidFees / s.fees) * 100) : 0;
              return [
                s.name, s.grade,
                (+s.fees).toLocaleString() + " ر.س",
                <Badge color="#10b981">{(+s.paidFees).toLocaleString()} ر.س</Badge>,
                remaining > 0 ? <Badge color="#ef4444">{remaining.toLocaleString()} ر.س</Badge> : <Badge color="#10b981">مكتمل</Badge>,
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ background: "#f3f4f6", borderRadius: 20, height: 8, width: 80, overflow: "hidden" }}>
                    <div style={{ background: pct >= 100 ? "#10b981" : "#1a56db", height: "100%", width: pct + "%", transition: "width 0.5s" }} />
                  </div>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{pct}%</span>
                </div>,
                remaining > 0 && <Btn variant="success" onClick={() => { setPaymentModal(s); setPayAmount(""); }} style={{ padding: "5px 12px" }} icon="money">تسجيل دفع</Btn>,
              ];
            })}
          />
        </div>
        <Modal open={!!paymentModal} onClose={() => setPaymentModal(null)} title="تسجيل دفعة">
          {paymentModal && (
            <>
              <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
                <div style={{ fontWeight: 700, color: "#111827", marginBottom: 4 }}>{paymentModal.name}</div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>المتبقي: {((+paymentModal.fees) - (+paymentModal.paidFees)).toLocaleString()} ر.س</div>
              </div>
              <Field label="المبلغ (ر.س)"><Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="أدخل المبلغ المدفوع" /></Field>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <Btn variant="ghost" onClick={() => setPaymentModal(null)}>إلغاء</Btn>
                <Btn variant="success" onClick={recordPayment} icon="check">تسجيل الدفعة</Btn>
              </div>
            </>
          )}
        </Modal>
      </div>
    );
  }

  if (activeSection === "announcements") {
    return (
      <div>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: "#111827", marginBottom: 16 }}>إدارة الإعلانات</h2>
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <Field label="نص الإعلان (يظهر للمعلمين والطلاب)">
            <textarea value={announcement} onChange={(e) => setAnnouncement(e.target.value)} rows={4} placeholder="اكتب إعلانك هنا..."
              style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 14, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }} />
          </Field>
          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            <Btn onClick={saveAnnouncement} icon="announce">حفظ الإعلان</Btn>
            <Btn variant="ghost" onClick={() => setAnnouncement("")}>مسح</Btn>
          </div>
          <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 20 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#374151" }}>معاينة:</h3>
            <AnnouncementBanner text={announcement || "لا يوجد إعلان حالياً"} />
          </div>
        </div>
      </div>
    );
  }

  if (activeSection === "settings") {
    return (
      <div>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: "#111827", marginBottom: 16 }}>إعدادات المدرسة</h2>
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <Field label="اسم المدرسة"><Input value={schoolSettings.name} onChange={(e) => setSchoolSettings({ ...schoolSettings, name: e.target.value })} /></Field>
          <Field label="شعار المدرسة (إيموجي)"><Input value={schoolSettings.logo} onChange={(e) => setSchoolSettings({ ...schoolSettings, logo: e.target.value })} placeholder="🎓" /></Field>
          <Field label="اللون الرئيسي">
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input type="color" value={schoolSettings.primaryColor} onChange={(e) => setSchoolSettings({ ...schoolSettings, primaryColor: e.target.value })} style={{ width: 50, height: 40, border: "none", cursor: "pointer", borderRadius: 8 }} />
              <Input value={schoolSettings.primaryColor} onChange={(e) => setSchoolSettings({ ...schoolSettings, primaryColor: e.target.value })} style={{ flex: 1 }} />
            </div>
          </Field>
          <Btn onClick={saveSchoolSettings} icon="check">حفظ الإعدادات</Btn>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 8 }}>مرحباً، {user.name} 👋</h2>
      <p style={{ color: "#6b7280", marginBottom: 20 }}>نظرة عامة على النظام</p>
      <AnnouncementBanner text={db.settings.announcement} />
      <div className="mobile-grid-2" style={{ marginBottom: 20 }}>
        <StatCard label="المعلمون" value={db.teachers.length} icon="users" color="#1a56db" />
        <StatCard label="الطلاب" value={db.students.length} icon="graduation" color="#10b981" />
        <StatCard label="الرسوم المحصّلة" value={totalPaid.toLocaleString() + " ر.س"} icon="money" color="#f59e0b" />
        <StatCard label="رسوم متبقية" value={totalUnpaid.toLocaleString() + " ر.س"} icon="bell" color="#ef4444" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>المعلمون</h3>
          {db.teachers.map((t) => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
              <div><div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div><div style={{ fontSize: 12, color: "#6b7280" }}>{t.subject}</div></div>
              <Badge color="#10b981">نشط</Badge>
            </div>
          ))}
        </div>
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>آخر الطلاب</h3>
          {db.students.slice(0, 5).map((s) => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
              <div><div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div><div style={{ fontSize: 12, color: "#6b7280" }}>{s.grade}</div></div>
              <Badge color={s.paidFees >= s.fees ? "#10b981" : "#f59e0b"}>{s.paidFees >= s.fees ? "مكتمل" : "جزئي"}</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================

// ============================================================
// FILES PAGE (shared component for teacher and student)
// ============================================================
function FilesPage({ db, updateDB, user, today }) {
  const [newFile, setNewFile] = useState({ title: "", type: "schedule", targetRole: "all", url: "", note: "" });
  const [showAddFile, setShowAddFile] = useState(false);
  const isAdmin = user.role === "admin";
  const fileTypes = { schedule: "📅 جدول حصص", announcement: "📢 إعلان", exam: "📝 جدول اختبارات", other: "📎 أخرى" };

  const visibleFiles = (db.files || []).filter(f =>
    f.targetRole === "all" || f.targetRole === user.role
  );

  const addFile = () => {
    if (!newFile.title || !newFile.url) return;
    updateDB(d => ({ ...d, files: [{ id: Date.now(), ...newFile, uploadDate: today, uploadedBy: user.name }, ...(d.files || [])] }));
    setNewFile({ title: "", type: "schedule", targetRole: "all", url: "", note: "" });
    setShowAddFile(false);
  };
  const removeFile = (id) => updateDB(d => ({ ...d, files: (d.files || []).filter(f => f.id !== id) }));

  const typeColor = { schedule: "#10b981", announcement: "#f59e0b", exam: "#ef4444", other: "#6b7280" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: "#111827", margin: 0 }}>الجداول والملفات</h2>
        {isAdmin && <Btn onClick={() => setShowAddFile(true)} icon="plus">رفع ملف جديد</Btn>}
      </div>

      {visibleFiles.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, padding: 60, textAlign: "center", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>📂</div>
          <p style={{ color: "#9ca3af", fontSize: 15 }}>لا توجد ملفات متاحة حالياً</p>
          {isAdmin && <Btn onClick={() => setShowAddFile(true)} icon="plus" style={{ marginTop: 12 }}>ارفع أول ملف</Btn>}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {visibleFiles.map(f => (
            <div key={f.id} style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", borderTop: `4px solid ${typeColor[f.type] || "#6b7280"}`, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 6 }}>{f.title}</div>
                  <Badge color={typeColor[f.type] || "#6b7280"}>{fileTypes[f.type] || f.type}</Badge>
                </div>
                <Badge color="#7c3aed">{f.targetRole === "all" ? "للجميع" : f.targetRole === "teacher" ? "معلمون" : "طلاب"}</Badge>
              </div>
              {f.note && <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>{f.note}</p>}
              <div style={{ fontSize: 11, color: "#9ca3af" }}>رُفع بتاريخ {f.uploadDate} بواسطة {f.uploadedBy}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <a href={f.url} target="_blank" rel="noreferrer"
                  style={{ flex: 1, padding: "10px 0", background: "linear-gradient(135deg,#1a56db,#2563eb)", color: "#fff", borderRadius: 10, textAlign: "center", textDecoration: "none", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Icon name="database" size={14} /> تحميل / فتح
                </a>
                {isAdmin && (
                  <button onClick={() => removeFile(f.id)}
                    style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, cursor: "pointer", color: "#ef4444", display: "flex", alignItems: "center" }}>
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showAddFile} onClose={() => setShowAddFile(false)} title="رفع ملف أو جدول جديد">
        <Field label="عنوان الملف"><Input value={newFile.title} onChange={e => setNewFile({ ...newFile, title: e.target.value })} placeholder="مثال: جدول الحصص — الفصل الثاني" /></Field>
        <Field label="نوع الملف">
          <Select value={newFile.type} onChange={e => setNewFile({ ...newFile, type: e.target.value })}>
            <option value="schedule">جدول حصص</option>
            <option value="announcement">إعلان</option>
            <option value="exam">جدول اختبارات</option>
            <option value="other">أخرى</option>
          </Select>
        </Field>
        <Field label="موجه لـ">
          <Select value={newFile.targetRole} onChange={e => setNewFile({ ...newFile, targetRole: e.target.value })}>
            <option value="all">الجميع</option>
            <option value="teacher">المعلمون فقط</option>
            <option value="student">الطلاب فقط</option>
          </Select>
        </Field>
        <Field label="رابط الملف (Google Drive أو أي رابط مباشر)">
          <Input value={newFile.url} onChange={e => setNewFile({ ...newFile, url: e.target.value })} placeholder="https://drive.google.com/..." />
        </Field>
        <Field label="ملاحظة (اختياري)"><Input value={newFile.note} onChange={e => setNewFile({ ...newFile, note: e.target.value })} placeholder="وصف مختصر..." /></Field>
        <div style={{ background: "#eff6ff", borderRadius: 10, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: "#1d4ed8" }}>
          💡 ارفع الملف على Google Drive → اضغط مشاركة → أي شخص لديه الرابط → انسخ الرابط هنا.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => setShowAddFile(false)}>إلغاء</Btn>
          <Btn onClick={addFile} icon="check">رفع الملف</Btn>
        </div>
      </Modal>
    </div>
  );
}

// TEACHER DASHBOARD
// ============================================================
function TeacherDashboard({ db, updateDB, user, activeSection }) {
  const [msgText, setMsgText] = useState("");
  const [msgTo, setMsgTo] = useState("");
  const myStudents = db.students.filter((s) => s.teacherId === user.id);
  const today = new Date().toLocaleDateString("ar-SA");
  const myAtt = db.teacher_attendance.find((a) => a.teacherId === user.id && a.date === today);

  const markAttendance = (type) => {
    updateDB((d) => {
      const rec = d.teacher_attendance.find((a) => a.teacherId === user.id && a.date === today);
      if (rec) return { ...d, teacher_attendance: d.teacher_attendance.map((a) => a.teacherId === user.id && a.date === today ? { ...a, [type]: new Date().toLocaleTimeString("ar-SA") } : a) };
      return { ...d, teacher_attendance: [...d.teacher_attendance, { id: Date.now(), teacherId: user.id, date: today, [type]: new Date().toLocaleTimeString("ar-SA") }] };
    });
  };

  const recordStudentAttendance = (studentId, present) => {
    const existing = db.attendance.find((a) => a.studentId === studentId && a.date === today);
    if (existing) {
      updateDB((d) => ({ ...d, attendance: d.attendance.map((a) => a.studentId === studentId && a.date === today ? { ...a, present } : a) }));
    } else {
      updateDB((d) => ({ ...d, attendance: [...d.attendance, { id: Date.now(), studentId, date: today, present, teacherId: user.id }] }));
    }
  };

  const rateStudent = (studentId, stars) => {
    const existing = db.ratings.find((r) => r.studentId === studentId && r.teacherId === user.id);
    if (existing) {
      updateDB((d) => ({ ...d, ratings: d.ratings.map((r) => r.studentId === studentId && r.teacherId === user.id ? { ...r, stars, date: today } : r) }));
    } else {
      updateDB((d) => ({ ...d, ratings: [...d.ratings, { id: Date.now(), studentId, teacherId: user.id, stars, date: today }] }));
    }
  };

  const sendMessage = () => {
    if (!msgText.trim() || !msgTo) return;
    updateDB((d) => ({ ...d, messages: [...d.messages, { id: Date.now(), from: user.id, fromName: user.name, fromRole: "teacher", to: msgTo, text: msgText.trim(), date: new Date().toLocaleString("ar-SA") }] }));
    setMsgText("");
  };

  const myMessages = db.messages.filter((m) => m.from === user.id || m.to === user.id);

  if (activeSection === "more") {
    const teacherExtra = [
      { key: "my_attendance", label: "حضوري وانصرافي", icon: "calendar", color: "#10b981" },
      { key: "files", label: "الجداول والملفات", icon: "database", color: "#7c3aed" },
    ];
    return (
      <div>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: "#111827", marginBottom: 16 }}>المزيد</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {teacherExtra.map(item => (
            <button key={item.key} onClick={() => setActiveSection(item.key)}
              style={{ background: "#fff", border: "none", borderRadius: 14, padding: "16px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", width: "100%", fontFamily: "Tajawal, sans-serif", textAlign: "right" }}>
              <div style={{ background: item.color + "18", borderRadius: 12, padding: 10, color: item.color, flexShrink: 0 }}>
                <Icon name={item.icon} size={22} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{item.label}</span>
              <span style={{ marginRight: "auto", color: "#d1d5db" }}>←</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (activeSection === "my_attendance") {
    return (
      <div>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: "#111827", marginBottom: 16 }}>حضوري وانصرافي</h2>
        <AnnouncementBanner text={db.settings.announcement} />
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16, color: "#374151" }}>اليوم — {today}</h3>
          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            <Btn variant="success" onClick={() => markAttendance("in")} disabled={!!myAtt?.in} icon="check">تسجيل الحضور {myAtt?.in ? `(${myAtt.in})` : ""}</Btn>
            <Btn variant="danger" onClick={() => markAttendance("out")} disabled={!myAtt?.in || !!myAtt?.out} icon="logout">تسجيل الانصراف {myAtt?.out ? `(${myAtt.out})` : ""}</Btn>
          </div>
          {myAtt?.in && myAtt?.out && <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 16px", color: "#166534" }}>✓ تم تسجيل حضورك وانصرافك اليوم بنجاح</div>}
        </div>
        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <Table
            headers={["التاريخ", "وقت الحضور", "وقت الانصراف"]}
            rows={db.teacher_attendance.filter((a) => a.teacherId === user.id).reverse().map((a) => [
              a.date,
              a.in ? <Badge color="#10b981">{a.in}</Badge> : "—",
              a.out ? <Badge color="#ef4444">{a.out}</Badge> : "—",
            ])}
          />
        </div>
      </div>
    );
  }

  if (activeSection === "my_students") {
    return (
      <div>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: "#111827", marginBottom: 16 }}>طلابي — حضور اليوم</h2>
        <AnnouncementBanner text={db.settings.announcement} />
        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <Table
            headers={["الطالب", "الصف", "حضور اليوم"]}
            rows={myStudents.map((s) => {
              const att = db.attendance.find((a) => a.studentId === s.id && a.date === today);
              return [
                s.name, s.grade,
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn variant="success" onClick={() => recordStudentAttendance(s.id, true)} style={{ padding: "5px 12px", opacity: att?.present === true ? 1 : 0.5 }}>حاضر {att?.present === true ? "✓" : ""}</Btn>
                  <Btn variant="danger" onClick={() => recordStudentAttendance(s.id, false)} style={{ padding: "5px 12px", opacity: att?.present === false ? 1 : 0.5 }}>غائب {att?.present === false ? "✓" : ""}</Btn>
                </div>,
              ];
            })}
          />
        </div>
      </div>
    );
  }

  if (activeSection === "ratings") {
    return (
      <div>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: "#111827", marginBottom: 16 }}>تقييم الطلاب بالنجوم</h2>
        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <Table
            headers={["الطالب", "الصف", "التقييم الحالي", "تعديل التقييم"]}
            rows={myStudents.map((s) => {
              const rating = db.ratings.find((r) => r.studentId === s.id && r.teacherId === user.id);
              return [s.name, s.grade, <StarRating value={rating?.stars || 0} readonly />, <StarRating value={rating?.stars || 0} onChange={(v) => rateStudent(s.id, v)} />];
            })}
          />
        </div>
      </div>
    );
  }

  if (activeSection === "messages") {
    return (
      <div>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: "#111827", marginBottom: 16 }}>الرسائل</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>إرسال رسالة</h3>
            <Field label="إلى الطالب">
              <Select value={msgTo} onChange={(e) => setMsgTo(e.target.value)}>
                <option value="">اختر الطالب...</option>
                {myStudents.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="نص الرسالة">
              <textarea value={msgText} onChange={(e) => setMsgText(e.target.value)} rows={4} placeholder="اكتب رسالتك هنا..."
                style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 14, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }} />
            </Field>
            <Btn onClick={sendMessage} icon="send">إرسال</Btn>
          </div>
          <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>صندوق الرسائل</h3>
            <div style={{ maxHeight: 400, overflowY: "auto" }}>
              {myMessages.length === 0 ? <p style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", paddingTop: 40 }}>لا توجد رسائل</p>
                : [...myMessages].reverse().map((m) => {
                  const isMe = m.from === user.id;
                  const student = db.students.find((s) => s.id === (isMe ? m.to : m.from));
                  return (
                    <div key={m.id} style={{ marginBottom: 12, padding: "12px 14px", borderRadius: 12, background: isMe ? "#eff6ff" : "#f0fdf4", borderRight: `3px solid ${isMe ? "#1a56db" : "#10b981"}` }}>
                      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{isMe ? `إلى: ${student?.name || "—"}` : `من: ${m.fromName}`} • {m.date}</div>
                      <div style={{ fontSize: 14, color: "#111827" }}>{m.text}</div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeSection === "files") {
    return <FilesPage db={db} updateDB={updateDB} user={user} today={today} />;
  }


  const presentToday = db.attendance.filter((a) => a.teacherId === user.id && a.date === today && a.present).length;
  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 8 }}>مرحباً، {user.name} 👋</h2>
      <p style={{ color: "#6b7280", marginBottom: 16 }}>{user.subject} — {today}</p>
      <AnnouncementBanner text={db.settings.announcement} />
      <div className="mobile-grid-2" style={{ marginBottom: 20 }}>
        <StatCard label="طلابي" value={myStudents.length} icon="graduation" color="#1a56db" />
        <StatCard label="حاضرون اليوم" value={presentToday} icon="check" color="#10b981" />
        <StatCard label="حضوري" value={myAtt?.in ? "مسجّل" : "غير مسجّل"} icon="calendar" color={myAtt?.in ? "#10b981" : "#f59e0b"} />
      </div>
      <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>قائمة طلابي</h3>
        {myStudents.map((s) => {
          const rating = db.ratings.find((r) => r.studentId === s.id && r.teacherId === user.id);
          const att = db.attendance.find((a) => a.studentId === s.id && a.date === today);
          return (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f3f4f6" }}>
              <div><div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div><div style={{ fontSize: 12, color: "#6b7280" }}>{s.grade}</div></div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <StarRating value={rating?.stars || 0} readonly />
                <Badge color={att?.present === true ? "#10b981" : att?.present === false ? "#ef4444" : "#9ca3af"}>
                  {att?.present === true ? "حاضر" : att?.present === false ? "غائب" : "لم يُسجَّل"}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// STUDENT DASHBOARD
// ============================================================
function StudentDashboard({ db, updateDB, user, activeSection }) {
  const [msgText, setMsgText] = useState("");
  const me = db.students.find((s) => s.id === user.id);
  const myTeacher = me ? db.teachers.find((t) => t.id === me.teacherId) : null;
  const myAttendance = db.attendance.filter((a) => a.studentId === user.id);
  const myRating = db.ratings.find((r) => r.studentId === user.id && r.teacherId === me?.teacherId);
  const myMessages = db.messages.filter((m) => m.from === user.id || m.to === user.id);
  const presentDays = myAttendance.filter((a) => a.present).length;
  const absentDays = myAttendance.filter((a) => !a.present).length;
  const remaining = me ? (+me.fees || 0) - (+me.paidFees || 0) : 0;

  const sendMessage = () => {
    if (!msgText.trim() || !myTeacher) return;
    updateDB((d) => ({ ...d, messages: [...d.messages, { id: Date.now(), from: user.id, fromName: user.name, fromRole: "student", to: myTeacher.id, text: msgText.trim(), date: new Date().toLocaleString("ar-SA") }] }));
    setMsgText("");
  };

  if (activeSection === "my_report") {
    return (
      <div>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: "#111827", marginBottom: 16 }}>تقريري الأكاديمي</h2>
        <AnnouncementBanner text={db.settings.announcement} />
        <div className="mobile-grid-2" style={{ marginBottom: 20 }}>
          <StatCard label="معلمي" value={myTeacher?.name || "—"} icon="users" color="#1a56db" />
          <StatCard label="أيام الحضور" value={presentDays} icon="check" color="#10b981" />
          <StatCard label="أيام الغياب" value={absentDays} icon="close" color="#ef4444" />
          <StatCard label="تقييمي" value={myRating ? "⭐".repeat(myRating.stars) : "لا يوجد"} icon="star" color="#f59e0b" />
        </div>
        {me && (
          <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>معلوماتي</h3>
            {[{ label: "الاسم", value: me.name }, { label: "الصف الدراسي", value: me.grade }, { label: "المعلم", value: myTeacher?.name || "—" }, { label: "المادة", value: myTeacher?.subject || "—" }].map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: i < 3 ? "1px solid #f3f4f6" : "none" }}>
                <span style={{ color: "#6b7280", fontSize: 14 }}>{item.label}</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{item.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (activeSection === "my_attendance") {
    return (
      <div>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: "#111827", marginBottom: 16 }}>سجل حضوري</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
          <StatCard label="أيام الحضور" value={presentDays} icon="check" color="#10b981" />
          <StatCard label="أيام الغياب" value={absentDays} icon="close" color="#ef4444" />
        </div>
        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <Table
            headers={["التاريخ", "الحالة"]}
            rows={[...myAttendance].reverse().map((a) => [
              a.date,
              <Badge color={a.present ? "#10b981" : "#ef4444"}>{a.present ? "حاضر ✓" : "غائب ✗"}</Badge>,
            ])}
          />
        </div>
      </div>
    );
  }

  if (activeSection === "my_fees") {
    const pct = me && me.fees > 0 ? Math.round((me.paidFees / me.fees) * 100) : 0;
    return (
      <div>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: "#111827", marginBottom: 16 }}>حالة الرسوم الدراسية</h2>
        <AnnouncementBanner text={db.settings.announcement} />
        {me && (
          <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div className="mobile-grid-2" style={{ marginBottom: 20 }}>
              <StatCard label="إجمالي الرسوم" value={(+me.fees).toLocaleString() + " ر.س"} icon="money" color="#1a56db" />
              <StatCard label="المدفوع" value={(+me.paidFees).toLocaleString() + " ر.س"} icon="check" color="#10b981" />
              <StatCard label="المتبقي" value={remaining.toLocaleString() + " ر.س"} icon="bell" color={remaining > 0 ? "#ef4444" : "#10b981"} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 14, color: "#374151", fontWeight: 600 }}>نسبة السداد</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: pct >= 100 ? "#10b981" : "#1a56db" }}>{pct}%</span>
              </div>
              <div style={{ background: "#f3f4f6", borderRadius: 20, height: 14, overflow: "hidden" }}>
                <div style={{ background: pct >= 100 ? "linear-gradient(90deg,#10b981,#059669)" : "linear-gradient(90deg,#1a56db,#2563eb)", height: "100%", width: pct + "%", transition: "width 0.8s ease", borderRadius: 20 }} />
              </div>
            </div>
            <Badge color={remaining > 0 ? "#f59e0b" : "#10b981"}>{remaining > 0 ? `متبقي ${remaining.toLocaleString()} ر.س للسداد` : "✓ تم سداد جميع الرسوم"}</Badge>
          </div>
        )}
      </div>
    );
  }

  if (activeSection === "messages") {
    return (
      <div>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: "#111827", marginBottom: 16 }}>مراسلة المعلم</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>إرسال رسالة لـ {myTeacher?.name || "المعلم"}</h3>
            {!myTeacher ? <p style={{ color: "#9ca3af", fontSize: 13 }}>لا يوجد معلم مرتبط بحسابك</p> : (
              <>
                <Field label="رسالتك">
                  <textarea value={msgText} onChange={(e) => setMsgText(e.target.value)} rows={5} placeholder="اكتب رسالتك هنا..."
                    style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 14, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }} />
                </Field>
                <Btn onClick={sendMessage} icon="send">إرسال الرسالة</Btn>
              </>
            )}
          </div>
          <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>المحادثات</h3>
            <div style={{ maxHeight: 400, overflowY: "auto" }}>
              {myMessages.length === 0 ? <p style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", paddingTop: 40 }}>لا توجد رسائل</p>
                : [...myMessages].reverse().map((m) => {
                  const isMe = m.from === user.id;
                  return (
                    <div key={m.id} style={{ marginBottom: 12, padding: "12px 14px", borderRadius: 12, background: isMe ? "#eff6ff" : "#f0fdf4", borderRight: `3px solid ${isMe ? "#1a56db" : "#10b981"}` }}>
                      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{isMe ? "أنت" : m.fromName} • {m.date}</div>
                      <div style={{ fontSize: 14, color: "#111827" }}>{m.text}</div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeSection === "files") {
    return <FilesPage db={db} updateDB={updateDB} user={user} today={today || new Date().toLocaleDateString("ar-SA")} />;
  }

  if (activeSection === "notifications") {
    const myNotifs = (db.notifications || []).filter(n => n.studentId === user.id);
    return (
      <div>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: "#111827", marginBottom: 16 }}>إشعاراتي</h2>
        {myNotifs.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 16, padding: 60, textAlign: "center", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🔔</div>
            <p style={{ color: "#9ca3af" }}>لا توجد إشعارات</p>
          </div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
            <Table
              headers={["الإشعار", "التاريخ", "النوع"]}
              rows={myNotifs.map(n => [
                <span style={{ fontSize: 14, color: "#374151" }}>{n.msg}</span>,
                n.date,
                <Badge color={n.type === "absent" ? "#ef4444" : "#f59e0b"}>{n.type === "absent" ? "غياب" : "تنبيه"}</Badge>,
              ])}
            />
          </div>
        )}
      </div>
    );
  }


  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 8 }}>مرحباً، {user.name} 👋</h2>
      <p style={{ color: "#6b7280", marginBottom: 16 }}>لوحتي الشخصية</p>
      <AnnouncementBanner text={db.settings.announcement} />
      <div className="mobile-grid-2" style={{ marginBottom: 20 }}>
        <StatCard label="معلمي" value={myTeacher?.name || "—"} icon="users" color="#1a56db" />
        <StatCard label="أيام الحضور" value={presentDays} icon="check" color="#10b981" />
        <StatCard label="تقييمي" value={myRating ? myRating.stars + "/5" : "—"} icon="star" color="#f59e0b" />
        <StatCard label="رسوم متبقية" value={remaining > 0 ? remaining.toLocaleString() + " ر.س" : "مكتمل ✓"} icon="money" color={remaining > 0 ? "#ef4444" : "#10b981"} />
      </div>
      {me && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>معلوماتي</h3>
            {[{ label: "الاسم", value: me.name }, { label: "الصف", value: me.grade }, { label: "المعلم", value: myTeacher?.name || "—" }, { label: "المادة", value: myTeacher?.subject || "—" }].map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < 3 ? "1px solid #f3f4f6" : "none" }}>
                <span style={{ color: "#6b7280", fontSize: 14 }}>{item.label}</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{item.value}</span>
              </div>
            ))}
          </div>
          <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>تقييمي</h3>
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <StarRating value={myRating?.stars || 0} readonly />
              <p style={{ color: "#6b7280", fontSize: 13, marginTop: 12 }}>{myRating ? `تقييمك من معلمك: ${myRating.stars}/5 نجوم` : "لم يتم تقييمك بعد"}</p>
            </div>
            <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: "#374151" }}>نسبة سداد الرسوم</span>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{me.fees > 0 ? Math.round((me.paidFees / me.fees) * 100) : 0}%</span>
              </div>
              <div style={{ background: "#f3f4f6", borderRadius: 20, height: 10, overflow: "hidden" }}>
                <div style={{ background: "linear-gradient(90deg,#1a56db,#2563eb)", height: "100%", width: (me.fees > 0 ? Math.round((me.paidFees / me.fees) * 100) : 0) + "%", transition: "width 0.8s ease" }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
