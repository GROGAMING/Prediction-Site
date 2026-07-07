import React, { useState, useEffect, useCallback } from "react";
import { Trophy, Users, CalendarClock, Shield, LogOut, Plus, Check, Lock, RefreshCw, Copy } from "lucide-react";
import { storage } from "./storage";

/* =====================================================================
   FULLTIME — Premier League Predictions MVP
   Scoring: exact score = 3 pts, correct result = 1 pt, else 0.

   Storage keys (see src/storage.js — localStorage now, Supabase later):
     app:users     { name: {pin, joined, admin} }
     app:fixtures  [ {id, gw, home, away, ko, res:{h,a}|null} ]
     pred:{name}   { fixtureId: {h,a} }
     app:leagues   { CODE: {name, members:[]} }
     app:board     { name: {pts, exact, res, played} }
     app:pot       { amount }
     session       { name }

   PAYMENTS (future): replace app:pot with a ledger.
     Stripe Checkout on join → entries table → pot = sum(entries) minus
     platform fee → payouts table at season end from final board.
     Pooled entry-fee competitions may constitute regulated gambling in
     Ireland (Gambling Regulation Act 2024). Verify licensing first.
   ===================================================================== */

const APP_NAME = "FULLTIME";
const TEST_MODE = true; // true = skips login, signs in as "Tester" (admin). Set false before sharing.

const INK = "#141B16";
const GREEN = "#1B6B3F";
const AMBER = "#DE9B1C";
const BG = "#F5F6F1";
const LINE = "#E1E5DA";
const DISPLAY = "'Barlow Condensed', system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

const TEAM_SUGGESTIONS = [
  "Arsenal","Aston Villa","Bournemouth","Brentford","Brighton","Burnley",
  "Chelsea","Crystal Palace","Everton","Fulham","Leeds","Liverpool",
  "Man City","Man United","Newcastle","Nottm Forest","Sunderland",
  "Tottenham","West Ham","Wolves",
];

/* ---------------- storage helpers ---------------- */
async function sGet(key) {
  try {
    const r = await storage.get(key);
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
}
async function sSet(key, val) {
  try { await storage.set(key, JSON.stringify(val)); return true; }
  catch (e) { console.error("storage set failed", e); return false; }
}
async function hashPin(name, pin) {
  const data = new TextEncoder().encode(`${name.toLowerCase()}::${pin}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ---------------- scoring ---------------- */
export function scorePrediction(p, r) {
  if (!p || !r || r.h == null || r.a == null) return null;
  if (p.h === r.h && p.a === r.a) return 3;
  if (Math.sign(p.h - p.a) === Math.sign(r.h - r.a)) return 1;
  return 0;
}

async function recalcBoard(fixtures) {
  const finished = fixtures.filter(f => f.res);
  const users = (await sGet("app:users")) || {};
  const board = {};
  for (const name of Object.keys(users)) {
    const preds = (await sGet(`pred:${name}`)) || {};
    let pts = 0, exact = 0, res = 0, played = 0;
    for (const f of finished) {
      const s = scorePrediction(preds[f.id], f.res);
      if (s === null) continue;
      played += 1; pts += s;
      if (s === 3) exact += 1;
      if (s === 1) res += 1;
    }
    board[name] = { pts, exact, res, played };
  }
  await sSet("app:board", board);
  return board;
}

/* ---------------- shared UI bits ---------------- */
function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-widest mb-1" style={{ color: "#6B7568", fontFamily: DISPLAY, fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}
const inputCls = "w-full rounded-md border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2";
const inputStyle = { borderColor: LINE, color: INK };

function Btn({ children, onClick, kind = "primary", disabled, full }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-40";
  const style = kind === "primary"
    ? { background: GREEN, color: "#fff" }
    : kind === "amber"
    ? { background: AMBER, color: INK }
    : { background: "#fff", color: INK, border: `1px solid ${LINE}` };
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${full ? "w-full" : ""}`} style={style}>
      {children}
    </button>
  );
}

function PtsBadge({ pts }) {
  if (pts === null) return null;
  const bg = pts === 3 ? GREEN : pts === 1 ? AMBER : "#C7CCC2";
  const fg = pts === 1 ? INK : "#fff";
  return (
    <span className="text-xs px-2 py-0.5 rounded" style={{ background: bg, color: fg, fontFamily: MONO, fontWeight: 700 }}>
      +{pts}
    </span>
  );
}

