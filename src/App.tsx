import { useState, useEffect, useRef, useCallback } from "react";

/* ─────────────────────────────────────────
   WEEKLY SNAPSHOT STORAGE
───────────────────────────────────────── */
function getWeeklySnaps() {
  try { return window[WEEKLY_KEY] || []; } catch (e) { return []; }
}
function saveWeeklySnaps(snaps) {
  try { window[WEEKLY_KEY] = snaps; } catch (e) {}
}
function saveCurrentWeek(P) {
  var snaps = getWeeklySnaps();
  var TV_  = sumField(P, "v");
  var TI_  = sumField(P, "inv");
  var now  = new Date();
  var weekId = now.getFullYear() + "-W" + getWeekNumber(now);
  /* Overwrite same week, append new week */
  var existIdx = -1;
  for (var i = 0; i < snaps.length; i++) {
    if (snaps[i].weekId === weekId) { existIdx = i; break; }
  }
  var snap = {
    weekId: weekId,
    date:   now.toISOString(),
    totalValue: TV_,
    totalInvested: TI_,
    pnl:   TV_ - TI_,
    pnlPct: ((TV_ - TI_) / TI_ * 100).toFixed(2),
    holdings: P.map(function(h) {
      return { t: h.t, v: h.v, c: h.c, pnl: ((h.v - h.inv) / h.inv * 100).toFixed(1) };
    }),
  };
  if (existIdx >= 0) { snaps[existIdx] = snap; }
  else { snaps.push(snap); }
  /* Keep last 52 weeks */
  if (snaps.length > 52) { snaps = snaps.slice(-52); }
  saveWeeklySnaps(snaps);
  return snaps;
}
function getWeekNumber(d) {
  var onejan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7);
}

/* ─────────────────────────────────────────
   SMART REBALANCE (accounts for $2 tx cost)
───────────────────────────────────────── */
function generateSmartRebalance(holdings, TV) {
  if (!holdings || !holdings.length) { return []; }
  var actions = [];
  for (var i = 0; i < holdings.length; i++) {
    var h = holdings[i];
    var curDollar  = (h.currentWeight / 100) * TV;
    var idealDollar = (h.idealWeight / 100) * TV;
    var diff = idealDollar - curDollar;
    var absDiff = Math.abs(diff);
    /* Skip if trade is too small to justify $2 fee */
    if (absDiff < MIN_TRADE) { continue; }
    /* Ensure profit after tx cost */
    var netTrade = absDiff - TX_COST;
    if (netTrade <= 0) { continue; }
    if (diff > 0) {
      actions.push({
        ticker: h.ticker,
        action: "BUY",
        amount: absDiff,
        net: netTrade,
        reason: h.verdict === "OVERWEIGHT" ? "Alpha signal supports adding" : "Rebalance toward ideal weight",
      });
    } else {
      actions.push({
        ticker: h.ticker,
        action: "SELL",
        amount: absDiff,
        net: netTrade,
        reason: h.verdict === "EXIT" ? "Exit signal — take profits" : "Trim to reduce concentration",
      });
    }
  }
  /* Sort by largest trade first */
  actions.sort(function(a, b) { return b.amount - a.amount; });
  return actions;
}

/* ─────────────────────────────────────────
   WEEKLY TAB
───────────────────────────────────────── */
function WeeklyTab({ portfolio, signals, TV, TI, onGoToUpload }) {
  var [snaps, setSnaps] = useState(getWeeklySnaps());
  var [saved, setSaved] = useState(false);

  function doSaveWeek() {
    var updated = saveCurrentWeek(portfolio);
    setSnaps(updated);
    setSaved(true);
    setTimeout(function() { setSaved(false); }, 3000);
  }

  var smartActions = generateSmartRebalance(signals ? signals.holdings : [], TV);
  var totalTxCost  = smartActions.length * TX_COST;

  /* Weekly change calculation */
  var prevSnap = snaps.length >= 2 ? snaps[snaps.length - 2] : null;
  var weeklyChg = prevSnap ? (TV - prevSnap.totalValue) : null;
  var weeklyPct = prevSnap ? ((TV - prevSnap.totalValue) / prevSnap.totalValue * 100).toFixed(2) : null;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Save + Status */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: C.accent, fontWeight: 700, letterSpacing: 1.5, marginBottom: 4 }}>WEEKLY PROGRESS TRACKER</div>
            <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.6 }}>
              Save a snapshot each week to track portfolio progress over time. Upload fresh screenshots weekly to keep data current.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onGoToUpload}
              style={{ padding: "8px 14px", borderRadius: 10, border: "0.5px solid " + C.border, background: C.cardAlt, color: C.t2, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
              📱 Upload Fresh Data
            </button>
            <button onClick={doSaveWeek}
              style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: saved ? C.green : C.accent, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "background 0.2s" }}>
              {saved ? "✓ Saved!" : "📌 Save This Week"}
            </button>
          </div>
        </div>
      </Card>

      {/* Weekly Movement Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
        <Metric label="This Week Value" value={"$" + TV.toFixed(0)} />
        <Metric label="Total P&L" value={((TV - TI) / TI * 100).toFixed(2) + "%"} color={TV >= TI ? C.green : C.red} />
        {weeklyChg !== null && (
          <Metric label="Weekly Change" value={(weeklyChg >= 0 ? "+$" : "-$") + Math.abs(weeklyChg).toFixed(0)} color={weeklyChg >= 0 ? C.green : C.red} />
        )}
        {weeklyPct !== null && (
          <Metric label="Weekly %" value={(parseFloat(weeklyPct) >= 0 ? "+" : "") + weeklyPct + "%"} color={parseFloat(weeklyPct) >= 0 ? C.green : C.red} />
        )}
        <Metric label="Weeks Tracked" value={String(snaps.length)} />
      </div>

      {/* Smart Rebalance Suggestions */}
      {smartActions.length > 0 && (
        <Card>
          <div style={{ fontSize: 10, color: C.accent, fontWeight: 700, letterSpacing: 1.5, marginBottom: 4 }}>WEEKLY REBALANCE SUGGESTIONS</div>
          <div style={{ fontSize: 11, color: C.t2, marginBottom: 10, lineHeight: 1.6 }}>
            Filtered for $2 brokerage cost. Only trades over ${MIN_TRADE} shown (keeps fees under 10% of trade value). Total estimated fees: ${totalTxCost.toFixed(0)}.
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {smartActions.map(function(a, i) {
              var isBuy = a.action === "BUY";
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: isBuy ? C.greenBg : C.redBg, borderRadius: 12 }}>
                  <span style={{ fontSize: 18, width: 32, textAlign: "center" }}>{isBuy ? "🟢" : "🔴"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{a.ticker}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: isBuy ? C.greenD : C.redD }}>{a.action} ${a.amount.toFixed(0)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.t2 }}>{a.reason}</div>
                    <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>Net after $2 fee: ${a.net.toFixed(0)}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {smartActions.length === 0 && (
            <div style={{ textAlign: "center", padding: 16, color: C.t3, fontSize: 12 }}>
              No trades above the ${MIN_TRADE} minimum threshold this week.
            </div>
          )}
        </Card>
      )}

      {smartActions.length === 0 && signals && (
        <Card style={{ textAlign: "center", padding: "20px 16px" }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>✅</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.greenD, marginBottom: 4 }}>Portfolio is well-balanced this week</div>
          <div style={{ fontSize: 12, color: C.t3 }}>No trades exceed the ${MIN_TRADE} minimum to justify the $2 brokerage fee. Hold current positions.</div>
        </Card>
      )}

      {/* Weekly History Table */}
      {snaps.length > 0 && (
        <Card>
          <div style={{ fontSize: 10, color: C.accent, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8 }}>WEEKLY HISTORY</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid " + C.border }}>
                  {["Week", "Date", "Value", "Invested", "P&L $", "P&L %", "Wk Chg"].map(function(h) {
                    return <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontSize: 10, color: C.t3, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {snaps.slice().reverse().map(function(snap, i) {
                  var prev = snaps[snaps.length - 1 - i - 1] || null;
                  var wkChg = prev ? (snap.totalValue - prev.totalValue) : null;
                  var wkPct = prev ? ((snap.totalValue - prev.totalValue) / prev.totalValue * 100).toFixed(1) : null;
                  var pnlPos = snap.pnl >= 0;
                  var wkPos  = wkChg !== null ? wkChg >= 0 : true;
                  return (
                    <tr key={i} style={{ borderBottom: "0.5px solid " + C.surface }}
                      onMouseEnter={function(e) { e.currentTarget.style.background = C.cardAlt; }}
                      onMouseLeave={function(e) { e.currentTarget.style.background = "transparent"; }}>
                      <td style={{ padding: "7px 8px", fontWeight: 600, color: C.t1 }}>{snap.weekId}</td>
                      <td style={{ padding: "7px 8px", color: C.t3, fontSize: 11 }}>{new Date(snap.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                      <td style={{ padding: "7px 8px", fontWeight: 600 }}>{"$" + snap.totalValue.toFixed(0)}</td>
                      <td style={{ padding: "7px 8px", color: C.t2 }}>{"$" + snap.totalInvested.toFixed(0)}</td>
                      <td style={{ padding: "7px 8px", fontWeight: 600, color: pnlPos ? C.green : C.red }}>{(pnlPos ? "+$" : "-$") + Math.abs(snap.pnl).toFixed(0)}</td>
                      <td style={{ padding: "7px 8px", fontWeight: 600, color: pnlPos ? C.green : C.red }}>{(pnlPos ? "+" : "") + snap.pnlPct + "%"}</td>
                      <td style={{ padding: "7px 8px", fontWeight: 600, color: wkChg !== null ? (wkPos ? C.green : C.red) : C.t3 }}>{wkChg !== null ? ((wkPos ? "+" : "-") + "$" + Math.abs(wkChg).toFixed(0) + " (" + wkPct + "%)") : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {snaps.length < 2 && (
            <div style={{ marginTop: 10, padding: "8px 10px", background: C.amberBg, borderRadius: 10, fontSize: 11, color: C.amberD }}>
              💡 Save at least 2 weekly snapshots to see week-over-week changes. Come back next week and save again!
            </div>
          )}
        </Card>
      )}

      {snaps.length === 0 && (
        <Card style={{ textAlign: "center", padding: "24px 16px" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.t1, marginBottom: 4 }}>No weekly snapshots yet</div>
          <div style={{ fontSize: 12, color: C.t3, marginBottom: 14 }}>Click "Save This Week" above to start tracking weekly progress.</div>
        </Card>
      )}

      {/* Weekly Per-Holding Movement */}
      {prevSnap && (
        <Card>
          <div style={{ fontSize: 10, color: C.accent, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8 }}>PER-HOLDING WEEKLY MOVEMENT</div>
          <div style={{ display: "grid", gap: 4 }}>
            {portfolio.map(function(h, i) {
              var prevH = null;
              for (var j = 0; j < prevSnap.holdings.length; j++) {
                if (prevSnap.holdings[j].t === h.t) { prevH = prevSnap.holdings[j]; break; }
              }
              var chg = prevH ? (h.v - prevH.v) : null;
              var chgPct = prevH && prevH.v > 0 ? ((h.v - prevH.v) / prevH.v * 100).toFixed(1) : null;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", padding: "6px 8px", borderRadius: 8, background: i % 2 === 0 ? C.cardAlt : "transparent" }}>
                  <div style={{ width: 7, height: 7, borderRadius: 2, background: PIES[i % PIES.length], marginRight: 8 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, width: 42, color: C.t1 }}>{h.t}</span>
                  <span style={{ fontSize: 11, color: C.t3, flex: 1 }}>{"$" + h.v.toFixed(0)}</span>
                  {chg !== null ? (
                    <span style={{ fontSize: 11, fontWeight: 600, color: chg >= 0 ? C.green : C.red }}>
                      {(chg >= 0 ? "+" : "-") + "$" + Math.abs(chg).toFixed(0) + " (" + chgPct + "%)"}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: C.t3 }}>New</span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   CONSTANTS & CONFIG
───────────────────────────────────────── */
var CACHE_KEY   = "__alphav8";
var DAY_MS      = 86400000;
var TX_COST     = parseInt(import.meta.env.VITE_TRANSACTION_COST || "2");
var MIN_TRADE   = parseInt(import.meta.env.VITE_MIN_TRADE_SIZE || "25");
var WEEKLY_KEY  = "__weeklySnaps";
var AUTH_KEY    = "__alphaAuth";
var AUTH_USER   = import.meta.env.VITE_AUTH_USER || "xnorphic";
var AUTH_PASS   = import.meta.env.VITE_AUTH_PASS || "!Welcome1234";
var SESSION_MS  = 7 * DAY_MS; /* 7-day session */
var API_URL     = "/api/anthropic";
var MODEL_FAST  = import.meta.env.VITE_ANTHROPIC_MODEL_FAST || "claude-haiku-4-5-20251001";
var MODEL_DEEP  = import.meta.env.VITE_ANTHROPIC_MODEL_DEEP || "claude-sonnet-4-20250514";
var OAI_KEY     = import.meta.env.VITE_OPENAI_API_KEY || "";
var ANT_KEY     = import.meta.env.VITE_ANTHROPIC_API_KEY || "";
var OAI_URL     = "/api/openai";
var OAI_MODEL   = import.meta.env.VITE_OPENAI_MODEL || "gpt-4o-mini";
var SYS_JSON    = import.meta.env.VITE_SYSTEM_PROMPT || "You are a quantitative analyst. Return ONLY valid JSON. No markdown. No text outside the JSON object. Start with { end with }. No trailing commas. No newlines inside string values.";

/* ─────────────────────────────────────────
   DEFAULT PORTFOLIO
───────────────────────────────────────── */
var DEFAULT_P = [
  { t:"NVDA", n:"NVIDIA Corporation",        q:4.201078, a:137.78, c:196.44, inv:578.82, v:825.26 },
  { t:"TSM",  n:"Taiwan Semiconductor",      q:2.257803, a:120.76, c:396.35, inv:272.66, v:894.88 },
  { t:"MSFT", n:"Microsoft Corporation",     q:0.748954, a:342.14, c:411.14, inv:256.25, v:307.93 },
  { t:"UBER", n:"Uber Technologies",         q:4.392469, a:41.19,  c:74.30,  inv:180.91, v:326.36 },
  { t:"KTOS", n:"Kratos Defense & Security", q:2.475024, a:43.52,  c:59.12,  inv:107.72, v:146.32 },
  { t:"QQQ",  n:"Invesco QQQ Trust",         q:0.178759, a:589.74, c:682.02, inv:105.42, v:121.92 },
  { t:"MU",   n:"Micron Technology",         q:0.286089, a:320.67, c:640.96, inv:91.74,  v:183.37 },
  { t:"CRDO", n:"Credo Technology Group",    q:2.117460, a:31.35,  c:198.12, inv:66.38,  v:419.51 },
  { t:"VOO",  n:"Vanguard S&P 500 ETF",      q:0.122625, a:605.52, c:665.80, inv:74.25,  v:81.64  },
  { t:"V",    n:"Visa Inc Class A",          q:0.261232, a:280.02, c:321.76, inv:73.15,  v:84.05  },
  { t:"AAPL", n:"Apple Inc",                 q:0.184490, a:270.20, c:283.96, inv:49.85,  v:52.39  },
  { t:"PATH", n:"UiPath Inc",                q:0.566933, a:12.31,  c:10.71,  inv:6.98,   v:6.07   },
];

/* ─────────────────────────────────────────
   DESIGN TOKENS
───────────────────────────────────────── */
var C = {
  bg:"#F5F0EB",      card:"#FFFCF8",    cardAlt:"#F0EBE3",  surface:"#E8E0D5",
  header:"#2C2520",  t1:"#2C2520",      t2:"#7A6E63",       t3:"#A89E93",
  border:"#E0D6CA",  accent:"#8B7355",  accentL:"#C4B5A0",
  green:"#6B8F71",   greenBg:"#E3EDE4", greenD:"#3D5E42",
  red:"#B5736A",     redBg:"#F2E4E2",   redD:"#8B4E46",
  amber:"#B89B5E",   amberBg:"#F5EFE0", amberD:"#7A6735",
  blue:"#6B89A8",    blueBg:"#E2EBF2",  blueD:"#3D5A73",
  purple:"#8B7BA8",  purpleBg:"#ECE7F2",purpleD:"#5A4D73",
  roseBg:"#F5ECEC",  roseD:"#8B6060",   sageBg:"#E7F0E6",
};
var PIES = [
  "#8B7355","#6B8F71","#B5736A","#6B89A8","#8B7BA8","#B89B5E",
  "#C4967A","#8FAE8B","#A67C6B","#C49B9B","#7A8E6B","#9B8B7A",
];

/* ─────────────────────────────────────────
   CACHE UTILITIES
───────────────────────────────────────── */
function readCache() {
  try {
    var c = window[CACHE_KEY];
    if (c && (Date.now() - c.ts) < DAY_MS) { return c.data; }
  } catch (e) {}
  return null;
}

function writeCache(data) {
  try { window[CACHE_KEY] = { ts: Date.now(), data: data }; } catch (e) {}
}

function clearCache() {
  try { window[CACHE_KEY] = null; } catch (e) {}
}

/* ─────────────────────────────────────────
   JSON EXTRACTION (robust)
───────────────────────────────────────── */
function extractJSON(txt) {
  var s = txt.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  var fi = s.indexOf("{");
  var li = s.lastIndexOf("}");
  if (fi < 0 || li < 0) { throw new Error("No JSON object found in response"); }
  s = s.slice(fi, li + 1)
    .replace(/,(\s*[}\]])/g, "$1")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  return JSON.parse(s);
}

/* ─────────────────────────────────────────
   ANTHROPIC API (Claude Haiku + Sonnet)
───────────────────────────────────────── */
async function callAI(userMsg, model, images) {
  var retries = 3;
  var delay   = 2000;
  for (var attempt = 0; attempt <= retries; attempt++) {
    try {
      var content;
      if (images && images.length > 0) {
        content = [];
        for (var k = 0; k < images.length; k++) {
          var img = images[k];
          /* Support both string (legacy) and object {data, mediaType} */
          var data      = typeof img === "string" ? img : img.data;
          var mediaType = typeof img === "string" ? "image/jpeg" : (img.mediaType || "image/jpeg");
          content.push({
            type: "image",
            source: { type: "base64", media_type: mediaType, data: data },
          });
        }
        content.push({ type: "text", text: userMsg });
      } else {
        content = userMsg;
      }
      var body = JSON.stringify({
        model: model,
        max_tokens: 4096,
        system: SYS_JSON,
        messages: [{ role: "user", content: content }],
      });
      var res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
      });
      if (res.status === 429) { await sleep(delay + rand()); delay *= 2; continue; }
      if (!res.ok) {
        var errText = "";
        try { var ej = await res.json(); errText = ej.error && ej.error.message ? ej.error.message : ""; } catch(e2) {}
        throw new Error("Claude HTTP " + res.status + (errText ? ": " + errText : ""));
      }
      var raw = await res.json();
      if (raw.error) { throw new Error(raw.error.message || "Claude API error"); }
      var tb = null;
      var arr = raw.content || [];
      for (var j = 0; j < arr.length; j++) {
        if (arr[j].type === "text") { tb = arr[j]; break; }
      }
      if (!tb || !tb.text) { throw new Error("Empty Claude response"); }
      return extractJSON(tb.text);
    } catch (e) {
      if (attempt === retries) { throw e; }
      var msg = e.message || "";
      if (msg.indexOf("429") >= 0 || msg.indexOf("Rate") >= 0 || msg.indexOf("fetch") >= 0) {
        await sleep(delay + rand()); delay *= 2;
      } else { throw e; }
    }
  }
}

/* ─────────────────────────────────────────
   OPENAI API (GPT-4o-mini — fast + vision fallback)
───────────────────────────────────────── */
async function callOpenAI(userMsg, images) {
  var retries = 2;
  var delay   = 2000;
  for (var attempt = 0; attempt <= retries; attempt++) {
    try {
      var userContent;
      if (images && images.length > 0) {
        userContent = [];
        for (var k = 0; k < images.length; k++) {
          var img = images[k];
          var data      = typeof img === "string" ? img : img.data;
          var mediaType = typeof img === "string" ? "image/jpeg" : (img.mediaType || "image/jpeg");
          userContent.push({
            type: "image_url",
            image_url: { url: "data:" + mediaType + ";base64," + data, detail: "high" },
          });
        }
        userContent.push({ type: "text", text: userMsg });
      } else {
        userContent = userMsg;
      }
      var body = JSON.stringify({
        model: OAI_MODEL,
        max_tokens: 4096,
        temperature: 0.1,
        messages: [
          { role: "system", content: SYS_JSON },
          { role: "user",   content: userContent },
        ],
      });
      var res = await fetch(OAI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
      });
      if (res.status === 429) { await sleep(delay + rand()); delay *= 2; continue; }
      if (!res.ok) {
        var errText = "";
        try { var ej = await res.json(); errText = ej.error && ej.error.message ? ej.error.message : ""; } catch(e2) {}
        throw new Error("OpenAI HTTP " + res.status + (errText ? ": " + errText : ""));
      }
      var raw = await res.json();
      var txt = raw.choices && raw.choices[0] && raw.choices[0].message && raw.choices[0].message.content;
      if (!txt) { throw new Error("Empty OpenAI response"); }
      return extractJSON(txt);
    } catch (e) {
      if (attempt === retries) { throw e; }
      var msg = e.message || "";
      if (msg.indexOf("429") >= 0 || msg.indexOf("fetch") >= 0) {
        await sleep(delay + rand()); delay *= 2;
      } else { throw e; }
    }
  }
}

/* Health check — pings both APIs */
async function checkAPIHealth() {
  try {
    var body = JSON.stringify({
      model: MODEL_FAST,
      max_tokens: 10,
      messages: [{ role: "user", content: "Say OK" }],
    });
    var res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body,
    });
    return res.ok || res.status === 429;
  } catch (e) {
    return false;
  }
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
function rand()    { return Math.random() * 1000; }

/* ─────────────────────────────────────────
   PORTFOLIO HELPERS
───────────────────────────────────────── */
function sumField(P, field) {
  var s = 0;
  for (var i = 0; i < P.length; i++) { s += P[i][field]; }
  return s;
}

function buildPortStr(P, TV) {
  var parts = [];
  for (var i = 0; i < P.length; i++) {
    var h   = P[i];
    var pnl = ((h.v - h.inv) / h.inv * 100).toFixed(1);
    var wt  = (h.v / TV * 100).toFixed(1);
    parts.push(h.t + ": $" + h.c + ", avg $" + h.a + ", pnl " + pnl + "%, wt " + wt + "%, val $" + h.v.toFixed(0));
  }
  return parts.join("; ");
}

function findInPortfolio(P, ticker) {
  for (var i = 0; i < P.length; i++) { if (P[i].t === ticker) { return P[i]; } }
  return null;
}

function clamp(val, lo, hi) { return Math.min(hi, Math.max(lo, val)); }

/* ─────────────────────────────────────────
   API TASK FUNCTIONS
───────────────────────────────────────── */
function fetchSummary(P, TV, TI, TPct) {
  var ps  = buildPortStr(P, TV);
  var msg = "Portfolio (" + P.length + " stocks, total $" + TV.toFixed(0) + ", P&L " + TPct + "%): " + ps
    + '\n\nReturn exactly: {"summary":"3-sentence portfolio health","alphaTarget":"1-sentence on 2-3% monthly alpha feasibility","monthlyAlphaBps":180,"portfolioRisk":"HIGH","varEstimate":14.5,"rebalancingActions":["action1","action2","action3"],"topAlphaIdea":"2-sentence best alpha trade idea"}';
  /* Use OpenAI for cheap summary work, fall back to Claude if needed */
  return callOpenAI(msg, null).catch(function(e) {
    console.warn("OpenAI summary failed, falling back to Claude:", e.message);
    return callAI(msg, MODEL_FAST, null);
  });
}

function fetchBatch(tickers, P, TV) {
  var i, h;
  var hsParts   = [];
  var tmplParts = [];
  for (i = 0; i < tickers.length; i++) {
    h = findInPortfolio(P, tickers[i]);
    if (!h) { continue; }
    var pnl = ((h.v - h.inv) / h.inv * 100).toFixed(1);
    var wt  = (h.v / TV * 100).toFixed(1);
    hsParts.push(h.t + "(" + h.n + "): $" + h.c + ", avg $" + h.a + ", pnl " + pnl + "%, wt " + wt + "%");
    tmplParts.push(
      '{"ticker":"' + h.t + '",' +
      '"alphaScore":75,"momentum":70,"sentiment":65,"optionsSignal":60,"whaleActivity":55,' +
      '"verdict":"HOLD","confidence":70,' +
      '"idealWeight":' + wt + ',"currentWeight":' + wt + ',' +
      '"kellyFraction":0.10,"catalysts":["catalyst1"],"risks":["risk1"],' +
      '"timingSignal":"HOLD","targetPrice1M":' + h.c + '}'
    );
  }
  var msg = "Analyze these holdings: " + hsParts.join("; ")
    + '\n\nReturn: {"holdings":[' + tmplParts.join(",") + "]}"
    + "\n\nUse REAL differentiated analysis. Spread alphaScores across 15-90 range. Keep all string values under 55 characters.";
  /* Use OpenAI for batches, fall back to Claude */
  return callOpenAI(msg, null).catch(function(e) {
    console.warn("OpenAI batch failed, falling back to Claude:", e.message);
    return callAI(msg, MODEL_FAST, null);
  });
}

function fetchDeep(ticker, P) {
  var h = findInPortfolio(P, ticker);
  if (!h) { return Promise.resolve({}); }
  var pnl = ((h.v - h.inv) / h.inv * 100).toFixed(1);
  var msg = "Deep-dive " + ticker + " (" + h.n + "). Avg $" + h.a + ", current $" + h.c + ", pnl " + pnl + "%, value $" + h.v.toFixed(0) + "."
    + '\n\nReturn: {"technical":"2-sentence technical outlook with levels","fundamental":"2-sentence fundamental case","optionsPlay":"specific options strategy with strikes and expiry","blView":"return expectation with confidence level","kelly":"Kelly sizing rationale for this position","hedge":"specific downside hedge recommendation","alphaPath":"how this contributes to 2-3% monthly alpha","breakdown":{"momentum":"momentum signal detail","sentiment":"sentiment signal detail","options":"options signal detail","whale":"whale activity detail"}}';
  /* Deep dive — Claude Sonnet only (quant-heavy) */
  return callAI(msg, MODEL_DEEP, null);
}

function extractPortfolioFromImages(images) {
  var msg = "These are screenshots of a stock portfolio app. Extract ALL holdings visible across ALL images."
    + ' Return exactly: {"holdings":[{"ticker":"NVDA","name":"NVIDIA Corporation","qty":4.636,"avgPrice":137.78,"currentPrice":197.44,"invested":638.74,"currentValue":915.33}],"totalInvested":1299.43,"totalValue":3453.38}'
    + " Use exact numbers shown in screenshots. Combine all images, do not duplicate tickers. Tickers are usually next to company logos.";
  /* Try Claude Haiku first, fall back to OpenAI Vision if it fails */
  return callAI(msg, MODEL_FAST, images).catch(function(e) {
    console.warn("Claude vision failed, falling back to OpenAI:", e.message);
    return callOpenAI(msg, images);
  });
}

/* ─────────────────────────────────────────
   YAHOO FINANCE CHART
───────────────────────────────────────── */
function fetchChart(ticker, range) {
  var interval = (range === "1wk" || range === "1mo" || range === "3mo") ? "1d" : (range === "1y" ? "1wk" : "1mo");
  var url = "https://query1.finance.yahoo.com/v8/finance/chart/" + ticker
    + "?range=" + range + "&interval=" + interval + "&includePrePost=false";
  return fetch(url, { headers: { Accept: "application/json" } })
    .then(function(res) {
      if (!res.ok) { throw new Error("Yahoo fetch failed"); }
      return res.json();
    })
    .then(function(j) {
      var result = j && j.chart && j.chart.result && j.chart.result[0];
      if (!result) { throw new Error("No chart data"); }
      var ts     = result.timestamp;
      var closes = result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close;
      if (!ts || !closes) { throw new Error("Missing OHLCV"); }
      var pts = [];
      for (var i = 0; i < ts.length; i++) {
        if (closes[i] != null) { pts.push({ date: new Date(ts[i] * 1000), price: closes[i] }); }
      }
      return pts;
    })
    .catch(function() {
      /* Graceful fallback: synthetic chart from avg → current */
      var h = findInPortfolio(DEFAULT_P, ticker);
      if (!h) { return []; }
      var days  = { "1wk":7, "1mo":30, "3mo":90, "1y":365, "2y":730 }[range] || 90;
      var pts   = [];
      var start = h.a * 0.88;
      for (var i = 0; i <= 80; i++) {
        var prog  = i / 80;
        var price = start + (h.c - start) * Math.pow(prog, 0.65) + (Math.random() - 0.48) * 0.025 * h.c;
        pts.push({ date: new Date(Date.now() - (days - Math.floor(prog * days)) * 86400000), price: Math.max(0.01, price) });
      }
      return pts;
    });
}

/* ─────────────────────────────────────────
   IMAGE UTILITIES (robust — uses FileReader, no canvas)
───────────────────────────────────────── */
function readFileAsDataUrl(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload  = function() { resolve(reader.result); };
    reader.onerror = function() { reject(new Error("Failed to read file")); };
    reader.readAsDataURL(file);
  });
}

async function imageFileToBase64(file) {
  /* FileReader is far more reliable than canvas in sandboxed iframes.
     We also preserve original media type (PNG, JPEG, WEBP) for the API. */
  var dataUrl = await readFileAsDataUrl(file);
  /* Match: data:image/png;base64,XXXXX */
  var match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) { throw new Error("Invalid image data URL"); }
  var mediaType = match[1];
  var data      = match[2];
  /* Anthropic supports: image/jpeg, image/png, image/gif, image/webp */
  var supported = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (supported.indexOf(mediaType) < 0) {
    /* Default to jpeg for unknown types */
    mediaType = "image/jpeg";
  }
  if (!data || data.length < 100) {
    throw new Error("Image data is empty or corrupted");
  }
  return { data: data, mediaType: mediaType };
}

/* ─────────────────────────────────────────
   VALIDATION
───────────────────────────────────────── */
function validateHolding(h, P, TV) {
  var port   = findInPortfolio(P, h.ticker);
  var defWt  = port ? (port.v / TV * 100) : (100 / P.length);
  var defPx  = port ? port.c : 100;
  return {
    ticker:        String(h.ticker   || "???"),
    alphaScore:    clamp(Number(h.alphaScore)    || 50, 0, 100),
    momentum:      clamp(Number(h.momentum)      || 50, 0, 100),
    sentiment:     clamp(Number(h.sentiment)     || 50, 0, 100),
    optionsSignal: clamp(Number(h.optionsSignal) || 50, 0, 100),
    whaleActivity: clamp(Number(h.whaleActivity) || 50, 0, 100),
    verdict:       ["OVERWEIGHT","UNDERWEIGHT","HOLD","EXIT"].indexOf(h.verdict) >= 0 ? h.verdict : "HOLD",
    confidence:    clamp(Number(h.confidence)    || 55, 0, 100),
    idealWeight:   Number(h.idealWeight)   || defWt,
    currentWeight: Number(h.currentWeight) || defWt,
    kellyFraction: clamp(Number(h.kellyFraction) || 0.05, 0, 1),
    catalysts:     Array.isArray(h.catalysts) ? h.catalysts.slice(0, 3) : [],
    risks:         Array.isArray(h.risks)     ? h.risks.slice(0, 3)     : [],
    timingSignal:  ["BUY","SELL","HOLD"].indexOf(h.timingSignal) >= 0 ? h.timingSignal : "HOLD",
    targetPrice1M: Number(h.targetPrice1M) || defPx,
  };
}

function validateSignals(raw, P, TV) {
  var allH    = [].concat(raw.b1 || [], raw.b2 || []);
  var holdings = allH.map(function(h) { return validateHolding(h, P, TV); });
  return {
    summary:            String(raw.summary.summary            || "Portfolio analyzed."),
    alphaTarget:        String(raw.summary.alphaTarget         || "Alpha target assessed."),
    monthlyAlphaBps:    Number(raw.summary.monthlyAlphaBps)    || 150,
    portfolioRisk:      String(raw.summary.portfolioRisk       || "MEDIUM"),
    varEstimate:        Number(raw.summary.varEstimate)        || 12,
    rebalancingActions: Array.isArray(raw.summary.rebalancingActions) ? raw.summary.rebalancingActions : [],
    topAlphaIdea:       String(raw.summary.topAlphaIdea        || ""),
    holdings:           holdings,
  };
}

/* ═══════════════════════════════════════
   UI COMPONENTS
═══════════════════════════════════════ */

function Card({ children, style, onClick }) {
  var base = {
    background: C.card, borderRadius: 16, padding: "14px 16px",
    border: "0.5px solid " + C.border, transition: "box-shadow 0.15s, transform 0.15s",
  };
  if (onClick) { base.cursor = "pointer"; }
  return (
    <div
      style={Object.assign({}, base, style)}
      onClick={onClick}
      onMouseEnter={function(e) { if (onClick) { e.currentTarget.style.boxShadow = "0 3px 14px rgba(44,37,32,0.09)"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
      onMouseLeave={function(e) { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}
    >
      {children}
    </div>
  );
}

function Metric({ label, value, color }) {
  return (
    <Card style={{ padding: "12px 14px" }}>
      <div style={{ fontSize: 10, color: C.t3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || C.t1 }}>{value}</div>
    </Card>
  );
}

function ScoreBar({ score }) {
  var col = score >= 70 ? C.green : score >= 45 ? C.amber : C.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 5, background: C.surface, borderRadius: 99 }}>
        <div style={{ width: score + "%", height: "100%", background: col, borderRadius: 99, transition: "width 0.8s" }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: col, minWidth: 22 }}>{score}</span>
    </div>
  );
}

function VBadge({ v }) {
  var cfg = {
    OVERWEIGHT:  { bg: C.greenBg,  c: C.greenD,  l: "↑ Overweight"  },
    UNDERWEIGHT: { bg: C.amberBg,  c: C.amberD,  l: "→ Underweight" },
    EXIT:        { bg: C.redBg,    c: C.redD,    l: "↓ Exit"        },
    HOLD:        { bg: C.blueBg,   c: C.blueD,   l: "◉ Hold"        },
  };
  var s = cfg[v] || cfg.HOLD;
  return <span style={{ background: s.bg, color: s.c, padding: "3px 10px", borderRadius: 99, fontSize: 10, fontWeight: 600 }}>{s.l}</span>;
}

function TBadge({ v }) {
  var cfg = {
    BUY:  { bg: C.greenBg, c: C.greenD },
    SELL: { bg: C.redBg,   c: C.redD   },
    HOLD: { bg: C.blueBg,  c: C.blueD  },
  };
  var s = cfg[v] || cfg.HOLD;
  return <span style={{ background: s.bg, color: s.c, padding: "3px 10px", borderRadius: 99, fontSize: 10, fontWeight: 600 }}>{v}</span>;
}

function Donut({ data, TV }) {
  var size = 170, cx = 85, cy = 85, r = 63, ir = 39;
  var cum  = -Math.PI / 2;
  var slices = data.map(function(d, i) {
    var a   = (d.pct / 100) * 2 * Math.PI;
    var x1  = cx + r  * Math.cos(cum), y1  = cy + r  * Math.sin(cum);
    cum += a;
    var x2  = cx + r  * Math.cos(cum), y2  = cy + r  * Math.sin(cum);
    var lf  = a > Math.PI ? 1 : 0;
    var xi1 = cx + ir * Math.cos(cum - a), yi1 = cy + ir * Math.sin(cum - a);
    var xi2 = cx + ir * Math.cos(cum),     yi2 = cy + ir * Math.sin(cum);
    var dp  = "M" + x1 + "," + y1 + "A" + r + "," + r + ",0," + lf + ",1," + x2 + "," + y2
            + "L" + xi2 + "," + yi2 + "A" + ir + "," + ir + ",0," + lf + ",0," + xi1 + "," + yi1 + "Z";
    return <path key={i} d={dp} fill={PIES[i % PIES.length]} stroke={C.card} strokeWidth="2" opacity="0.85" />;
  });
  return (
    <svg width={size} height={size} viewBox={"0 0 " + size + " " + size}>
      {slices}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="10" fill={C.t3}>Portfolio</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="14" fontWeight="600" fill={C.t1}>{"$" + TV.toFixed(0)}</text>
    </svg>
  );
}

function StepsBar({ step }) {
  var labels = ["Summary", "Batch 1", "Batch 2", "Done"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "center", marginBottom: 12, flexWrap: "wrap" }}>
      {labels.map(function(s, i) {
        var bg  = i < step ? C.green : i === step ? C.accent : C.surface;
        var col = i <= step ? "#fff" : C.t3;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 22, height: 22, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, background: bg, color: col, transition: "all 0.3s" }}>
              {i < step ? "✓" : i + 1}
            </div>
            <span style={{ fontSize: 10, color: i <= step ? C.t1 : C.t3, fontWeight: i === step ? 600 : 400 }}>{s}</span>
            {i < labels.length - 1 && <div style={{ width: 16, height: 1, background: i < step ? C.accent : C.surface, marginLeft: 4 }} />}
          </div>
        );
      })}
    </div>
  );
}

function Loader({ msg }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 16px", gap: 12 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {[0, 1, 2].map(function(i) {
          return <div key={i} style={{ width: 10, height: 10, borderRadius: 99, background: C.accent, animation: "ldot 1.2s ease " + (i * 0.2) + "s infinite" }} />;
        })}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: C.accent }}>{msg || "Analyzing…"}</div>
      <style>{"@keyframes ldot{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.1)}}"}</style>
    </div>
  );
}