/* ---------------- auth screen ---------------- */
function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr("");
    const clean = name.trim();
    if (!/^[A-Za-z0-9_ ]{2,20}$/.test(clean)) { setErr("Name: 2–20 letters or numbers."); return; }
    if (!/^\d{4}$/.test(pin)) { setErr("PIN must be exactly 4 digits."); return; }
    setBusy(true);
    const users = (await sGet("app:users")) || {};
    const key = clean;
    const h = await hashPin(clean, pin);
    if (mode === "register") {
      if (users[key]) { setErr("Name already taken."); setBusy(false); return; }
      const isFirst = Object.keys(users).length === 0;
      users[key] = { pin: h, joined: Date.now(), admin: isFirst };
      await sSet("app:users", users);
      await sSet("session", { name: key });
      onLogin(key, isFirst);
    } else {
      if (!users[key] || users[key].pin !== h) { setErr("Wrong name or PIN."); setBusy(false); return; }
      await sSet("session", { name: key });
      onLogin(key, !!users[key].admin);
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: BG }}>
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 56, lineHeight: 1, color: INK, letterSpacing: "0.01em", fontStyle: "italic" }}>
            {APP_NAME}
          </div>
          <div className="mt-1 text-sm" style={{ color: GREEN, fontFamily: MONO, fontWeight: 500 }}>
            Premier League predictions · 3 / 1 / 0
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 space-y-4" style={{ border: `1px solid ${LINE}` }}>
          <div className="flex rounded-md overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
            {["login", "register"].map(m => (
              <button key={m} onClick={() => { setMode(m); setErr(""); }}
                className="flex-1 py-2 text-sm font-semibold capitalize"
                style={mode === m ? { background: INK, color: "#fff" } : { background: "#fff", color: INK }}>
                {m === "login" ? "Log in" : "Sign up"}
              </button>
            ))}
          </div>
          <Field label="Name">
            <input className={inputCls} style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Killian" />
          </Field>
          <Field label="4-digit PIN">
            <input className={inputCls} style={inputStyle} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric" placeholder="••••" type="password" />
          </Field>
          {err && <div className="text-sm" style={{ color: "#8A2A2A" }}>{err}</div>}
          <Btn full onClick={submit} disabled={busy}>{busy ? "…" : mode === "login" ? "Log in" : "Create account"}</Btn>
          <p className="text-xs" style={{ color: "#6B7568" }}>
            First account created becomes the admin. PINs are hashed but this is MVP-grade auth, not banking-grade.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------------- predict tab ---------------- */
function PredictTab({ user, fixtures, preds, setPreds }) {
  const [draft, setDraft] = useState({});
  const [savedFlash, setSavedFlash] = useState(false);
  const now = Date.now();

  const upcoming = fixtures.filter(f => !f.res).sort((a, b) => new Date(a.ko) - new Date(b.ko));
  const finished = fixtures.filter(f => f.res).sort((a, b) => new Date(b.ko) - new Date(a.ko));

  const gws = [...new Set(upcoming.map(f => f.gw))].sort((a, b) => a - b);

  const getVal = (id, side) => {
    const d = draft[id]; const p = preds[id];
    const v = d?.[side] ?? p?.[side];
    return v == null ? "" : v;
  };
  const setVal = (id, side, raw) => {
    const v = raw === "" ? null : Math.max(0, Math.min(20, parseInt(raw, 10) || 0));
    setDraft(d => ({ ...d, [id]: { ...(preds[id] || {}), ...(d[id] || {}), [side]: v } }));
  };

  const save = async () => {
    const merged = { ...preds };
    for (const [id, p] of Object.entries(draft)) {
      const fx = fixtures.find(f => f.id === id);
      if (!fx || new Date(fx.ko).getTime() <= Date.now()) continue; // locked
      if (p.h != null && p.a != null) merged[id] = { h: p.h, a: p.a };
    }
    await sSet(`pred:${user}`, merged);
    setPreds(merged); setDraft({});
    setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1600);
  };

  return (
    <div className="space-y-6 pb-4">
      {upcoming.length === 0 && (
        <div className="bg-white rounded-xl p-6 text-center text-sm" style={{ border: `1px solid ${LINE}`, color: "#6B7568" }}>
          No upcoming fixtures. The admin adds fixtures from the Admin tab.
        </div>
      )}
      {gws.map(gw => (
        <div key={gw}>
          <div className="flex items-baseline gap-2 mb-2">
            <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 26, color: INK }}>GW {gw}</span>
            <span className="text-xs" style={{ color: "#6B7568" }}>predictions lock at kick-off</span>
          </div>
          <div className="space-y-2">
            {upcoming.filter(f => f.gw === gw).map(f => {
              const locked = new Date(f.ko).getTime() <= now;
              return (
                <div key={f.id} className="bg-white rounded-xl px-3 py-3" style={{ border: `1px solid ${LINE}` }}>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-right text-sm font-semibold truncate" style={{ color: INK }}>{f.home}</span>
                    <input className="w-11 text-center rounded-md border py-1.5" style={{ ...inputStyle, fontFamily: MONO, fontWeight: 700 }}
                      inputMode="numeric" disabled={locked} value={getVal(f.id, "h")} onChange={e => setVal(f.id, "h", e.target.value)} />
                    <span style={{ fontFamily: MONO, color: "#9AA294" }}>–</span>
                    <input className="w-11 text-center rounded-md border py-1.5" style={{ ...inputStyle, fontFamily: MONO, fontWeight: 700 }}
                      inputMode="numeric" disabled={locked} value={getVal(f.id, "a")} onChange={e => setVal(f.id, "a", e.target.value)} />
                    <span className="flex-1 text-sm font-semibold truncate" style={{ color: INK }}>{f.away}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-center gap-1.5 text-xs" style={{ color: "#6B7568" }}>
                    {locked && <Lock size={11} />}
                    {new Date(f.ko).toLocaleString("en-IE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {upcoming.length > 0 && (
        <Btn full onClick={save} kind={savedFlash ? "amber" : "primary"}>
          {savedFlash ? <><Check size={16} /> Saved</> : "Save predictions"}
        </Btn>
      )}

      {finished.length > 0 && (
        <div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 26, color: INK }} className="mb-2">Results</div>
          <div className="space-y-2">
            {finished.slice(0, 20).map(f => {
              const p = preds[f.id];
              const pts = scorePrediction(p, f.res);
              return (
                <div key={f.id} className="bg-white rounded-xl px-3 py-2.5 flex items-center gap-2" style={{ border: `1px solid ${LINE}` }}>
                  <span className="flex-1 text-right text-sm truncate" style={{ color: INK }}>{f.home}</span>
                  <span className="px-2 py-0.5 rounded text-sm" style={{ background: INK, color: "#fff", fontFamily: MONO, fontWeight: 700 }}>
                    {f.res.h}–{f.res.a}
                  </span>
                  <span className="flex-1 text-sm truncate" style={{ color: INK }}>{f.away}</span>
                  <div className="w-20 text-right space-x-1">
                    {p && <span className="text-xs" style={{ fontFamily: MONO, color: "#6B7568" }}>{p.h}–{p.a}</span>}
                    <PtsBadge pts={p ? pts : null} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- tables ---------------- */
function BoardTable({ board, members, user }) {
  const rows = Object.entries(board)
    .filter(([n]) => !members || members.includes(n))
    .map(([n, s]) => ({ name: n, ...s }))
    .sort((a, b) => b.pts - a.pts || b.exact - a.exact || a.name.localeCompare(b.name));

  if (rows.length === 0) return <div className="text-sm px-2 py-4" style={{ color: "#6B7568" }}>No scores yet — the table fills in once results are entered.</div>;

  return (
    <div className="bg-white rounded-xl overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
      <div className="grid grid-cols-12 px-3 py-2 text-xs uppercase tracking-wider" style={{ background: INK, color: "#B9C2B4", fontFamily: DISPLAY, fontWeight: 600 }}>
        <span className="col-span-1">#</span><span className="col-span-6">Player</span>
        <span className="col-span-2 text-right">Exact</span><span className="col-span-3 text-right">Pts</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.name} className="grid grid-cols-12 px-3 py-2.5 items-center text-sm"
          style={{ borderTop: `1px solid ${LINE}`, background: r.name === user ? "#EEF4EA" : "#fff" }}>
          <span className="col-span-1" style={{ fontFamily: MONO, color: i < 3 ? AMBER : "#9AA294", fontWeight: 700 }}>{i + 1}</span>
          <span className="col-span-6 font-semibold truncate" style={{ color: INK }}>{r.name}{r.name === user ? " (you)" : ""}</span>
          <span className="col-span-2 text-right" style={{ fontFamily: MONO, color: "#6B7568" }}>{r.exact}</span>
          <span className="col-span-3 text-right" style={{ fontFamily: MONO, fontWeight: 700, color: INK, fontSize: 15 }}>{r.pts}</span>
        </div>
      ))}
    </div>
  );
}

function TablesTab({ board, user, pot }) {
  return (
    <div className="space-y-4 pb-4">
      {pot?.amount > 0 && (
        <div className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: INK }}>
          <div>
            <div className="text-xs uppercase tracking-widest" style={{ color: "#B9C2B4", fontFamily: DISPLAY, fontWeight: 600 }}>Grand prize pot</div>
            <div className="text-xs mt-0.5" style={{ color: "#8A948A" }}>Winner takes the season</div>
          </div>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 24, color: AMBER }}>€{pot.amount}</div>
        </div>
      )}
      <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 26, color: INK }}>Overall table</div>
      <BoardTable board={board} user={user} />
    </div>
  );
}