/* ─────────────────────────────────────────
   PRICE CHART
───────────────────────────────────────── */
function PriceChart({ ticker, avgPrice, currentPrice }) {
  var [data,    setData]    = useState([]);
  var [range,   setRange]   = useState("3mo");
  var [loading, setLoading] = useState(true);
  var [hov,     setHov]     = useState(null);

  useEffect(function() {
    setLoading(true);
    setData([]);
    fetchChart(ticker, range).then(function(pts) { setData(pts); setLoading(false); });
  }, [ticker, range]);

  var W = 540, H = 155, PL = 44, PR = 14, PT = 10, PB = 22;
  var cW = W - PL - PR, cH = H - PT - PB;

  function onMouseMove(e) {
    var rect   = e.currentTarget.getBoundingClientRect();
    var mx     = (e.clientX - rect.left) * (W / rect.width);
    var chartX = mx - PL;
    if (!data.length || chartX < 0 || chartX > cW) { setHov(null); return; }
    var idx    = Math.max(0, Math.min(data.length - 1, Math.round((chartX / cW) * (data.length - 1))));
    var prices = data.map(function(d) { return d.price; });
    var minP   = Math.min.apply(null, prices) * 0.995;
    var maxP   = Math.max.apply(null, prices) * 1.005;
    setHov({
      x: PL + (idx / (data.length - 1)) * cW,
      y: PT + cH - ((data[idx].price - minP) / (maxP - minP)) * cH,
      price: data[idx].price,
      date:  data[idx].date,
    });
  }

  function fmt(d) { return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); }

  if (loading) {
    return <div style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center", color: C.t3, fontSize: 12 }}>Loading chart…</div>;
  }
  if (!data.length) {
    return <div style={{ height: 40, display: "flex", alignItems: "center", justifyContent: "center", color: C.red, fontSize: 12 }}>Chart unavailable</div>;
  }

  var prices = data.map(function(d) { return d.price; });
  var minP   = Math.min.apply(null, prices) * 0.995;
  var maxP   = Math.max.apply(null, prices) * 1.005;
  function xS(i) { return PL + (i / (data.length - 1)) * cW; }
  function yS(p) { return PT + cH - ((p - minP) / (maxP - minP)) * cH; }

  var first = prices[0], last = prices[prices.length - 1];
  var isUp  = last >= first;
  var lc    = isUp ? C.green : C.red;
  var pct   = ((last - first) / first * 100).toFixed(2);
  var gid   = "gc_" + ticker;

  var lineParts = [];
  for (var pi = 0; pi < data.length; pi++) {
    lineParts.push((pi === 0 ? "M" : "L") + xS(pi).toFixed(1) + "," + yS(data[pi].price).toFixed(1));
  }
  var lineD = lineParts.join(" ");
  var areaD = lineD + " L" + xS(data.length - 1).toFixed(1) + "," + (PT + cH) + " L" + PL + "," + (PT + cH) + " Z";
  var avgY  = (avgPrice >= minP && avgPrice <= maxP) ? yS(avgPrice) : null;
  var lbls  = [0, Math.floor(data.length * 0.25), Math.floor(data.length * 0.5), Math.floor(data.length * 0.75), data.length - 1];
  var disp  = hov ? hov.price : last;

  return (
    <div style={{ background: C.cardAlt, borderRadius: 14, padding: "12px 10px 8px", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: C.t1 }}>{"$" + disp.toFixed(2)}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: isUp ? C.green : C.red }}>{isUp ? "+" : ""}{pct}%</span>
          {hov && <span style={{ fontSize: 10, color: C.t3 }}>{fmt(hov.date)}</span>}
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {[["1wk","1W"],["1mo","1M"],["3mo","3M"],["1y","1Y"],["2y","2Y"]].map(function(pair) {
            return (
              <button key={pair[0]} onClick={function() { setRange(pair[0]); }}
                style={{ padding: "3px 8px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 600, background: range === pair[0] ? C.accent : "transparent", color: range === pair[0] ? "#fff" : C.t2, transition: "all 0.15s" }}>
                {pair[1]}
              </button>
            );
          })}
        </div>
      </div>

      <svg viewBox={"0 0 " + W + " " + H} style={{ width: "100%", height: "auto", overflow: "visible", display: "block" }} onMouseMove={onMouseMove} onMouseLeave={function() { setHov(null); }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={lc} stopOpacity="0.22" />
            <stop offset="100%" stopColor={lc} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map(function(rv, ri) {
          var gy = PT + rv * cH;
          var gp = maxP - rv * (maxP - minP);
          return (
            <g key={ri}>
              <line x1={PL} x2={W - PR} y1={gy} y2={gy} stroke={C.surface} strokeWidth="0.5" />
              <text x={PL - 4} y={gy + 3} textAnchor="end" fontSize="9" fill={C.t3}>{"$" + gp.toFixed(0)}</text>
            </g>
          );
        })}
        {avgY !== null && (
          <g>
            <line x1={PL} x2={W - PR} y1={avgY} y2={avgY} stroke={C.amber} strokeWidth="1" strokeDasharray="4,3" />
            <text x={W - PR + 2} y={avgY + 3} fontSize="8" fill={C.amber} fontWeight="600">avg</text>
          </g>
        )}
        <path d={areaD} fill={"url(#" + gid + ")"} />
        <path d={lineD} fill="none" stroke={lc} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        {hov && (
          <g>
            <line x1={hov.x} x2={hov.x} y1={PT} y2={PT + cH} stroke={C.t2} strokeWidth="0.75" strokeDasharray="3,2" />
            <circle cx={hov.x} cy={hov.y} r="3.5" fill={lc} stroke={C.card} strokeWidth="1.5" />
            <rect x={Math.min(hov.x + 5, W - PR - 65)} y={hov.y - 20} width={62} height={18} rx="4" fill={C.header} opacity="0.85" />
            <text x={Math.min(hov.x + 36, W - PR - 34)} y={hov.y - 7} textAnchor="middle" fontSize="10" fill="#F5F0EB" fontWeight="600">{"$" + hov.price.toFixed(2)}</text>
          </g>
        )}
        {lbls.map(function(li) {
          return <text key={li} x={xS(li)} y={H - 4} textAnchor="middle" fontSize="9" fill={C.t3}>{fmt(data[li].date)}</text>;
        })}
      </svg>

      <div style={{ display: "flex", gap: 14, marginTop: 4 }}>
        <span style={{ fontSize: 10, color: C.t3 }}>━━ Avg buy ${avgPrice.toFixed(2)}</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: currentPrice >= avgPrice ? C.green : C.red }}>
          {((currentPrice - avgPrice) / avgPrice * 100 >= 0 ? "+" : "") + ((currentPrice - avgPrice) / avgPrice * 100).toFixed(1) + "% vs avg"}
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   ALLOCATION CHART
───────────────────────────────────────── */
function AllocChart({ holdings, TV }) {
  if (!holdings || !holdings.length) { return null; }
  var sorted = holdings.slice().sort(function(a, b) { return b.currentWeight - a.currentWeight; });
  var maxW   = 0;
  for (var i = 0; i < sorted.length; i++) {
    if (sorted[i].currentWeight > maxW) { maxW = sorted[i].currentWeight; }
    if (sorted[i].idealWeight   > maxW) { maxW = sorted[i].idealWeight;   }
  }
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {sorted.map(function(h, i) {
        var curD = (h.currentWeight / 100) * TV;
        var ideD = (h.idealWeight   / 100) * TV;
        var diff = ideD - curD;
        return (
          <div key={i} style={{ background: C.cardAlt, borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: PIES[i % PIES.length] }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{h.ticker}</span>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: diff >= 0 ? C.green : C.red }}>{diff >= 0 ? "↑" : "↓"} ${Math.abs(diff).toFixed(0)}</span>
                <VBadge v={h.verdict} />
              </div>
            </div>
            {[
              { label: "Current", pct: h.currentWeight, dollar: curD, color: PIES[i % PIES.length], opacity: 0.7, tc: C.t2 },
              { label: "Ideal",   pct: h.idealWeight,   dollar: ideD, color: C.green,               opacity: 0.8, tc: C.greenD },
            ].map(function(row) {
              return (
                <div key={row.label} style={{ marginBottom: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                    <span style={{ fontSize: 10, color: C.t3 }}>{row.label}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: row.tc }}>{row.pct.toFixed(1)}% · ${row.dollar.toFixed(0)}</span>
                  </div>
                  <div style={{ height: 6, background: C.surface, borderRadius: 99 }}>
                    <div style={{ width: (row.pct / maxW * 100) + "%", height: "100%", background: row.color, borderRadius: 99, opacity: row.opacity }} />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────
   UPLOAD PANEL
───────────────────────────────────────── */
function UploadPanel({ onPortfolioExtracted, uploadHistory }) {
  var [files,      setFiles]      = useState([]);
  var [previews,   setPreviews]   = useState([]);
  var [extracting, setExtracting] = useState(false);
  var [extracted,  setExtracted]  = useState(null);
  var [err,        setErr]        = useState(null);
  var dropRef  = useRef(null);
  var inputRef = useRef(null);

  function addFiles(newFiles) {
    var imgs = [];
    for (var i = 0; i < newFiles.length; i++) {
      if (newFiles[i].type.indexOf("image/") === 0) { imgs.push(newFiles[i]); }
    }
    if (!imgs.length) { return; }
    setFiles(function(prev) {
      var combined = prev.concat(imgs).slice(0, 6);
      /* Use FileReader (data URLs) instead of URL.createObjectURL — more reliable in sandbox */
      Promise.all(combined.map(function(f) { return readFileAsDataUrl(f); })).then(function(urls) {
        setPreviews(urls);
      });
      return combined;
    });
    setExtracted(null);
    setErr(null);
  }

  function removeFile(idx) {
    setFiles(function(prev) { var n = prev.slice(); n.splice(idx, 1); return n; });
    setPreviews(function(prev) { var n = prev.slice(); n.splice(idx, 1); return n; });
    setExtracted(null);
  }

  function onDrop(e) { e.preventDefault(); addFiles(e.dataTransfer.files); }
  function onDragOver(e) { e.preventDefault(); if (dropRef.current) { dropRef.current.style.borderColor = C.accent; } }
  function onDragLeave() { if (dropRef.current) { dropRef.current.style.borderColor = C.border; } }

  async function extract() {
    if (!files.length) { return; }
    setExtracting(true); setErr(null); setExtracted(null);
    try {
      var b64s = [];
      for (var i = 0; i < files.length; i++) {
        var b64 = await imageFileToBase64(files[i]);
        b64s.push(b64);
      }
      var result = await extractPortfolioFromImages(b64s);
      if (!result.holdings || !result.holdings.length) {
        throw new Error("No holdings detected. Try clearer screenshots.");
      }
      setExtracted(result);
    } catch (e) {
      setErr(e.message || "Extraction failed. Please try again.");
    }
    setExtracting(false);
  }

  function applyPortfolio() {
    if (!extracted) { return; }
    var mapped = [];
    for (var i = 0; i < extracted.holdings.length; i++) {
      var h = extracted.holdings[i];
      var entry = {
        t:   String(h.ticker  || "???"),
        n:   String(h.name    || h.ticker || "Unknown"),
        q:   Number(h.qty)            || 0,
        a:   Number(h.avgPrice)       || 0,
        c:   Number(h.currentPrice)   || 0,
        inv: Number(h.invested)       || 0,
        v:   Number(h.currentValue)   || 0,
      };
      if (entry.t !== "???" && entry.v > 0) { mapped.push(entry); }
    }
    if (!mapped.length) { setErr("Could not parse valid holdings. Try uploading clearer screenshots."); return; }
    onPortfolioExtracted(mapped);
    /* Fire-and-forget sync to Supabase — keeps Telegram bot in sync */
    fetch("/api/sync-portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        holdings:       mapped,
        totalInvested:  extracted.totalInvested  || null,
        totalValue:     extracted.totalValue     || null,
      }),
    }).catch(function(e) { console.warn("Portfolio sync failed:", e.message); });
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Card>
        <div style={{ fontSize: 10, color: C.accent, fontWeight: 700, letterSpacing: 1.5, marginBottom: 4 }}>UPLOAD PORTFOLIO SCREENSHOTS</div>
        <div style={{ fontSize: 12, color: C.t2, marginBottom: 14, lineHeight: 1.65 }}>
          Upload up to 6 screenshots from your brokerage app. Claude Haiku Vision will extract holdings (with GPT-4o-mini as automatic fallback if Claude fails), then re-run the full alpha analysis on your updated portfolio.
        </div>

        <div ref={dropRef} onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
          onClick={function() { if (inputRef.current) { inputRef.current.click(); } }}
          style={{ border: "2px dashed " + C.border, borderRadius: 14, padding: "28px 16px", textAlign: "center", cursor: "pointer", transition: "border-color 0.2s, background 0.2s", background: C.bg, marginBottom: 12 }}
          onMouseEnter={function(e) { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.background = C.cardAlt; }}
          onMouseLeave={function(e) { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.bg; }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📱</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.t1, marginBottom: 4 }}>Drop screenshots here or click to browse</div>
          <div style={{ fontSize: 11, color: C.t3 }}>PNG · JPG · WEBP · Up to 6 images · Claude Haiku → OpenAI fallback</div>
          <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={function(e) { addFiles(e.target.files); }} />
        </div>

        {previews.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {previews.map(function(url, i) {
              return (
                <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                  <img src={url} alt={"img" + i} style={{ width: 72, height: 110, objectFit: "cover", borderRadius: 10, border: "0.5px solid " + C.border }} />
                  <button onClick={function(e) { e.stopPropagation(); removeFile(i); }}
                    style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 99, background: C.redD, border: "none", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>×</button>
                  <div style={{ position: "absolute", bottom: 4, left: 0, right: 0, textAlign: "center", fontSize: 9, color: "#fff", background: "rgba(0,0,0,0.45)", borderRadius: "0 0 10px 10px", padding: "2px 0" }}>{"img " + (i + 1)}</div>
                </div>
              );
            })}
            {previews.length < 6 && (
              <div onClick={function() { if (inputRef.current) { inputRef.current.click(); } }}
                style={{ width: 72, height: 110, borderRadius: 10, border: "2px dashed " + C.border, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.t3, fontSize: 11, gap: 4, flexShrink: 0 }}
                onMouseEnter={function(e) { e.currentTarget.style.borderColor = C.accent; }}
                onMouseLeave={function(e) { e.currentTarget.style.borderColor = C.border; }}>
                <span style={{ fontSize: 20 }}>+</span>
                <span>Add</span>
              </div>
            )}
          </div>
        )}

        {err && <div style={{ background: C.redBg, color: C.redD, borderRadius: 10, padding: "10px 12px", fontSize: 12, marginBottom: 12 }}>⚠ {err}</div>}

        {files.length > 0 && !extracting && !extracted && (
          <button onClick={extract}
            style={{ width: "100%", padding: "12px", borderRadius: 12, border: "none", background: C.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {"Extract Holdings from " + files.length + " Screenshot" + (files.length > 1 ? "s" : "") + " ↗"}
          </button>
        )}
        {extracting && <Loader msg={"Extracting from " + files.length + " screenshot(s)… (Claude → OpenAI fallback)"} />}
      </Card>

      {extracted && extracted.holdings && (
        <Card>
          <div style={{ fontSize: 10, color: C.green, fontWeight: 700, letterSpacing: 1.5, marginBottom: 4 }}>{"✓ " + extracted.holdings.length + " HOLDINGS EXTRACTED"}</div>
          <div style={{ fontSize: 12, color: C.t2, marginBottom: 4 }}>Review the data below. Click Apply to re-run the full analysis with your updated portfolio.</div>
          {extracted.totalInvested && (
            <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: C.t2 }}>Cost basis: <b style={{ color: C.t1 }}>${Number(extracted.totalInvested).toLocaleString(undefined, { maximumFractionDigits: 0 })}</b></span>
              {extracted.totalValue && <span style={{ fontSize: 12, color: C.t2 }}>Market value: <b style={{ color: C.t1 }}>${Number(extracted.totalValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}</b></span>}
            </div>
          )}
          <div style={{ overflowX: "auto", marginBottom: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid " + C.border }}>
                  {["Ticker","Name","Qty","Avg","Current","Invested","Value","P&L"].map(function(hd) {
                    return <th key={hd} style={{ textAlign: "left", padding: "6px 8px", fontSize: 10, color: C.t3, fontWeight: 600, textTransform: "uppercase", whiteSpace: "nowrap" }}>{hd}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {extracted.holdings.map(function(h, i) {
                  var pnlNum = (h.currentValue && h.invested) ? ((h.currentValue - h.invested) / h.invested * 100).toFixed(1) : null;
                  var pnlPos = pnlNum !== null && parseFloat(pnlNum) >= 0;
                  return (
                    <tr key={i} style={{ borderBottom: "0.5px solid " + C.surface }}
                      onMouseEnter={function(e) { e.currentTarget.style.background = C.cardAlt; }}
                      onMouseLeave={function(e) { e.currentTarget.style.background = "transparent"; }}>
                      <td style={{ padding: "7px 8px", fontWeight: 700, color: C.t1 }}>{h.ticker}</td>
                      <td style={{ padding: "7px 8px", color: C.t2, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name || "—"}</td>
                      <td style={{ padding: "7px 8px", color: C.t2 }}>{h.qty || "—"}</td>
                      <td style={{ padding: "7px 8px", color: C.t2 }}>{h.avgPrice ? "$" + Number(h.avgPrice).toFixed(2) : "—"}</td>
                      <td style={{ padding: "7px 8px", fontWeight: 600, color: C.t1 }}>{h.currentPrice ? "$" + Number(h.currentPrice).toFixed(2) : "—"}</td>
                      <td style={{ padding: "7px 8px", color: C.t2 }}>{h.invested ? "$" + Number(h.invested).toFixed(0) : "—"}</td>
                      <td style={{ padding: "7px 8px", fontWeight: 600 }}>{h.currentValue ? "$" + Number(h.currentValue).toFixed(0) : "—"}</td>
                      <td style={{ padding: "7px 8px", fontWeight: 600, color: pnlNum !== null ? (pnlPos ? C.green : C.red) : C.t3 }}>
                        {pnlNum !== null ? (pnlPos ? "+" : "") + pnlNum + "%" : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button onClick={function() { setExtracted(null); setFiles([]); setPreviews([]); }}
              style={{ padding: "10px", borderRadius: 12, border: "0.5px solid " + C.border, background: C.cardAlt, color: C.t2, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
              ← Try Again
            </button>
            <button onClick={applyPortfolio}
              style={{ padding: "10px", borderRadius: 12, border: "none", background: C.greenD, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              ✓ Apply and Re-run Analysis
            </button>
          </div>
        </Card>
      )}
      {uploadHistory && uploadHistory.length > 0 && (
        <Card>
          <div style={{ fontSize: 10, color: C.accent, fontWeight: 700, letterSpacing: 1.5, marginBottom: 12 }}>UPDATE HISTORY</div>
          <div style={{ display: "grid", gap: 1 }}>
            {uploadHistory.map(function(entry, i) {
              var inv = entry.total_invested ? Number(entry.total_invested) : null;
              var val = entry.total_value    ? Number(entry.total_value)    : null;
              var pnl = (inv && val) ? ((val - inv) / inv * 100) : null;
              var pnlPos = pnl !== null && pnl >= 0;
              var dt = new Date(entry.uploaded_at);
              var dateStr = dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
              var timeStr = dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
              return (
                <div key={entry.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", padding: "10px 0", borderBottom: i < uploadHistory.length - 1 ? "0.5px solid " + C.surface : "none" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.t1 }}>{dateStr} · {timeStr}</div>
                    <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>{entry.num_positions} positions</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {inv && <div style={{ fontSize: 12, color: C.t2 }}>Cost <b style={{ color: C.t1 }}>${inv.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b></div>}
                    {val && <div style={{ fontSize: 12, color: C.t2 }}>Value <b style={{ color: C.t1 }}>${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b></div>}
                    {pnl !== null && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: pnlPos ? C.green : C.red }}>{pnlPos ? "+" : ""}{pnl.toFixed(1)}%</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   GLOBAL $100 OPTIMIZER
───────────────────────────────────────── */
var GLOBAL_INDICES = [
  { region: "United States",   index: "S&P 500",   etf: "VOO",  lev: "UPRO", levMult: 3, color: "#6B89A8", flag: "🇺🇸" },
  { region: "United States",   index: "Nasdaq-100",etf: "QQQ",  lev: "TQQQ", levMult: 3, color: "#8B7BA8", flag: "🇺🇸" },
  { region: "Japan",           index: "Nikkei 225",etf: "EWJ",  lev: "JPNL", levMult: 3, color: "#B5736A", flag: "🇯🇵" },
  { region: "Japan (Hedged)",  index: "Nikkei 225",etf: "DXJ",  lev: null,   levMult: 1, color: "#C49B9B", flag: "🇯🇵" },
  { region: "South Korea",     index: "KOSPI",     etf: "EWY",  lev: null,   levMult: 1, color: "#6B8F71", flag: "🇰🇷" },
  { region: "India",           index: "Nifty 50",  etf: "INDY", lev: null,   levMult: 1, color: "#B89B5E", flag: "🇮🇳" },
  { region: "India",           index: "BSE Total", etf: "EPI",  lev: null,   levMult: 1, color: "#C4967A", flag: "🇮🇳" },
];

/* Hedge ETFs */
var HEDGE_ETFS = [
  { ticker: "SH",  name: "Inverse S&P 500",     mult: -1 },
  { ticker: "PSQ", name: "Inverse Nasdaq-100",  mult: -1 },
];

/* Fetch chart data for an array of tickers, return last-N-day stats */
async function fetchIndexStats(ticker) {
  try {
    var data = await fetchChart(ticker, "6mo");
    if (!data || data.length < 30) { return null; }
    var prices = data.map(function(d) { return d.price; });
    var current = prices[prices.length - 1];

    /* Daily returns */
    var rets = [];
    for (var i = 1; i < prices.length; i++) {
      rets.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }

    /* Monthly bucketing for Kelly: count positive months */
    var months = {};
    for (var j = 0; j < data.length; j++) {
      var d = data[j].date;
      var key = d.getFullYear() + "-" + d.getMonth();
      if (!months[key]) { months[key] = { first: data[j].price, last: data[j].price }; }
      months[key].last = data[j].price;
    }
    var monthRets = Object.keys(months).map(function(k) { return (months[k].last - months[k].first) / months[k].first; });
    var posMonths = monthRets.filter(function(r) { return r > 0; }).length;
    var totalMonths = monthRets.length || 1;
    var p = posMonths / totalMonths; /* probability of positive month */

    /* Win/loss ratio: avg gain / avg loss */
    var gains = monthRets.filter(function(r) { return r > 0; });
    var losses = monthRets.filter(function(r) { return r < 0; }).map(function(r) { return Math.abs(r); });
    var avgGain = gains.length ? gains.reduce(function(s, x) { return s + x; }, 0) / gains.length : 0;
    var avgLoss = losses.length ? losses.reduce(function(s, x) { return s + x; }, 0) / losses.length : 0.01;
    var b = avgLoss > 0 ? avgGain / avgLoss : 1;

    /* Kelly fraction */
    var kelly = b > 0 ? (p * (b + 1) - 1) / b : 0;
    kelly = Math.max(0, Math.min(0.5, kelly)); /* cap at 50% */

    /* 6-month volatility (annualized) */
    var meanRet = rets.reduce(function(s, x) { return s + x; }, 0) / rets.length;
    var variance = rets.reduce(function(s, x) { return s + (x - meanRet) * (x - meanRet); }, 0) / rets.length;
    var dailyVol = Math.sqrt(variance);
    var annualVol = dailyVol * Math.sqrt(252) * 100;

    /* 6-month return */
    var sixMonthRet = ((current - prices[0]) / prices[0]) * 100;

    /* Moving Averages */
    function avg(arr) { return arr.reduce(function(s, x) { return s + x; }, 0) / arr.length; }
    var ma20 = prices.length >= 20 ? avg(prices.slice(-20)) : current;
    var ma50 = prices.length >= 50 ? avg(prices.slice(-50)) : current;
    var deathCross = ma20 < ma50; /* bearish signal — trigger hedge */

    /* Estimated annualized return = 6M return * 2 */
    var estAnnualReturn = sixMonthRet * 2;

    return {
      ticker: ticker,
      currentPrice: current,
      sixMonthReturn: sixMonthRet,
      estAnnualReturn: estAnnualReturn,
      annualVol: annualVol,
      probPositive: p,
      winLossRatio: b,
      kellyFraction: kelly,
      ma20: ma20,
      ma50: ma50,
      deathCross: deathCross,
      data: data,
    };
  } catch (e) {
    console.warn("Index stats fetch failed for", ticker, e);
    return null;
  }
}

/* Mini sparkline for heatmap cards */
function MiniSparkline({ data, color }) {
  if (!data || data.length < 2) { return null; }
  var prices = data.map(function(d) { return d.price; });
  var minP = Math.min.apply(null, prices);
  var maxP = Math.max.apply(null, prices);
  var range = maxP - minP || 1;
  var W = 100, H = 30;
  var pts = [];
  for (var i = 0; i < prices.length; i++) {
    var x = (i / (prices.length - 1)) * W;
    var y = H - ((prices[i] - minP) / range) * H;
    pts.push((i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1));
  }
  var pathD = pts.join(" ");
  var areaD = pathD + " L" + W + "," + H + " L0," + H + " Z";
  return (
    <svg width="100%" height={H} viewBox={"0 0 " + W + " " + H} preserveAspectRatio="none">
      <path d={areaD} fill={color} opacity="0.15" />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/* Heatmap card */
function HeatmapCard({ idx, stats, onClick }) {
  var ret = stats ? stats.sixMonthReturn : null;
  var bgIntensity = ret !== null ? Math.min(0.4, Math.abs(ret) / 100) : 0;
  var bg = ret >= 0 ? ("rgba(107,143,113," + bgIntensity + ")") : ("rgba(181,115,106," + bgIntensity + ")");
  return (
    <div onClick={onClick} style={{
      background: stats ? bg : C.cardAlt,
      borderRadius: 14, padding: "12px 14px",
      border: "0.5px solid " + C.border,
      cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s",
    }}
      onMouseEnter={function(e) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(44,37,32,0.1)"; }}
      onMouseLeave={function(e) { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div>
          <span style={{ fontSize: 18, marginRight: 6 }}>{idx.flag}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{idx.etf}</span>
        </div>
        {stats && stats.deathCross && <span style={{ fontSize: 9, background: C.redBg, color: C.redD, padding: "2px 6px", borderRadius: 99, fontWeight: 700 }}>⚠ Death X</span>}
      </div>
      <div style={{ fontSize: 10, color: C.t3, marginBottom: 4 }}>{idx.region} · {idx.index}</div>
      {stats ? (
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: ret >= 0 ? C.greenD : C.redD }}>
              {ret >= 0 ? "+" : ""}{ret.toFixed(1)}%
            </span>
            <span style={{ fontSize: 10, color: C.t3 }}>6M</span>
          </div>
          <MiniSparkline data={stats.data} color={ret >= 0 ? C.green : C.red} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 9, color: C.t3 }}>
            <span>Vol: {stats.annualVol.toFixed(0)}%</span>
            <span>Kelly: {(stats.kellyFraction * 100).toFixed(0)}%</span>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: C.t3, padding: "8px 0" }}>Loading…</div>
      )}
    </div>
  );
}

function GlobalTab() {
  var [statsMap, setStatsMap] = useState({});
  var [loading,  setLoading]  = useState(true);
  var [inflation, setInflation] = useState(3.5); /* 2026 estimated US inflation */
  var [aiAnalysis, setAiAnalysis] = useState(null);
  var [aiLoading,  setAiLoading]  = useState(false);

  useEffect(function() {
    setLoading(true);
    var tickers = [];
    for (var i = 0; i < GLOBAL_INDICES.length; i++) {
      tickers.push(GLOBAL_INDICES[i].etf);
      if (GLOBAL_INDICES[i].lev) { tickers.push(GLOBAL_INDICES[i].lev); }
    }
    Promise.all(tickers.map(function(t) { return fetchIndexStats(t); })).then(function(results) {
      var m = {};
      for (var i = 0; i < tickers.length; i++) {
        if (results[i]) { m[tickers[i]] = results[i]; }
      }
      setStatsMap(m);
      setLoading(false);
    });
  }, []);

  /* Build allocation: 70% inflation-beaters (high-growth EM) + 30% alpha (leveraged US) */
  var allocation = (function() {
    if (loading) { return null; }
    var allocs = [];

    /* Score all primary ETFs — prefer EM/India for inflation-beating */
    var inflationBeaters = [];
    var alphaGenerators = [];

    for (var i = 0; i < GLOBAL_INDICES.length; i++) {
      var idx = GLOBAL_INDICES[i];
      var s = statsMap[idx.etf];
      if (!s) { continue; }
      /* Inflation Delta = est annual return - inflation */
      var infDelta = s.estAnnualReturn - inflation;

      /* High-growth EM = India + Korea (real returns above inflation) */
      var isEM = idx.region.indexOf("India") >= 0 || idx.region === "South Korea";
      if (isEM && infDelta > 0) {
        inflationBeaters.push({ idx: idx, stats: s, infDelta: infDelta });
      }

      /* Alpha = leveraged US */
      if (idx.lev && statsMap[idx.lev]) {
        var levStats = statsMap[idx.lev];
        var levInfDelta = levStats.estAnnualReturn - inflation;
        if (levInfDelta > 0) {
          alphaGenerators.push({
            idx: { region: idx.region, index: idx.index + " 3x", etf: idx.lev, color: idx.color, flag: idx.flag, levMult: idx.levMult, isLev: true },
            stats: levStats,
            infDelta: levInfDelta,
          });
        }
      }
    }

    /* Sort by inflation delta — best first */
    inflationBeaters.sort(function(a, b) { return b.infDelta - a.infDelta; });
    alphaGenerators.sort(function(a, b) { return b.infDelta - a.infDelta; });

    /* Top 2 inflation beaters share 70%; top 1 alpha gets 30% */
    var beaterPool = 70;
    var alphaPool  = 30;

    if (inflationBeaters.length >= 2) {
      var totalK = inflationBeaters[0].stats.kellyFraction + inflationBeaters[1].stats.kellyFraction || 1;
      allocs.push({
        type: "BEATER",
        idx: inflationBeaters[0].idx,
        stats: inflationBeaters[0].stats,
        infDelta: inflationBeaters[0].infDelta,
        weight: beaterPool * (inflationBeaters[0].stats.kellyFraction / totalK),
      });
      allocs.push({
        type: "BEATER",
        idx: inflationBeaters[1].idx,
        stats: inflationBeaters[1].stats,
        infDelta: inflationBeaters[1].infDelta,
        weight: beaterPool * (inflationBeaters[1].stats.kellyFraction / totalK),
      });
    } else if (inflationBeaters.length === 1) {
      allocs.push({
        type: "BEATER",
        idx: inflationBeaters[0].idx,
        stats: inflationBeaters[0].stats,
        infDelta: inflationBeaters[0].infDelta,
        weight: beaterPool,
      });
    }

    if (alphaGenerators.length >= 1) {
      allocs.push({
        type: "ALPHA",
        idx: alphaGenerators[0].idx,
        stats: alphaGenerators[0].stats,
        infDelta: alphaGenerators[0].infDelta,
        weight: alphaPool,
      });
    }

    /* Compute dollar amounts on $100 capital */
    for (var k = 0; k < allocs.length; k++) {
      allocs[k].dollars = (allocs[k].weight / 100) * 100;
      /* Risk-Reward Ratio: target = +15% beater / +25% alpha; stop = -5% beater / -10% alpha */
      var targetPct = allocs[k].type === "ALPHA" ? 25 : 15;
      var stopPct   = allocs[k].type === "ALPHA" ? 10 : 5;
      var entry = allocs[k].stats.currentPrice;
      var target = entry * (1 + targetPct / 100);
      var stop   = entry * (1 - stopPct / 100);
      allocs[k].entry = entry;
      allocs[k].target = target;
      allocs[k].stop = stop;
      allocs[k].rrr = (target - entry) / (entry - stop); /* should be >1 */
    }

    /* Portfolio Beta estimate: leveraged ETFs ~3x base, EM ~1.2x */
    var portBeta = 0;
    for (var m = 0; m < allocs.length; m++) {
      var beta = allocs[m].idx.isLev ? allocs[m].idx.levMult : (allocs[m].idx.region.indexOf("India") >= 0 ? 1.3 : 1.1);
      portBeta += beta * (allocs[m].weight / 100);
    }

    /* Hedge alert: if any major US index has death cross */
    var spyStats = statsMap["VOO"];
    var qqqStats = statsMap["QQQ"];
    var hedgeAlert = (spyStats && spyStats.deathCross) || (qqqStats && qqqStats.deathCross);

    return { allocs: allocs, portBeta: portBeta, hedgeAlert: hedgeAlert };
  })();

  function getAIInsight() {
    if (!allocation) { return; }
    setAiLoading(true);
    var allocStr = allocation.allocs.map(function(a) {
      return a.idx.etf + " " + a.weight.toFixed(0) + "% ($" + a.dollars.toFixed(0) + "), 6M ret " + a.stats.sixMonthReturn.toFixed(1) + "%, vol " + a.stats.annualVol.toFixed(0) + "%, infDelta " + a.infDelta.toFixed(1) + "%";
    }).join("; ");
    var msg = "Global $100 barbell allocation against " + inflation + "% inflation: " + allocStr
      + ". Portfolio Beta: " + allocation.portBeta.toFixed(2) + "."
      + '\n\nReturn: {"verdict":"3-sentence assessment of this barbell allocation","monthlyAlpha":"expected monthly outperformance vs inflation","topRisk":"primary risk to monitor","executionTip":"specific 1-sentence trade execution suggestion"}';
    callAI(msg, MODEL_FAST, null).then(function(r) { setAiAnalysis(r); setAiLoading(false); }).catch(function() {
      callOpenAI(msg, null).then(function(r) { setAiAnalysis(r); setAiLoading(false); }).catch(function() { setAiLoading(false); });
    });
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>

      {/* Header Card */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: C.accent, fontWeight: 700, letterSpacing: 1.5, marginBottom: 4 }}>🌍 GLOBAL $100 OPTIMIZER · BARBELL STRATEGY</div>
            <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.6, maxWidth: 540 }}>
              70% capital into inflation-beating emerging market index ETFs (India, Korea), 30% into leveraged US alpha generators. Position sizing via modified Kelly Criterion on 6-month volatility.
            </div>
          </div>
          <div style={{ background: C.cardAlt, padding: "8px 12px", borderRadius: 10, textAlign: "center" }}>
            <div style={{ fontSize: 9, color: C.t3, textTransform: "uppercase", letterSpacing: 1 }}>2026 Inflation</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
              <input
                type="number"
                value={inflation}
                onChange={function(e) { setInflation(Number(e.target.value) || 0); }}
                step="0.1"
                style={{ width: 50, padding: "3px 6px", fontSize: 14, fontWeight: 700, color: C.amberD, border: "0.5px solid " + C.border, borderRadius: 6, background: "#fff", textAlign: "center" }}
              />
              <span style={{ fontSize: 14, fontWeight: 700, color: C.amberD }}>%</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Hedge alert */}
      {allocation && allocation.hedgeAlert && (
        <div style={{ background: C.redBg, border: "0.5px solid " + C.red, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.redD, marginBottom: 2 }}>HEDGE ALERT — DEATH CROSS DETECTED</div>
            <div style={{ fontSize: 11, color: C.redD, lineHeight: 1.5 }}>The 20-day MA has crossed below the 50-day MA on a major US index. Consider pivoting 10% into <strong>SH</strong> (inverse S&P) or <strong>PSQ</strong> (inverse Nasdaq) for downside protection.</div>
          </div>
        </div>
      )}

      {/* Global Heatmap */}
      <Card>
        <div style={{ fontSize: 10, color: C.accent, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8 }}>GLOBAL INDEX HEATMAP — 6M PERFORMANCE</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
          {GLOBAL_INDICES.map(function(idx, i) {
            return <HeatmapCard key={i} idx={idx} stats={statsMap[idx.etf]} />;
          })}
        </div>
      </Card>

      {/* Loading */}
      {loading && <Card><Loader msg="Fetching 6-month index data from Yahoo Finance…" /></Card>}

      {/* Allocation Plan */}
      {!loading && allocation && allocation.allocs.length > 0 && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: C.accent, fontWeight: 700, letterSpacing: 1.5, marginBottom: 4 }}>$100 BARBELL ALLOCATION</div>
              <div style={{ fontSize: 11, color: C.t2 }}>Portfolio Beta: <strong style={{ color: allocation.portBeta >= 1.4 && allocation.portBeta <= 1.9 ? C.green : C.amber }}>{allocation.portBeta.toFixed(2)}</strong> (target: 1.4 – 1.9)</div>
            </div>
            <button onClick={getAIInsight} disabled={aiLoading}
              style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: aiLoading ? C.t3 : C.purple, color: "#fff", fontSize: 11, fontWeight: 600, cursor: aiLoading ? "wait" : "pointer" }}>
              {aiLoading ? "Generating…" : "🤖 AI Insight"}
            </button>
          </div>

          {/* AI Insight */}
          {aiAnalysis && (
            <div style={{ background: C.purpleBg, borderRadius: 12, padding: "10px 14px", marginBottom: 12, borderLeft: "3px solid " + C.purple }}>
              <div style={{ fontSize: 10, color: C.purpleD, fontWeight: 700, letterSpacing: 1.2, marginBottom: 4 }}>AI VERDICT</div>
              <p style={{ fontSize: 12, color: C.t1, margin: "0 0 6px", lineHeight: 1.6 }}>{aiAnalysis.verdict}</p>
              {aiAnalysis.monthlyAlpha && <div style={{ fontSize: 11, color: C.t2, marginBottom: 4 }}><strong>Expected Alpha:</strong> {aiAnalysis.monthlyAlpha}</div>}
              {aiAnalysis.topRisk && <div style={{ fontSize: 11, color: C.redD, marginBottom: 4 }}><strong>Top Risk:</strong> {aiAnalysis.topRisk}</div>}
              {aiAnalysis.executionTip && <div style={{ fontSize: 11, color: C.greenD }}><strong>Execute:</strong> {aiAnalysis.executionTip}</div>}
            </div>
          )}

          {/* Deep Dive Table */}
          <div style={{ overflowX: "auto", marginBottom: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid " + C.border }}>
                  {["Bucket", "Ticker", "Size $", "Entry", "Target", "Stop", "RRR", "Inf Δ"].map(function(h) {
                    return <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontSize: 10, color: C.t3, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {allocation.allocs.map(function(a, i) {
                  return (
                    <tr key={i} style={{ borderBottom: "0.5px solid " + C.surface }}>
                      <td style={{ padding: "8px" }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: a.type === "ALPHA" ? C.purpleBg : C.greenBg, color: a.type === "ALPHA" ? C.purpleD : C.greenD }}>
                          {a.type === "ALPHA" ? "α ALPHA" : "🛡 BEATER"}
                        </span>
                      </td>
                      <td style={{ padding: "8px", fontWeight: 700, color: C.t1 }}>
                        <span style={{ marginRight: 4 }}>{a.idx.flag}</span>{a.idx.etf}
                      </td>
                      <td style={{ padding: "8px", fontWeight: 700, color: C.greenD }}>${a.dollars.toFixed(2)}</td>
                      <td style={{ padding: "8px", color: C.t2 }}>${a.entry.toFixed(2)}</td>
                      <td style={{ padding: "8px", color: C.greenD }}>${a.target.toFixed(2)}</td>
                      <td style={{ padding: "8px", color: C.redD }}>${a.stop.toFixed(2)}</td>
                      <td style={{ padding: "8px", fontWeight: 700, color: a.rrr >= 2 ? C.green : C.amber }}>{a.rrr.toFixed(2)}:1</td>
                      <td style={{ padding: "8px", fontWeight: 700, color: a.infDelta > 5 ? C.green : C.amber }}>+{a.infDelta.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Execution Steps */}
          <div style={{ background: C.cardAlt, borderRadius: 12, padding: "10px 14px", marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: C.accent, fontWeight: 700, letterSpacing: 1.2, marginBottom: 6 }}>📋 EXECUTION INSTRUCTIONS</div>
            {allocation.allocs.map(function(a, i) {
              return (
                <div key={i} style={{ fontSize: 12, color: C.t1, padding: "4px 0", lineHeight: 1.6 }}>
                  <span style={{ color: C.accent, marginRight: 6 }}>{i + 1}.</span>
                  Buy <strong>${a.dollars.toFixed(2)}</strong> of <strong>{a.idx.etf}</strong> at market open · target <strong>${a.target.toFixed(2)}</strong> ({((a.target / a.entry - 1) * 100).toFixed(0)}%) · stop-loss <strong>${a.stop.toFixed(2)}</strong> ({((a.stop / a.entry - 1) * 100).toFixed(0)}%)
                </div>
              );
            })}
          </div>

          {/* Beta warning */}
          {(allocation.portBeta < 1.4 || allocation.portBeta > 1.9) && (
            <div style={{ background: C.amberBg, borderRadius: 10, padding: "8px 12px", marginBottom: 8, fontSize: 11, color: C.amberD }}>
              ⚠ Portfolio Beta of <strong>{allocation.portBeta.toFixed(2)}</strong> is outside the target range (1.4 – 1.9). {allocation.portBeta < 1.4 ? "Consider adding more leveraged exposure." : "Consider reducing leveraged ETF allocation."}
            </div>
          )}
        </Card>
      )}

      {/* Volatility Decay Risk Warning */}
      <div style={{ background: "linear-gradient(135deg, " + C.redBg + " 0%, " + C.amberBg + " 100%)", borderRadius: 16, padding: "16px 18px", border: "0.5px solid " + C.red }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 20 }}>📈</span>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.redD, letterSpacing: 1 }}>VOLATILITY DECAY RISK WARNING</div>
        </div>
        <p style={{ fontSize: 12, color: C.t1, lineHeight: 1.6, margin: "0 0 8px" }}>
          When using leveraged ETFs (UPRO, TQQQ, JPNL) with a small <strong>$100 account</strong>, <strong>volatility decay</strong> is your biggest enemy. These instruments are mathematically designed for <strong>short-term tactical moves</strong>, not multi-year buy-and-hold positions.
        </p>
        <div style={{ background: "rgba(255,255,255,0.5)", borderRadius: 10, padding: "10px 12px", marginTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.redD, marginBottom: 4 }}>🔔 30-DAY REBALANCE ALERT</div>
          <div style={{ fontSize: 11, color: C.t1, lineHeight: 1.5 }}>Set a calendar reminder to rebalance your leveraged positions every <strong>30 days</strong>. Volatility drag can erode 1-2% per month even in flat markets, eating directly into your $100 capital.</div>
        </div>
      </div>

      {/* Hedge ETF reference */}
      <Card>
        <div style={{ fontSize: 10, color: C.accent, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8 }}>🛡 DOWNSIDE HEDGE INSTRUMENTS</div>
        <div style={{ fontSize: 11, color: C.t2, marginBottom: 10 }}>If 20-day MA crosses below 50-day MA (death cross), pivot 10% of portfolio into one of these inverse ETFs:</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
          {HEDGE_ETFS.map(function(h, i) {
            return (
              <div key={i} style={{ background: C.redBg, borderRadius: 10, padding: "8px 12px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.redD }}>{h.ticker}</div>
                <div style={{ fontSize: 10, color: C.t2 }}>{h.name}</div>
                <div style={{ fontSize: 10, color: C.redD, marginTop: 2 }}>Pivot $10 if death cross</div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/* ─────────────────────────────────────────
/* ─────────────────────────────────────────
   AUTHENTICATION
───────────────────────────────────────── */
function getAuthSession() {
  try {
    var s = window[AUTH_KEY];
    if (s && s.user === AUTH_USER && (Date.now() - s.ts) < SESSION_MS) {
      return s;
    }
  } catch (e) {}
  return null;
}
function setAuthSession(user) {
  try { window[AUTH_KEY] = { user: user, ts: Date.now() }; } catch (e) {}
}
function clearAuthSession() {
  try { window[AUTH_KEY] = null; } catch (e) {}
}

function LoginScreen({ onLogin }) {
  var [user, setUser] = useState("");
  var [pass, setPass] = useState("");
  var [showPass, setShowPass] = useState(false);
  var [err,  setErr]  = useState(null);
  var [busy, setBusy] = useState(false);

  function attempt() {
    setErr(null);
    setBusy(true);
    /* Brief delay for UX feedback */
    setTimeout(function() {
      if (user.trim() === AUTH_USER && pass === AUTH_PASS) {
        setAuthSession(user.trim());
        onLogin();
      } else {
        setErr("Invalid username or password.");
        setBusy(false);
      }
    }, 400);
  }

  function onKeyDown(e) {
    if (e.key === "Enter") { attempt(); }
  }

  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{
        width: "100%", maxWidth: 380,
        background: C.card, borderRadius: 24,
        padding: "32px 28px",
        border: "0.5px solid " + C.border,
        boxShadow: "0 8px 40px rgba(44,37,32,0.08)",
      }}>

        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: C.header, color: "#F5F0EB",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 26, fontWeight: 700, margin: "0 auto 14px",
            letterSpacing: -1,
          }}>α</div>
          <div style={{ color: C.accent, fontSize: 10, letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 4 }}>
            Alpha-Gen Intelligence
          </div>
          <div style={{ color: C.t1, fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Welcome back</div>
          <div style={{ color: C.t3, fontSize: 12 }}>Sign in to access your portfolio dashboard</div>
        </div>

        {/* Username */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, color: C.t2, fontWeight: 600, marginBottom: 6, display: "block", letterSpacing: 0.3 }}>Username</label>
          <input
            type="text"
            value={user}
            onChange={function(e) { setUser(e.target.value); setErr(null); }}
            onKeyDown={onKeyDown}
            autoComplete="username"
            autoFocus
            placeholder="Enter username"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "11px 14px", borderRadius: 10,
              border: "0.5px solid " + C.border,
              background: C.cardAlt, color: C.t1,
              fontSize: 14, outline: "none",
              transition: "border-color 0.15s, background 0.15s",
            }}
            onFocus={function(e) { e.target.style.borderColor = C.accent; e.target.style.background = "#fff"; }}
            onBlur={function(e) { e.target.style.borderColor = C.border; e.target.style.background = C.cardAlt; }}
          />
        </div>

        {/* Password */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 11, color: C.t2, fontWeight: 600, marginBottom: 6, display: "block", letterSpacing: 0.3 }}>Password</label>
          <div style={{ position: "relative" }}>
            <input
              type={showPass ? "text" : "password"}
              value={pass}
              onChange={function(e) { setPass(e.target.value); setErr(null); }}
              onKeyDown={onKeyDown}
              autoComplete="current-password"
              placeholder="Enter password"
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "11px 44px 11px 14px", borderRadius: 10,
                border: "0.5px solid " + C.border,
                background: C.cardAlt, color: C.t1,
                fontSize: 14, outline: "none",
                transition: "border-color 0.15s, background 0.15s",
              }}
              onFocus={function(e) { e.target.style.borderColor = C.accent; e.target.style.background = "#fff"; }}
              onBlur={function(e) { e.target.style.borderColor = C.border; e.target.style.background = C.cardAlt; }}
            />
            <button
              type="button"
              onClick={function() { setShowPass(!showPass); }}
              style={{
                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                background: "transparent", border: "none", cursor: "pointer",
                padding: "6px 10px", color: C.t3, fontSize: 11, fontWeight: 500,
              }}
            >
              {showPass ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        {/* Error */}
        {err && (
          <div style={{
            background: C.redBg, color: C.redD,
            borderRadius: 10, padding: "9px 12px",
            fontSize: 12, marginBottom: 14,
            display: "flex", alignItems: "center", gap: 6,
          }}>⚠ {err}</div>
        )}

        {/* Submit */}
        <button
          onClick={attempt}
          disabled={busy || !user || !pass}
          style={{
            width: "100%", padding: "13px",
            borderRadius: 12, border: "none",
            background: busy || !user || !pass ? C.t3 : C.header,
            color: "#F5F0EB",
            fontSize: 14, fontWeight: 600,
            cursor: busy || !user || !pass ? "not-allowed" : "pointer",
            transition: "background 0.15s, transform 0.15s",
            opacity: busy ? 0.7 : 1,
          }}
          onMouseEnter={function(e) { if (!busy && user && pass) { e.currentTarget.style.transform = "translateY(-1px)"; } }}
          onMouseLeave={function(e) { e.currentTarget.style.transform = "none"; }}
        >
          {busy ? "Signing in…" : "Sign In →"}
        </button>

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 20, paddingTop: 16, borderTop: "0.5px solid " + C.border }}>
          <div style={{ fontSize: 10, color: C.t3, lineHeight: 1.6 }}>
            Secured access · Session valid for 7 days
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
/* ═══════════════════════════════════════
   MAIN APP (auth-gated)
═══════════════════════════════════════ */
export default function App() {
  var [authed, setAuthed] = useState(function() { return getAuthSession() !== null; });

  if (!authed) {
    return <LoginScreen onLogin={function() { setAuthed(true); }} />;
  }

  return <Dashboard onLogout={function() { clearAuthSession(); setAuthed(false); }} />;
}

function Dashboard({ onLogout }) {
  var [portfolio,     setPortfolio]     = useState(DEFAULT_P);
  var [signals,       setSignals]       = useState(null);
  var [loading,       setLoading]       = useState(true);
  var [step,          setStep]          = useState(0);
  var [err,           setErr]           = useState(null);
  var [tab,           setTab]           = useState("overview");
  var [selTicker,     setSelTicker]     = useState(null);
  var [deepL,         setDeepL]         = useState(false);
  var [deepD,         setDeepD]         = useState({});
  var [isCustom,      setIsCustom]      = useState(false);
  var [apiStatus,     setApiStatus]     = useState("checking");
  var [uploadHistory, setUploadHistory] = useState([]);
  var lockRef = useRef(false);
  var timerRef = useRef(null);

  /* Health check on mount */
  useEffect(function() {
    setApiStatus("checking");
    checkAPIHealth().then(function(ok) {
      setApiStatus(ok ? "online" : "offline");
    });
  }, []);

  var TV   = sumField(portfolio, "v");
  var TI   = sumField(portfolio, "inv");
  var TPnL = TV - TI;
  var TPct = (TPnL / TI * 100).toFixed(2);

  var runAnalysis = useCallback(function(P, force) {
    if (lockRef.current) { return; }
    var TV_ = sumField(P, "v");
    var TI_ = sumField(P, "inv");
    var TPct_ = (((TV_ - TI_) / TI_) * 100).toFixed(2);

    if (!force) {
      var cached = readCache();
      if (cached) { setSignals(cached); setLoading(false); return; }
    }

    lockRef.current = true;
    setLoading(true);
    setErr(null);
    setStep(0);

    var half     = Math.ceil(P.length / 2);
    var tickers1 = P.slice(0, half).map(function(h) { return h.t; });
    var tickers2 = P.slice(half).map(function(h) { return h.t; });
    var rawData  = {};

    fetchSummary(P, TV_, TI_, TPct_)
      .then(function(summary) {
        rawData.summary = summary;
        setStep(1);
        return sleep(800);
      })
      .then(function() { return fetchBatch(tickers1, P, TV_); })
      .then(function(b1) {
        rawData.b1 = b1.holdings || [];
        setStep(2);
        return sleep(800);
      })
      .then(function() { return fetchBatch(tickers2, P, TV_); })
      .then(function(b2) {
        rawData.b2 = b2.holdings || [];
        setStep(3);
        var result = validateSignals(rawData, P, TV_);
        writeCache(result);
        setSignals(result);
        setErr(null);
        if (timerRef.current) { clearTimeout(timerRef.current); }
        timerRef.current = setTimeout(function() { lockRef.current = false; runAnalysis(P, true); }, DAY_MS);
      })
      .catch(function(e) {
        setErr(e.message || "Analysis failed. Please retry.");
        if (timerRef.current) { clearTimeout(timerRef.current); }
        timerRef.current = setTimeout(function() { lockRef.current = false; runAnalysis(P, true); }, 30000);
      })
      .finally(function() {
        setLoading(false);
        lockRef.current = false;
      });
  }, []);

  /* Load latest portfolio from DB on mount — keeps all devices in sync */
  useEffect(function() {
    fetch("/api/load-portfolio")
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) {
        if (!data) return;
        if (data.history) { setUploadHistory(data.history); }
        if (data.portfolio && data.portfolio.length > 0) {
          setPortfolio(data.portfolio);
          setIsCustom(true);
          lockRef.current = false;
          clearCache();
          runAnalysis(data.portfolio, false);
        }
      })
      .catch(function() {});
  }, []);

  useEffect(function() { runAnalysis(portfolio, false); return function() { if (timerRef.current) { clearTimeout(timerRef.current); } }; }, []);

  function handlePortfolioExtracted(newP) {
    lockRef.current = false;
    if (timerRef.current) { clearTimeout(timerRef.current); }
    clearCache();
    setPortfolio(newP);
    setSignals(null);
    setDeepD({});
    setIsCustom(true);
    setTab("overview");
    runAnalysis(newP, true);
    /* Refresh upload history after sync settles */
    setTimeout(function() {
      fetch("/api/load-portfolio")
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) { if (data && data.history) { setUploadHistory(data.history); } })
        .catch(function() {});
    }, 2500);
  }

  function retryAnalysis() {
    lockRef.current = false;
    setErr(null);
    setApiStatus("checking");
    checkAPIHealth().then(function(ok) {
      setApiStatus(ok ? "online" : "offline");
      if (ok) {
        runAnalysis(portfolio, true);
      } else {
        setErr("API is unreachable. Check your connection and try again.");
        setLoading(false);
      }
    });
  }

  async function doDive(ticker) {
    setSelTicker(ticker);
    if (deepD[ticker]) { return; }
    setDeepL(true);
    try {
      var d = await fetchDeep(ticker, portfolio);
      setDeepD(function(prev) { return Object.assign({}, prev, { [ticker]: d }); });
    } catch (e) {
      setDeepD(function(prev) { return Object.assign({}, prev, { [ticker]: { error: e.message } }); });
    }
    setDeepL(false);
  }

  var pie  = portfolio.map(function(h) { return { t: h.t, pct: h.v / TV * 100 }; });
  var ts   = window[CACHE_KEY] && window[CACHE_KEY].ts;
  var deep = selTicker ? (deepD[selTicker] || null) : null;
  var selH = selTicker ? findInPortfolio(portfolio, selTicker) : null;
  var TABS = [["overview","Overview"],["signals","Signals"],["verdicts","Verdicts"],["alloc","Allocation"],["risk","Risk"],["weekly","📊 Weekly"],["global","🌍 Global $100"],["upload","📱 Update"]];

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 880, margin: "0 auto", padding: "14px 10px", background: C.bg, minHeight: "100vh", color: C.t1 }}>

      {/* ── Header ── */}
      <div style={{ background: C.header, borderRadius: 20, padding: "20px 24px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ color: C.accentL, fontSize: 10, letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 3 }}>Alpha-Gen Intelligence</div>
          <div style={{ color: "#F5F0EB", fontSize: 22, fontWeight: 600 }}>
            Portfolio Dashboard
            {isCustom && <span style={{ background: C.amber, color: C.header, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, marginLeft: 10, verticalAlign: "middle" }}>UPDATED</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            {/* API Status Indicator */}
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              background: apiStatus === "online" ? "rgba(107,143,113,0.2)" : apiStatus === "offline" ? "rgba(181,115,106,0.2)" : "rgba(184,155,94,0.2)",
              padding: "3px 10px", borderRadius: 99, fontSize: 10, fontWeight: 600,
              color: apiStatus === "online" ? "#8FAE8B" : apiStatus === "offline" ? C.red : C.amber,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: 99,
                background: apiStatus === "online" ? "#8FAE8B" : apiStatus === "offline" ? C.red : C.amber,
                animation: apiStatus === "checking" ? "ldot 1.2s ease infinite" : (apiStatus === "online" ? "pulse2 2s ease infinite" : "none"),
              }} />
              {apiStatus === "checking" ? "Checking API…" : apiStatus === "online" ? "API Online" : "API Offline"}
            </span>
            <style>{"@keyframes pulse2{0%,100%{opacity:.6}50%{opacity:1}}"}</style>
            {/* Models label */}
            <span style={{ fontSize: 10, color: "#7A6E63" }}>OpenAI (fast) + Claude (deep) · auto-fallback</span>
            {ts && <span style={{ fontSize: 10, color: "#5A5048" }}>{"· Updated " + new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: C.t3, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Total Value</div>
          <div style={{ color: "#F5F0EB", fontSize: 24, fontWeight: 700 }}>{"$" + TV.toFixed(2)}</div>
          <div style={{ color: TPnL >= 0 ? "#8FAE8B" : C.red, fontSize: 13, fontWeight: 600 }}>{TPnL >= 0 ? "▲" : "▼"} ${Math.abs(TPnL).toFixed(2)} ({TPct}%)</div>
          <button
            onClick={onLogout}
            style={{
              marginTop: 8, padding: "4px 12px", borderRadius: 99,
              background: "rgba(245,240,235,0.1)", border: "0.5px solid rgba(196,181,160,0.3)",
              color: C.accentL, fontSize: 10, fontWeight: 500,
              cursor: "pointer", transition: "background 0.15s",
            }}
            onMouseEnter={function(e) { e.currentTarget.style.background = "rgba(245,240,235,0.18)"; }}
            onMouseLeave={function(e) { e.currentTarget.style.background = "rgba(245,240,235,0.1)"; }}
          >
            Sign out ↗
          </button>
        </div>
      </div>

      {/* ── Error banner + Retry button ── */}
      {err && (
        <div style={{ background: C.amberBg, border: "0.5px solid " + C.amber, borderRadius: 12, padding: "12px 14px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: C.amberD, flex: 1 }}>⚠ {err}</div>
          <button onClick={retryAnalysis}
            style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
            ↻ Retry Now
          </button>
        </div>
      )}

      {loading && <Card><StepsBar step={step} /><Loader msg="Analyzing portfolio (OpenAI + Claude fallback)…" /></Card>}

      {!loading && signals && (
        <div>
          {/* ── Tabs ── */}
          <div style={{ display: "flex", gap: 3, marginBottom: 14, background: C.cardAlt, padding: 4, borderRadius: 14, overflowX: "auto" }}>
            {TABS.map(function(pair) {
              return (
                <button key={pair[0]} onClick={function() { setTab(pair[0]); }}
                  style={{ flexShrink: 0, padding: "7px 10px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500, background: tab === pair[0] ? C.header : "transparent", color: tab === pair[0] ? "#F5F0EB" : C.t2, transition: "all 0.15s", whiteSpace: "nowrap" }}>
                  {pair[1]}
                </button>
              );
            })}
          </div>

          {/* ════ WEEKLY ════ */}
          {tab === "weekly" && (
            <WeeklyTab
              portfolio={portfolio}
              signals={signals}
              TV={TV}
              TI={TI}
              onGoToUpload={function() { setTab("upload"); }}
            />
          )}

          {/* ════ GLOBAL $100 ════ */}
          {tab === "global" && <GlobalTab />}

          {/* ════ UPLOAD ════ */}
          {tab === "upload" && <UploadPanel onPortfolioExtracted={handlePortfolioExtracted} uploadHistory={uploadHistory} />}

          {/* ════ OVERVIEW ════ */}
          {tab === "overview" && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(125px, 1fr))", gap: 8 }}>
                <Metric label="Invested"  value={"$" + TI.toFixed(0)} />
                <Metric label="Value"     value={"$" + TV.toFixed(0)} />
                <Metric label="Total P&L" value={TPct + "%"} color={parseFloat(TPct) >= 0 ? C.green : C.red} />
                <Metric label="Risk"      value={signals.portfolioRisk} color={signals.portfolioRisk === "HIGH" || signals.portfolioRisk === "VERY_HIGH" ? C.red : C.amber} />
              </div>
              <Card>
                <div style={{ fontSize: 10, color: C.accent, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8 }}>AI EXECUTIVE SUMMARY</div>
                <p style={{ fontSize: 13, color: C.t1, lineHeight: 1.7, margin: "0 0 6px" }}>{signals.summary}</p>
                <p style={{ fontSize: 13, color: C.t2, lineHeight: 1.7, margin: "0 0 10px" }}>{signals.alphaTarget}</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ background: C.purpleBg, color: C.purpleD, padding: "4px 12px", borderRadius: 99, fontSize: 11, fontWeight: 600 }}>Alpha: {signals.monthlyAlphaBps}bps/mo</span>
                  <span style={{ background: C.amberBg,  color: C.amberD,  padding: "4px 12px", borderRadius: 99, fontSize: 11, fontWeight: 600 }}>VaR: {(signals.varEstimate || 0).toFixed(1)}%</span>
                  <span style={{ background: C.blueBg,   color: C.blueD,   padding: "4px 12px", borderRadius: 99, fontSize: 11, fontWeight: 600 }}>{portfolio.length} Holdings</span>
                </div>
                {signals.topAlphaIdea && (
                  <div style={{ marginTop: 12, padding: "10px 14px", background: C.greenBg, borderRadius: 12, borderLeft: "3px solid " + C.green }}>
                    <div style={{ fontSize: 10, color: C.greenD, fontWeight: 700, marginBottom: 3 }}>TOP ALPHA IDEA</div>
                    <div style={{ fontSize: 12, color: C.t1, lineHeight: 1.6 }}>{signals.topAlphaIdea}</div>
                  </div>
                )}
              </Card>
              <Card style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <Donut data={pie} TV={TV} />
                  <div style={{ fontSize: 10, color: C.t3, marginTop: 4 }}>Current Allocation</div>
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 8 }}>Click any holding for deep dive + chart</div>
                  {portfolio.map(function(h, i) {
                    var pnl = ((h.v - h.inv) / h.inv * 100).toFixed(1);
                    var sig = null;
                    if (signals.holdings) {
                      for (var j = 0; j < signals.holdings.length; j++) {
                        if (signals.holdings[j].ticker === h.t) { sig = signals.holdings[j]; break; }
                      }
                    }
                    return (
                      <div key={i} onClick={function() { doDive(h.t); }}
                        style={{ display: "flex", alignItems: "center", padding: "6px 4px", borderBottom: "0.5px solid " + C.surface, cursor: "pointer", borderRadius: 6, transition: "background 0.1s" }}
                        onMouseEnter={function(e) { e.currentTarget.style.background = C.cardAlt; }}
                        onMouseLeave={function(e) { e.currentTarget.style.background = "transparent"; }}>
                        <div style={{ width: 7, height: 7, borderRadius: 2, background: PIES[i % PIES.length], marginRight: 8 }} />
                        <div style={{ fontSize: 12, fontWeight: 700, width: 42, color: C.t1 }}>{h.t}</div>
                        <div style={{ fontSize: 10, color: C.t3, flex: 1 }}>{(h.v / TV * 100).toFixed(1)}%</div>
                        {sig && <VBadge v={sig.verdict} />}
                        <div style={{ fontSize: 11, fontWeight: 600, color: parseFloat(pnl) >= 0 ? C.green : C.red, marginLeft: 6 }}>{parseFloat(pnl) >= 0 ? "+" : ""}{pnl}%</div>
                      </div>
                    );
                  })}
                  <div onClick={function() { setTab("upload"); }}
                    style={{ marginTop: 10, padding: "8px 12px", background: C.accentL + "33", borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, border: "0.5px dashed " + C.accentL }}
                    onMouseEnter={function(e) { e.currentTarget.style.background = C.cardAlt; }}
                    onMouseLeave={function(e) { e.currentTarget.style.background = C.accentL + "33"; }}>
                    <span style={{ fontSize: 16 }}>📱</span>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.accent }}>Update from screenshots</div>
                      <div style={{ fontSize: 10, color: C.t3 }}>Upload new screenshots to refresh</div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* ════ SIGNALS ════ */}
          {tab === "signals" && (
            <div style={{ display: "grid", gap: 10 }}>
              {signals.holdings && signals.holdings.slice().sort(function(a, b) { return b.alphaScore - a.alphaScore; }).map(function(h, i) {
                var portH = findInPortfolio(portfolio, h.ticker);
                return (
                  <Card key={i} onClick={function() { doDive(h.ticker); }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <span style={{ fontSize: 15, fontWeight: 700, color: C.t1 }}>{h.ticker}</span>
                        <span style={{ fontSize: 11, color: C.t3, marginLeft: 8 }}>{portH ? portH.n : ""}</span>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: h.alphaScore >= 70 ? C.green : h.alphaScore >= 45 ? C.amber : C.red }}>{h.alphaScore}</div>
                        <div style={{ fontSize: 9, color: C.t3, letterSpacing: 1 }}>ALPHA</div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 14px" }}>
                      {[["Momentum", h.momentum],["Sentiment", h.sentiment],["Options Flow", h.optionsSignal],["Whale Activity", h.whaleActivity]].map(function(pair) {
                        return (
                          <div key={pair[0]}>
                            <div style={{ fontSize: 10, color: C.t3, marginBottom: 2 }}>{pair[0]}</div>
                            <ScoreBar score={pair[1]} />
                          </div>
                        );
                      })}
                    </div>
                    {h.catalysts && h.catalysts.length > 0 && (
                      <div style={{ marginTop: 8, display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {h.catalysts.map(function(cat, j) { return <span key={j} style={{ background: C.purpleBg, color: C.purpleD, fontSize: 10, padding: "2px 8px", borderRadius: 99 }}>{cat}</span>; })}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {/* ════ VERDICTS ════ */}
          {tab === "verdicts" && (
            <div style={{ display: "grid", gap: 10 }}>
              {signals.rebalancingActions && signals.rebalancingActions.length > 0 && (
                <div style={{ background: C.header, borderRadius: 16, padding: 14 }}>
                  <div style={{ fontSize: 10, color: C.accentL, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8 }}>REBALANCING ACTIONS</div>
                  {signals.rebalancingActions.map(function(a, i) {
                    return <div key={i} style={{ color: "#E8E0D5", fontSize: 12, padding: "3px 0", display: "flex", gap: 8 }}><span style={{ color: C.accentL, flexShrink: 0 }}>→</span>{a}</div>;
                  })}
                  <div style={{ marginTop: 8, padding: "6px 10px", background: "rgba(196,181,160,0.15)", borderRadius: 8, fontSize: 10, color: "#A89E93" }}>
                    💡 $2 brokerage cost per trade. Only execute trades over ${MIN_TRADE} to keep fees under 10%. See the 📊 Weekly tab for filtered suggestions.
                  </div>
                </div>
              )}
              {signals.holdings && signals.holdings.map(function(h, i) {
                var portH = findInPortfolio(portfolio, h.ticker);
                return (
                  <Card key={i} onClick={function() { doDive(h.ticker); }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: C.t1 }}>{h.ticker}</div>
                        <div style={{ display: "flex", gap: 5, marginTop: 5, flexWrap: "wrap" }}>
                          <VBadge v={h.verdict} />
                          <TBadge v={h.timingSignal} />
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: C.accent, lineHeight: 1 }}>{h.confidence}%</div>
                        <div style={{ fontSize: 9, color: C.t3, letterSpacing: 1 }}>CONFIDENCE</div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 7 }}>
                      {[
                        { l: "Current",   v: h.currentWeight.toFixed(1) + "%",  sub: "$" + (h.currentWeight / 100 * TV).toFixed(0), bg: C.cardAlt,  c: C.t1 },
                        { l: "Ideal",     v: h.idealWeight.toFixed(1) + "%",    sub: "$" + (h.idealWeight   / 100 * TV).toFixed(0), bg: C.greenBg,  c: C.greenD },
                        { l: "1M Target", v: "$" + h.targetPrice1M.toFixed(0),  sub: "vs $" + (portH ? portH.c : "—"),             bg: C.amberBg,  c: C.amberD },
                        { l: "Alpha",     v: String(h.alphaScore),              sub: "/ 100",                                       bg: C.purpleBg, c: C.purpleD },
                      ].map(function(x) {
                        return (
                          <div key={x.l} style={{ background: x.bg, borderRadius: 10, padding: "7px 8px" }}>
                            <div style={{ fontSize: 9, color: C.t3, marginBottom: 2 }}>{x.l}</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: x.c }}>{x.v}</div>
                            <div style={{ fontSize: 9, color: C.t3, marginTop: 1 }}>{x.sub}</div>
                          </div>
                        );
                      })}
                    </div>
                    {h.risks && h.risks.length > 0 && (
                      <div style={{ marginTop: 8, display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {h.risks.map(function(r, j) { return <span key={j} style={{ background: C.redBg, color: C.redD, fontSize: 10, padding: "2px 8px", borderRadius: 99 }}>⚠ {r}</span>; })}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {/* ════ ALLOCATION ════ */}
          {tab === "alloc" && (
            <div style={{ display: "grid", gap: 12 }}>
              <Card>
                <div style={{ fontSize: 10, color: C.accent, fontWeight: 700, letterSpacing: 1.5, marginBottom: 4 }}>IDEAL vs CURRENT ALLOCATION</div>
                <div style={{ fontSize: 12, color: C.t2, marginBottom: 12 }}>Total portfolio: <strong>{"$" + TV.toFixed(2)}</strong></div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
                  {(function() {
                    var hs     = signals.holdings || [];
                    var toBuy  = hs.filter(function(h) { return h.idealWeight - h.currentWeight > 0; }).reduce(function(s, h) { return s + (h.idealWeight - h.currentWeight) / 100 * TV; }, 0);
                    var toSell = hs.filter(function(h) { return h.currentWeight - h.idealWeight > 0; }).reduce(function(s, h) { return s + (h.currentWeight - h.idealWeight) / 100 * TV; }, 0);
                    var toHold = hs.filter(function(h) { return Math.abs(h.idealWeight - h.currentWeight) < 0.5; }).reduce(function(s, h) { return s + h.currentWeight / 100 * TV; }, 0);
                    return [
                      { l: "To Buy",  v: "$" + toBuy.toFixed(0),  c: C.greenD, bg: C.greenBg },
                      { l: "To Sell", v: "$" + toSell.toFixed(0), c: C.redD,   bg: C.redBg   },
                      { l: "To Hold", v: "$" + toHold.toFixed(0), c: C.blueD,  bg: C.blueBg  },
                    ].map(function(x) {
                      return (
                        <div key={x.l} style={{ background: x.bg, borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
                          <div style={{ fontSize: 10, color: C.t3, marginBottom: 2 }}>{x.l}</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: x.c }}>{x.v}</div>
                        </div>
                      );
                    });
                  })()}
                </div>
                <AllocChart holdings={signals.holdings} TV={TV} />
              </Card>
            </div>
          )}

          {/* ════ RISK ════ */}
          {tab === "risk" && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 8 }}>
                <Metric label="Risk Level"    value={signals.portfolioRisk} color={signals.portfolioRisk === "HIGH" || signals.portfolioRisk === "VERY_HIGH" ? C.red : C.amber} />
                <Metric label="VaR (95%,1M)"  value={(signals.varEstimate || 0).toFixed(1) + "%"} color={C.red} />
                <Metric label="Monthly Alpha" value={(signals.monthlyAlphaBps / 100).toFixed(2) + "%"} color={C.purple} />
                <Metric label="Annual (est.)" value={"~" + ((signals.monthlyAlphaBps / 100) * 12).toFixed(1) + "%"} color={C.green} />
              </div>
              <Card>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 10 }}>Kelly Criterion — Optimal Position Sizing</div>
                {signals.holdings && signals.holdings.slice().sort(function(a, b) { return b.kellyFraction - a.kellyFraction; }).map(function(h, i) {
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "0.5px solid " + C.surface }}>
                      <div style={{ fontSize: 12, fontWeight: 700, width: 42, color: C.t1 }}>{h.ticker}</div>
                      <div style={{ flex: 1, height: 5, background: C.surface, borderRadius: 99 }}>
                        <div style={{ width: clamp(h.kellyFraction * 100, 0, 100) + "%", height: "100%", background: C.accent, borderRadius: 99 }} />
                      </div>
                      <div style={{ fontSize: 11, color: C.t1, fontWeight: 600, minWidth: 34 }}>{(h.kellyFraction * 100).toFixed(1)}%</div>
                      <div style={{ fontSize: 10, color: C.t3, minWidth: 54, textAlign: "right" }}>{"$" + (TV * h.kellyFraction).toFixed(0)}</div>
                    </div>
                  );
                })}
                <div style={{ marginTop: 10, padding: "8px 10px", background: C.amberBg, borderRadius: 10, fontSize: 11, color: C.amberD }}>⚠ Apply 25-50% of Kelly for practical sizing. Full Kelly maximises growth but amplifies drawdowns.</div>
              </Card>
              <div style={{ background: C.header, borderRadius: 16, padding: 14 }}>
                <div style={{ fontSize: 10, color: C.accentL, fontWeight: 700, letterSpacing: 1.5, marginBottom: 10 }}>CONCENTRATION · CURRENT → IDEAL</div>
                {signals.holdings && signals.holdings.slice().sort(function(a, b) { return b.currentWeight - a.currentWeight; }).map(function(h, i) {
                  return (
                    <div key={i} style={{ padding: "5px 0", borderBottom: "0.5px solid #3D3530" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#E8E0D5" }}>{h.ticker}</span>
                        <span style={{ fontSize: 10, color: "#7A6E63" }}>
                          {h.currentWeight.toFixed(1)}% ({"$" + (h.currentWeight / 100 * TV).toFixed(0)})
                          {" → "}
                          <span style={{ color: C.accentL }}>{h.idealWeight.toFixed(1)}% ({"$" + (h.idealWeight / 100 * TV).toFixed(0)})</span>
                        </span>
                      </div>
                      <div style={{ height: 4, background: "#3D3530", borderRadius: 2, overflow: "hidden", position: "relative" }}>
                        <div style={{ position: "absolute", left: 0, top: 0, width: h.currentWeight + "%", height: "100%", background: h.currentWeight > 20 ? C.red : "#5A5048", borderRadius: 2 }} />
                        <div style={{ position: "absolute", left: 0, top: 0, width: h.idealWeight + "%",   height: "100%", background: C.accentL, opacity: 0.5, borderRadius: 2 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Deep Dive Sheet ── */}
      {selTicker && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(44,37,32,0.55)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(4px)" }}
          onClick={function(e) { if (e.target === e.currentTarget) { setSelTicker(null); } }}>
          <div style={{ background: C.card, borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 700, maxHeight: "90vh", overflow: "auto", padding: "18px 16px 36px" }}>
            <div style={{ width: 32, height: 4, borderRadius: 2, background: C.surface, margin: "0 auto 14px" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <span style={{ fontSize: 20, fontWeight: 700, color: C.t1 }}>{selTicker}</span>
                <span style={{ fontSize: 13, color: C.t3, fontWeight: 400, marginLeft: 8 }}>Deep Dive</span>
                {selH && <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>{selH.n + " · " + selH.q + " shares · avg $" + selH.a + " · value $" + selH.v.toFixed(2)}</div>}
              </div>
              <button onClick={function() { setSelTicker(null); }}
                style={{ background: C.cardAlt, border: "none", borderRadius: 10, padding: "7px 14px", cursor: "pointer", fontSize: 12, color: C.t2, fontWeight: 500 }}>
                Close ✕
              </button>
            </div>

            {selH && <PriceChart ticker={selTicker} currentPrice={selH.c} avgPrice={selH.a} />}

            {deepL && <Loader msg="Generating Claude quant analysis…" />}

            {!deepL && deep && deep.error && (
              <div style={{ color: C.red, padding: 12, background: C.redBg, borderRadius: 12, fontSize: 13 }}>{deep.error}</div>
            )}

            {!deepL && deep && !deep.error && (
              <div style={{ display: "grid", gap: 10 }}>
                {[
                  { l: "Technical Outlook",    k: "technical",   bg: C.purpleBg, tc: C.purpleD },
                  { l: "Fundamental Case",     k: "fundamental", bg: C.greenBg,  tc: C.greenD  },
                  { l: "Options Strategy",     k: "optionsPlay", bg: C.amberBg,  tc: C.amberD  },
                  { l: "Black-Litterman View", k: "blView",      bg: C.blueBg,   tc: C.blueD   },
                  { l: "Kelly Analysis",       k: "kelly",       bg: C.roseBg,   tc: C.roseD   },
                  { l: "Hedge Strategy",       k: "hedge",       bg: C.redBg,    tc: C.redD    },
                  { l: "Alpha Path",           k: "alphaPath",   bg: C.sageBg,   tc: C.greenD  },
                ].map(function(item) {
                  if (!deep[item.k]) { return null; }
                  return (
                    <div key={item.k} style={{ background: item.bg, borderRadius: 14, padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: item.tc, letterSpacing: 1.2, marginBottom: 4 }}>{item.l.toUpperCase()}</div>
                      <div style={{ fontSize: 13, color: C.t1, lineHeight: 1.65 }}>{deep[item.k]}</div>
                    </div>
                  );
                })}
                {deep.breakdown && (
                  <div style={{ background: C.cardAlt, borderRadius: 14, padding: "12px 14px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.t2, letterSpacing: 1.2, marginBottom: 8 }}>PILLAR BREAKDOWN</div>
                    {Object.keys(deep.breakdown).map(function(k) {
                      return (
                        <div key={k} style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 10, color: C.accent, fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>{k}</div>
                          <div style={{ fontSize: 12, color: C.t1, lineHeight: 1.55 }}>{deep.breakdown[k]}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ fontSize: 10, color: C.t3, textAlign: "center", marginTop: 16, lineHeight: 1.6 }}>
        For educational purposes only · Not financial advice · Past performance does not guarantee future results
      </div>
    </div>
  );
}