/* ---------------- leagues ---------------- */
function LeaguesTab({ user, board }) {
  const [leagues, setLeagues] = useState(null);
  const [newName, setNewName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [open, setOpen] = useState(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => setLeagues((await sGet("app:leagues")) || {}), []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!newName.trim()) return;
    const all = (await sGet("app:leagues")) || {};
    let code;
    do { code = Array.from({ length: 5 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join(""); } while (all[code]);
    all[code] = { name: newName.trim(), members: [user] };
    await sSet("app:leagues", all);
    setLeagues(all); setNewName(""); setMsg(`League created — code ${code}`);
  };

  const join = async () => {
    const code = joinCode.trim().toUpperCase();
    const all = (await sGet("app:leagues")) || {};
    if (!all[code]) { setMsg("No league with that code."); return; }
    if (!all[code].members.includes(user)) { all[code].members.push(user); await sSet("app:leagues", all); }
    setLeagues(all); setJoinCode(""); setMsg(`Joined ${all[code].name}.`);
  };

  const mine = leagues ? Object.entries(leagues).filter(([, l]) => l.members.includes(user)) : [];

  return (
    <div className="space-y-4 pb-4">
      <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 26, color: INK }}>Friends leagues</div>
      <div className="bg-white rounded-xl p-4 space-y-3" style={{ border: `1px solid ${LINE}` }}>
        <div className="flex gap-2">
          <input className={inputCls} style={inputStyle} placeholder="New league name" value={newName} onChange={e => setNewName(e.target.value)} />
          <Btn onClick={create}><Plus size={16} /></Btn>
        </div>
        <div className="flex gap-2">
          <input className={inputCls} style={{ ...inputStyle, fontFamily: MONO }} placeholder="Join with code" value={joinCode} onChange={e => setJoinCode(e.target.value)} />
          <Btn kind="ghost" onClick={join}>Join</Btn>
        </div>
        {msg && <div className="text-sm" style={{ color: GREEN }}>{msg}</div>}
      </div>

      {mine.length === 0 && leagues && (
        <div className="text-sm px-1" style={{ color: "#6B7568" }}>You're not in any league yet. Create one and share the code.</div>
      )}
      {mine.map(([code, l]) => (
        <div key={code}>
          <button className="w-full bg-white rounded-xl px-4 py-3 flex items-center justify-between" style={{ border: `1px solid ${LINE}` }}
            onClick={() => setOpen(open === code ? null : code)}>
            <span className="font-semibold text-sm" style={{ color: INK }}>{l.name}</span>
            <span className="flex items-center gap-2 text-xs" style={{ fontFamily: MONO, color: "#6B7568" }}>
              {l.members.length} in · {code}
              <Copy size={13} onClick={e => { e.stopPropagation(); navigator.clipboard?.writeText(code); }} />
            </span>
          </button>
          {open === code && <div className="mt-2"><BoardTable board={board} members={l.members} user={user} /></div>}
        </div>
      ))}
    </div>
  );
}

/* ---------------- admin ---------------- */
function AdminTab({ fixtures, setFixtures, setBoard, pot, setPot }) {
  const [gw, setGw] = useState("1");
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [ko, setKo] = useState("");
  const [resDraft, setResDraft] = useState({});
  const [potDraft, setPotDraft] = useState(pot?.amount ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const addFixture = async () => {
    if (!home.trim() || !away.trim() || !ko || !gw) { setNote("Fill gameweek, both teams and kick-off."); return; }
    const f = { id: `f${Date.now()}`, gw: parseInt(gw, 10), home: home.trim(), away: away.trim(), ko: new Date(ko).toISOString(), res: null };
    const next = [...fixtures, f];
    await sSet("app:fixtures", next);
    setFixtures(next); setHome(""); setAway(""); setNote("Fixture added.");
  };

  const saveResult = async (id) => {
    const d = resDraft[id];
    if (!d || d.h == null || d.a == null) return;
    setBusy(true);
    const next = fixtures.map(f => f.id === id ? { ...f, res: { h: d.h, a: d.a } } : f);
    await sSet("app:fixtures", next);
    setFixtures(next);
    const b = await recalcBoard(next);
    setBoard(b);
    setBusy(false); setNote("Result saved, table recalculated.");
  };

  const removeFixture = async (id) => {
    const next = fixtures.filter(f => f.id !== id);
    await sSet("app:fixtures", next);
    setFixtures(next);
  };

  const savePot = async () => {
    const p = { amount: Math.max(0, parseFloat(potDraft) || 0) };
    await sSet("app:pot", p); setPot(p); setNote("Pot updated.");
  };

  const pending = fixtures.filter(f => !f.res).sort((a, b) => new Date(a.ko) - new Date(b.ko));

  return (
    <div className="space-y-5 pb-4">
      <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 26, color: INK }}>Admin</div>

      <div className="bg-white rounded-xl p-4 space-y-3" style={{ border: `1px solid ${LINE}` }}>
        <div className="text-sm font-semibold" style={{ color: INK }}>Add fixture</div>
        <div className="grid grid-cols-4 gap-2">
          <Field label="GW"><input className={inputCls} style={inputStyle} inputMode="numeric" value={gw} onChange={e => setGw(e.target.value)} /></Field>
          <div className="col-span-3"><Field label="Kick-off"><input className={inputCls} style={inputStyle} type="datetime-local" value={ko} onChange={e => setKo(e.target.value)} /></Field></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Home"><input className={inputCls} style={inputStyle} list="teams" value={home} onChange={e => setHome(e.target.value)} /></Field>
          <Field label="Away"><input className={inputCls} style={inputStyle} list="teams" value={away} onChange={e => setAway(e.target.value)} /></Field>
        </div>
        <datalist id="teams">{TEAM_SUGGESTIONS.map(t => <option key={t} value={t} />)}</datalist>
        <Btn full onClick={addFixture}><Plus size={16} /> Add fixture</Btn>
      </div>

      <div className="bg-white rounded-xl p-4 space-y-3" style={{ border: `1px solid ${LINE}` }}>
        <div className="text-sm font-semibold flex items-center gap-2" style={{ color: INK }}>
          Enter results {busy && <RefreshCw size={14} className="animate-spin" />}
        </div>
        {pending.length === 0 && <div className="text-sm" style={{ color: "#6B7568" }}>No fixtures awaiting results.</div>}
        {pending.map(f => (
          <div key={f.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1 truncate" style={{ color: INK }}>GW{f.gw} · {f.home} v {f.away}</span>
            <input className="w-10 text-center rounded-md border py-1" style={{ ...inputStyle, fontFamily: MONO }} inputMode="numeric"
              onChange={e => setResDraft(d => ({ ...d, [f.id]: { ...(d[f.id] || {}), h: e.target.value === "" ? null : parseInt(e.target.value, 10) || 0 } }))} />
            <input className="w-10 text-center rounded-md border py-1" style={{ ...inputStyle, fontFamily: MONO }} inputMode="numeric"
              onChange={e => setResDraft(d => ({ ...d, [f.id]: { ...(d[f.id] || {}), a: e.target.value === "" ? null : parseInt(e.target.value, 10) || 0 } }))} />
            <Btn kind="ghost" onClick={() => saveResult(f.id)}><Check size={14} /></Btn>
            <button className="text-xs px-1" style={{ color: "#8A2A2A" }} onClick={() => removeFixture(f.id)}>✕</button>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl p-4 space-y-3" style={{ border: `1px solid ${LINE}` }}>
        <div className="text-sm font-semibold" style={{ color: INK }}>Grand prize pot (€)</div>
        <div className="flex gap-2">
          <input className={inputCls} style={{ ...inputStyle, fontFamily: MONO }} inputMode="decimal" value={potDraft} onChange={e => setPotDraft(e.target.value)} />
          <Btn kind="amber" onClick={savePot}>Set</Btn>
        </div>
        <p className="text-xs" style={{ color: "#6B7568" }}>
          Manual for now. Payment-funded pots (entry fee → pot → payouts) belong in the production build and may require a gambling licence in Ireland.
        </p>
      </div>

      {note && <div className="text-sm px-1" style={{ color: GREEN }}>{note}</div>}
    </div>
  );
}

/* ---------------- app shell ---------------- */
export default function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("predict");
  const [fixtures, setFixtures] = useState([]);
  const [preds, setPreds] = useState({});
  const [board, setBoard] = useState({});
  const [pot, setPot] = useState(null);

  useEffect(() => {
    (async () => {
      if (TEST_MODE) {
        const users = (await sGet("app:users")) || {};
        if (!users["Tester"]) {
          users["Tester"] = { pin: "test", joined: Date.now(), admin: true };
          await sSet("app:users", users);
        } else if (!users["Tester"].admin) {
          users["Tester"].admin = true;
          await sSet("app:users", users);
        }
        setUser("Tester"); setIsAdmin(true); setLoading(false);
        return;
      }
      const sess = await sGet("session");
      if (sess?.name) {
        const users = (await sGet("app:users")) || {};
        if (users[sess.name]) { setUser(sess.name); setIsAdmin(!!users[sess.name].admin); }
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setFixtures((await sGet("app:fixtures")) || []);
      setPreds((await sGet(`pred:${user}`)) || {});
      setBoard((await sGet("app:board")) || {});
      setPot((await sGet("app:pot")) || null);
    })();
  }, [user]);

  const logout = async () => {
    try { await storage.delete("session"); } catch {}
    setUser(null); setIsAdmin(false); setTab("predict");
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: BG, fontFamily: MONO, color: "#6B7568" }}>loading…</div>;
  }
  if (!user) return <AuthScreen onLogin={(n, a) => { setUser(n); setIsAdmin(a); }} />;

  const tabs = [
    { id: "predict", label: "Predict", icon: CalendarClock },
    { id: "tables", label: "Tables", icon: Trophy },
    { id: "leagues", label: "Leagues", icon: Users },
    ...(isAdmin ? [{ id: "admin", label: "Admin", icon: Shield }] : []),
  ];

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      <header className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between" style={{ background: INK }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontStyle: "italic", fontSize: 24, color: "#fff", letterSpacing: "0.02em" }}>
          {APP_NAME}<span style={{ color: AMBER }}>.</span>
        </span>
        <button onClick={logout} className="flex items-center gap-1.5 text-xs" style={{ color: "#B9C2B4", fontFamily: MONO }}>
          {user} <LogOut size={13} />
        </button>
      </header>

      <main className="max-w-md mx-auto px-4 pt-5 pb-24">
        {tab === "predict" && <PredictTab user={user} fixtures={fixtures} preds={preds} setPreds={setPreds} />}
        {tab === "tables" && <TablesTab board={board} user={user} pot={pot} />}
        {tab === "leagues" && <LeaguesTab user={user} board={board} />}
        {tab === "admin" && isAdmin && <AdminTab fixtures={fixtures} setFixtures={setFixtures} setBoard={setBoard} pot={pot} setPot={setPot} />}
      </main>

      <nav className="fixed bottom-0 inset-x-0" style={{ background: "#fff", borderTop: `1px solid ${LINE}` }}>
        <div className="max-w-md mx-auto flex">
          {tabs.map(t => {
            const Icon = t.icon; const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className="flex-1 py-2.5 flex flex-col items-center gap-0.5">
                <Icon size={19} style={{ color: active ? GREEN : "#9AA294" }} />
                <span className="text-xs" style={{ color: active ? INK : "#9AA294", fontFamily: DISPLAY, fontWeight: 600 }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
