// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-brown; icon-glyph: pen-nib;

// Write: practice writing Chinese characters with your finger.
// - MODE "path" (Write): the radicals and simple words of write-path.txt on GitHub,
//   in a random order. Each radical always comes with its 3 characters, then 1 or 2
//   other words. Radicals get a "Radical" tag. It remembers where you stopped.
// - MODE "random" (Write 2): words from your HSK levels, words not written yet first.
// - Each word: 3 rounds per character. Rounds 1-2: trace over a faint character.
//   Round 3: write it from memory on an empty grid.
// - A wrong stroke turns red. After 3 misses, the right stroke is shown.
// - Words come from the HSK lists that Hourly Words saved, and your own words.
// - This script only READS those lists. Its own progress is in hanzi-write.json,
//   so Hourly Words and Radicals are not changed by it.
// Stroke data: Hanzi Writer (MIT) and Make Me a Hanzi (Arphic Public License).
// The library and stroke data download the first time and are saved in the
// hanzi-write folder, so characters you wrote before also work offline.

const MODE = "path"; // "path" or "random" (see above)
const REPO = "https://raw.githubusercontent.com/penguin0x3/hanzi-widgets/main/";
const LIB_URL = "https://cdn.jsdelivr.net/npm/hanzi-writer@3.7.3/dist/hanzi-writer.min.js";
const DATA_URL = "https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/";
const LEVELS = ["hsk1-2", "hsk3", "hsk4", "hsk5"];
const LEVEL_NAMES = { "hsk1-2": "HSK 1-2", hsk3: "HSK 3", hsk4: "HSK 4", hsk5: "HSK 5", mine: "My words" };
const ROUNDS = 3; // rounds per character; the last round has no outline
const THEME_LABEL = { auto: "Auto", light: "Light", dark: "Dark" };

const fm = FileManager.iCloud();
const dir = fm.documentsDirectory();
const path = name => fm.joinPath(dir, name);
const CACHE = path("hanzi-write"); // a folder, so these files do not show up as scripts
const LIB = fm.joinPath(CACHE, "hanzi-writer.min.js");
const WRITE = path(MODE === "path" ? "hanzi-write-path.json" : "hanzi-write.json");
const PATH_FILE = fm.joinPath(CACHE, "write-path.txt");
const THEME_FILE = fm.joinPath(CACHE, "theme.txt"); // "auto", "light" or "dark"
const THEMES = ["auto", "light", "dark"];

// ---------- files (read only for shared files) ----------
async function readText(p) {
  if (!fm.fileExists(p)) return null;
  try { await fm.downloadFileFromiCloud(p); return fm.readString(p); } catch (e) { return null; }
}
async function readJSON(p, fallback) {
  const t = await readText(p);
  if (!t) return fallback;
  try { return JSON.parse(t); } catch (e) { return fallback; }
}
function save(p, text) { try { fm.writeString(p, text); } catch (e) {} }
async function download(url) {
  try {
    const r = new Request(url);
    r.timeoutInterval = 15;
    const t = await r.loadString();
    return r.response && r.response.statusCode && r.response.statusCode !== 200 ? null : t;
  } catch (e) { return null; }
}

async function getLevel(level) {
  const data = await readJSON(path(level + ".json"), null);
  if (data && Array.isArray(data.words)) return data.words;
  // Not saved yet: use it from GitHub for this run only (Hourly Words saves the lists).
  const t = await download(REPO + "data/" + level + ".json");
  try { const d = JSON.parse(t); return Array.isArray(d.words) ? d.words : null; } catch (e) { return null; }
}
async function myWords() {
  const t = await readText(path("mywords.txt"));
  if (!t) return [];
  return t.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#")).map(l => {
    const p = l.split(/\s*[|\t]\s*/);
    return { hanzi: p[0], pinyin: p[1] || "", short: p.slice(2).join(" / ") };
  }).filter(w => w.hanzi);
}
const hanOnly = s => Array.from(s || "").filter(c => /\p{Script=Han}/u.test(c));

// radicals.txt (the Radicals list, read only): radical -> its 3 example characters.
// RAD_INFO keeps each radical's pinyin and name. The saved copy in Scriptable, or
// GitHub when it is not there yet.
const RAD_INFO = {};
async function loadRadicals() {
  const t = (await readText(path("radicals.txt"))) || (await download(REPO + "scriptable/radicals.txt")) || "";
  const out = {};
  for (const l of t.split(/\r?\n/)) {
    const line = l.trim();
    if (!line || line.startsWith("#")) continue;
    const p = line.split(/\s*\|\s*/);
    if (!p[0]) continue;
    RAD_INFO[p[0]] = { hanzi: p[0], pinyin: p[1] || "", short: p[2] || "" };
    out[p[0]] = (p[4] || "").split(";").map(e => e.trim().split(/\s+/)).filter(e => e[0] && hanOnly(e[0]).length)
      .slice(0, 3).map(e => ({ hanzi: e[0], pinyin: e[1] || "", short: e.slice(2).join(" ") }));
  }
  return out;
}

// radical-chars.json: the 50 radicals, each with the HSK characters that have it
// (from Make Me a Hanzi). Saved next to the scripts, renewed every 30 days.
async function loadRadChars() {
  const p = path("radical-chars.json");
  let t = await readText(p);
  if (!t || (Date.now() - fm.modificationDate(p).getTime()) / 86400000 > 30) {
    const n = await download(REPO + "data/radical-chars.json");
    try { if (n && JSON.parse(n).radicals) { save(p, n); t = n; } } catch (e) {}
  }
  let rads = {};
  try { rads = JSON.parse(t || "{}").radicals || {}; } catch (e) {}
  const of = {};
  for (const r of Object.keys(rads)) for (const c of rads[r].chars || []) of[c[0]] = r;
  return { rads, of };
}

async function loadWords(levels) {
  const words = [], byHanzi = {};
  const add = (w, lv) => {
    if (!w || byHanzi[w.hanzi] || !hanOnly(w.hanzi).length) return;
    byHanzi[w.hanzi] = Object.assign({ level: lv }, w);
    words.push(byHanzi[w.hanzi]);
  };
  for (const lv of levels) for (const w of (await getLevel(lv)) || []) add(w, lv);
  for (const w of await myWords()) add(w, "mine");
  return { words, byHanzi };
}

// The path list: the newest copy from GitHub, or the saved copy when offline.
async function loadPath() {
  let t = await download(REPO + "scriptable/write-path.txt");
  if (t && t.includes("|")) {
    if (!fm.fileExists(CACHE)) fm.createDirectory(CACHE, true);
    save(PATH_FILE, t);
  } else t = await readText(PATH_FILE);
  // A radical line starts a group: the radical and the (up to 3) lines right after it.
  // A blank line ends the group. Every other line is a loose word.
  const words = [], byHanzi = {}, groups = [], loose = [];
  let group = null;
  for (const l of (t || "").split(/\r?\n/)) {
    const line = l.trim();
    if (!line) { group = null; continue; }
    if (line.startsWith("#")) continue;
    const p = line.split(/\s*\|\s*/);
    if (!p[0] || !hanOnly(p[0]).length || byHanzi[p[0]]) continue;
    // "| radical" at the end marks a radical: Write shows a "Radical" tag on it.
    const radical = p.length > 3 && p[p.length - 1].toLowerCase() === "radical";
    if (radical) p.pop();
    byHanzi[p[0]] = { hanzi: p[0], pinyin: p[1] || "", short: p.slice(2).join(" | "), level: "path", radical };
    words.push(byHanzi[p[0]]);
    if (radical) { group = [p[0]]; groups.push(group); }
    else if (group && group.length < 4) group.push(p[0]);
    else { group = null; loose.push(p[0]); }
  }
  return { words, byHanzi, groups, loose };
}

// Random order for Write: each radical comes with its 3 characters, then 1 or 2
// loose words, then another radical. Groups and words are shuffled.
function mixOrder(pack) {
  const groups = shuffle(pack.groups.map(g => g.slice())), loose = shuffle(pack.loose.slice()), out = [];
  if (!groups.length) return loose;
  groups.forEach((g, i) => {
    out.push(...g);
    const left = loose.length, gaps = groups.length - i;
    const k = left >= 2 * gaps ? Math.ceil(left / gaps) : left > gaps ? 1 + Math.floor(Math.random() * 2) : Math.min(1, left);
    out.push(...loose.splice(0, k));
  });
  return out;
}

// ---------- picking words ----------
// Words you have not written yet come first, in a random order. When all are
// written, every word comes back in a new random order.
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function nextWord(st, pack) {
  for (let tries = 0; tries < 2; tries++) {
    while (st.deck.length) {
      const h = st.deck.pop();
      if (pack.byHanzi[h]) return pack.byHanzi[h];
    }
    const fresh = pack.words.filter(w => !st.done[w.hanzi]).map(w => w.hanzi);
    st.deck = shuffle(fresh.length ? fresh : pack.words.map(w => w.hanzi));
  }
  return pack.words[0];
}

// ---------- stroke data ----------
async function getLib() {
  let t = await readText(LIB);
  if (t && t.includes("HanziWriter")) return t;
  t = await download(LIB_URL);
  if (!t || !t.includes("HanziWriter")) return null;
  if (!fm.fileExists(CACHE)) fm.createDirectory(CACHE, true);
  save(LIB, t);
  return t;
}
async function getStrokes(c) {
  const p = fm.joinPath(CACHE, "c" + c.codePointAt(0).toString(16) + ".json");
  let t = await readText(p);
  if (!t || !t.includes("strokes")) {
    t = await download(DATA_URL + encodeURIComponent(c) + ".json");
    if (!t || !t.includes("strokes")) return null;
    if (!fm.fileExists(CACHE)) fm.createDirectory(CACHE, true);
    save(p, t);
  }
  try { return JSON.parse(t); } catch (e) { return null; }
}

// ---------- page ----------
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const forScript = v => JSON.stringify(v).replace(/</g, "\\u003c");

// radicals: the radicals of the characters, each with its characters for the info
// sheet ([] = none in the data, null = no row, because the word is a radical itself).
// self: the sheet of the word when it is a radical (the "All" chip after its examples).
function pageHTML(w, lib, strokes, levelName, canBack, theme, examples, radicals, self) {
  const sheets = radicals || (self ? [self] : []);
  const chars = hanOnly(w.hanzi).filter(c => strokes[c]);
  const meaning = w.short || (w.senses || [])[0] || "";
  const body = chars.length ? `
<div class="main">
<div class="round"><span class="label" id="roundLabel"></span><div class="dots" id="dots"></div></div>
<div class="pads" id="pads"></div>
<div class="msg" id="msg"></div>
<div class="tip" id="tip">Turn your phone sideways for bigger boxes.</div>
</div>` : `
<div class="main"><div class="msg">Could not load the strokes for ${esc(w.hanzi)}. Check your internet and try again. A few rare characters have no stroke data.</div></div>`;
  return `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
:root { --bg:#EEF7E8; --ink:#000000; --accent:#108652; --grey:#5F665F; --line:#D3E4CA; --card:#FFFFFF; --soft:#97DF67; --on:#FFFFFF; --bad:#C0392B; --ok:#108652; }
@media (prefers-color-scheme: dark) { :root[data-theme="auto"] { --bg:#0E1F16; --ink:#FFFFFF; --accent:#97DF67; --grey:#9DA39D; --line:#2F4A39; --card:#16291E; --soft:#108652; --on:#000000; --bad:#FF7A6B; --ok:#97DF67; } }
:root[data-theme="dark"] { --bg:#0E1F16; --ink:#FFFFFF; --accent:#97DF67; --grey:#9DA39D; --line:#2F4A39; --card:#16291E; --soft:#108652; --on:#000000; --bad:#FF7A6B; --ok:#97DF67; }
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
body { margin:0; padding:20px 20px 120px; background:var(--bg); color:var(--ink);
  font: 17px/1.45 -apple-system, "PingFang SC", sans-serif; -webkit-user-select:none; user-select:none; }
.top { display:flex; justify-content:space-between; align-items:center; color:var(--grey); font-size:14px; }
.lv { border:1px solid var(--line); border-radius:10px; padding:1px 8px; }
.right { display:flex; gap:8px; align-items:center; }
.theme { border:1px solid var(--line); background:var(--card); color:var(--ink); border-radius:10px; padding:2px 10px; font-size:13px; }
.word { margin-top:14px; display:flex; align-items:center; gap:12px; }
.pinyin { font-size:26px; color:var(--accent); font-weight:600; }
.play { border:1px solid var(--line); background:var(--card); color:var(--ink); border-radius:20px; padding:6px 14px; font-size:15px; }
.mean { color:var(--grey); font-size:18px; margin-top:2px; }
.ex { margin-top:10px; display:flex; flex-wrap:wrap; align-items:center; gap:6px; color:var(--grey); font-size:14px; }
.ex span { margin-right:2px; }
.chip { border:1px solid var(--line); background:var(--card); color:var(--ink); border-radius:16px; padding:3px 10px; font-size:17px; font-family:inherit; }
.chip small { font-size:13px; color:var(--accent); }
.chip.none { color:var(--grey); border-style:dashed; }
.toast { position:fixed; left:50%; bottom:110px; transform:translateX(-50%); background:var(--ink); color:var(--bg);
  padding:8px 14px; border-radius:12px; font-size:14px; opacity:0; pointer-events:none; transition:opacity .2s; white-space:nowrap; }
.toast.on { opacity:.92; }
/* Explore: a dictionary page in a frame over the writing page, so the writing stays as it is */
.xf { position:fixed; inset:0; width:100%; height:100%; border:0; z-index:50; background:var(--bg); }
.chip.more { font-size:14px; color:var(--accent); }
/* Radical info sheet */
.sheetbox { position:fixed; inset:0; z-index:30; background:rgba(0,0,0,.3); display:none; align-items:flex-end; }
.sheetbox.on { display:flex; }
.sheet { position:relative; width:100%; background:var(--card); border-top:1px solid var(--line); border-radius:18px 18px 0 0; padding:18px 20px 34px; max-height:75vh; overflow:auto; }
.sheet .x { position:absolute; top:10px; right:14px; width:36px; height:36px; border:none; background:none; color:var(--grey); font-size:28px; line-height:1; }
.sheet .rh { display:flex; align-items:baseline; gap:12px; }
.sheet .rc { font-size:48px; font-weight:600; line-height:1.1; }
.sheet .rp { color:var(--accent); font-weight:600; font-size:20px; }
.sheet .rn { color:var(--grey); font-size:17px; }
.sheet h3 { font-size:13px; letter-spacing:1px; text-transform:uppercase; color:var(--grey); margin:18px 0 6px; font-weight:600; }
.sheet .lvl { font-size:13px; color:var(--grey); margin:10px 0 4px; }
.sheet .cs { display:flex; flex-wrap:wrap; gap:6px; }
.sheet .cs button { border:1px solid var(--line); background:var(--bg); color:var(--ink); border-radius:12px; padding:4px 10px; font-family:inherit; text-align:center; min-width:62px; }
.sheet .cs b { display:block; font-size:22px; font-weight:600; }
.sheet .cs small { display:block; font-size:12px; color:var(--accent); }
.sheet .cs i { display:block; font-size:11px; font-style:normal; color:var(--grey); max-width:90px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sheet .wbtn { margin-top:18px; width:100%; font-size:16px; padding:12px; border-radius:14px; border:1px solid var(--line); background:var(--bg); color:var(--ink); }
.round { margin-top:18px; display:flex; align-items:center; justify-content:space-between; }
.dots { display:flex; gap:6px; } .dot { width:28px; height:6px; border-radius:3px; background:var(--line); }
.dot.on { background:var(--ink); } .dot.ok { background:var(--soft); }
.label { font-size:13px; letter-spacing:1px; text-transform:uppercase; color:var(--grey); font-weight:600; }
.pads { margin-top:10px; display:flex; justify-content:center; gap:8px; }
.pad { flex:none; background:var(--card); border:1px solid var(--line); border-radius:14px; position:relative; touch-action:none; }
.pad.on { border:2px solid var(--ink); }
.pad svg.grid { position:absolute; inset:0; width:100%; height:100%; }
.pad .tg { position:absolute; inset:0; }
.tip { display:none; text-align:center; font-size:14px; color:var(--grey); margin-top:4px; }
/* Sideways: word on the left, writing boxes on the right */
@media (orientation: landscape) {
  body { padding:12px 24px 80px; display:grid; grid-template-columns:200px 1fr; column-gap:20px; align-items:start; }
  .head { grid-column:1; } .main { grid-column:2; }
  .round { margin-top:0; }
  .bar { padding:8px 24px 12px; }
}
.msg { text-align:center; min-height:24px; margin-top:12px; color:var(--grey); }
.msg.bad { color:var(--bad); } .msg.good { color:var(--ok); font-weight:600; }
.bar { position:fixed; left:0; right:0; bottom:0; padding:12px 16px 30px; background:var(--bg); border-top:1px solid var(--line);
  display:flex; gap:8px; }
.bar button { flex:1; font-size:15px; padding:13px 4px; border-radius:14px; border:1px solid var(--line); background:var(--card); color:var(--ink); }
.bar button.main { background:var(--accent); color:var(--on); border-color:var(--accent); }
.bar button[disabled] { opacity:.4; }
</style></head><body>
<div class="head">
<div class="top"><span>Write</span><span class="right">${levelName ? `<span class="lv">${esc(levelName)}</span>` : ""}<button class="theme" id="theme" onclick="nextTheme()">${THEME_LABEL[theme]}</button></span></div>
<div class="word"><span class="pinyin">${esc(w.pinyin)}</span><button class="play" onclick="say(${esc(JSON.stringify(w.hanzi))})">Listen</button><button class="play" id="explore" onclick="act(${esc(JSON.stringify("explore:" + w.hanzi))})">Explore</button></div>
<div class="mean">${esc(meaning)}</div>
${(examples || []).length ? `<div class="ex"><span>Examples:</span>${examples.map(e => `<button class="chip" onclick="act(${esc(JSON.stringify("word:" + e.hanzi))})">${esc(e.hanzi)}${e.pinyin ? ` <small>${esc(e.pinyin)}</small>` : ""}</button>`).join("")}${self && self.chars.length > examples.length ? `<button class="chip more" onclick="openRad(0)">All ${self.chars.length}</button>` : ""}</div>` : ""}
${radicals ? `<div class="ex rads"><span>Radical:</span>${radicals.length ? radicals.map((r, i) => `<button class="chip" onclick="openRad(${i})">${esc(r.hanzi)}${r.pinyin ? ` <small>${esc(r.pinyin)}</small>` : ""}${r.short ? ` ${esc(r.short)}` : ""}</button>`).join("") : `<button class="chip none" onclick="toast('This word has no radical data yet.')">?</button>`}</div>` : ""}
</div>
<div class="toast" id="toast"></div>
<div class="sheetbox" id="radbox" onclick="if (event.target === this) closeRad()"><div class="sheet" id="radsheet"></div></div>
${body}
<div class="bar">
  <button id="back" onclick="act('back')" ${canBack ? "" : "disabled"}>Back</button>
  <button id="hint" ${chars.length ? "" : "disabled"}>Hint</button>
  <button id="show" ${chars.length ? "" : "disabled"}>Show strokes</button>
  <button id="next" class="main" onclick="act('next')">Next word</button>
</div>
<script>${lib.replace(/<\/script/gi, "<\\/script")}</script>
<script>
var SILENT = "data:audio/wav;base64,UklGRsQPAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YaAPAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";
var keepAwake = null, warm = false, lastSay = 0;
function zhVoice() {
  var vs = speechSynthesis.getVoices() || [];
  for (var i = 0; i < vs.length; i++) if (/^zh[-_]CN/i.test(vs[i].lang)) return vs[i];
  for (var j = 0; j < vs.length; j++) if (/^zh/i.test(vs[j].lang)) return vs[j];
  return null;
}
function warmUp() {
  if (warm) return; warm = true;
  try { keepAwake = new Audio(SILENT); keepAwake.loop = true; keepAwake.play().catch(function () {}); } catch (e) {}
  try {
    var u = new SpeechSynthesisUtterance(" "); u.volume = 0; u.lang = "zh-CN";
    var v = zhVoice(); if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch (e) {}
}
document.addEventListener("touchstart", warmUp, { passive: true, capture: true });
function voice(t) {
  warmUp();
  if (keepAwake && keepAwake.paused) keepAwake.play().catch(function () {});
  if (!window.speechSynthesis) { act("speak:" + t); return; }
  if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
  var u = new SpeechSynthesisUtterance(t);
  u.lang = "zh-CN"; u.rate = 0.85;
  var v = zhVoice(); if (v) u.voice = v;
  speechSynthesis.speak(u);
}
function say(t) { var now = Date.now(); if (now - lastSay < 400) return; lastSay = now; voice(t); }
function act(a) { location.href = "hanzi://" + encodeURIComponent(a); }
// Explore pages open in frames on top of the writing page. Back closes the top one,
// so after the last Back you are where you were: same round, same strokes.
var xframes = [];
function openExplore(html) {
  var f = document.createElement("iframe"); f.className = "xf"; f.srcdoc = html;
  document.body.appendChild(f); xframes.push(f);
}
function closeExplore() { var f = xframes.pop(); if (f) f.remove(); }
// The dictionary card belongs to the Explore page on top.
function showCard(d) { var f = xframes[xframes.length - 1]; if (f && f.contentWindow && f.contentWindow.showCard) f.contentWindow.showCard(d); }
// Radical info sheet: the radical, its name, and the HSK characters with it.
// Tap a character to write it; "Write" writes the radical itself.
var SHEETS = ${forScript(sheets.map(r => ({ hanzi: r.hanzi, pinyin: r.pinyin, name: r.short, chars: r.chars, own: !radicals })))}, LVN = ${forScript(LEVEL_NAMES)};
function openRad(i) {
  var r = SHEETS[i]; if (!r) return;
  var s = el("radsheet"); s.innerHTML = "";
  function add(parent, tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; parent.appendChild(n); return n; }
  var x = add(s, "button", "x", "×"); x.setAttribute("aria-label", "Close"); x.onclick = closeRad;
  var h = add(s, "div", "rh"); add(h, "span", "rc", r.hanzi); add(h, "span", "rp", r.pinyin); add(h, "span", "rn", r.name);
  add(s, "h3", "", "Characters with " + r.hanzi + " (" + r.chars.length + ")");
  var last = null, box = null;
  r.chars.forEach(function (c) {
    if (c[3] !== last || !box) { last = c[3]; if (LVN[c[3]]) add(s, "div", "lvl", LVN[c[3]]); box = add(s, "div", "cs"); }
    var b = add(box, "button"); add(b, "b", "", c[0]); add(b, "small", "", c[1]); add(b, "i", "", c[2]);
    b.onclick = function () { closeRad(); act("char:" + c[0]); };
  });
  if (!r.own) { var wb = add(s, "button", "wbtn", "Write " + r.hanzi); wb.onclick = function () { closeRad(); act("rad:" + r.hanzi); }; }
  el("radbox").classList.add("on"); s.scrollTop = 0;
}
function closeRad() { el("radbox").classList.remove("on"); }
var toastTimer = null;
function toast(t) {
  var b = document.getElementById("toast");
  b.textContent = t; b.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { b.classList.remove("on"); }, 2000);
}
// Theme button: Auto (follows the iPhone) -> Light -> Dark. The colors change at once,
// the writing goes on, and Write remembers the choice.
var THEMES = ${forScript(THEMES)}, LABELS = ${forScript(THEME_LABEL)};
function nextTheme() {
  var root = document.documentElement;
  var t = THEMES[(THEMES.indexOf(root.getAttribute("data-theme")) + 1) % THEMES.length];
  root.setAttribute("data-theme", t);
  el("theme").textContent = LABELS[t];
  if (typeof recolor === "function") recolor();
  act("theme:" + t);
}

var WORD = ${forScript(w.hanzi)}, CHARS = ${forScript(chars)}, DATA = ${forScript(strokes)}, ROUNDS = ${ROUNDS};
// All characters of the word sit in one row. Each round you write the whole word:
// rounds 1-2 trace over the outline, the last round is from memory.
var ci = 0, round = 1, writers = [], finished = false, size = 0;
var showing = false, showRun = 0, afterShow = null, charDone = false; // Show strokes is playing; showRun stops an old run after the boxes are made again
var GRID = '<svg class="grid" viewBox="0 0 100 100" preserveAspectRatio="none"><g stroke="var(--line)" stroke-width="0.5" stroke-dasharray="2,2" fill="none">' +
  '<line x1="0" y1="0" x2="100" y2="100"/><line x1="100" y1="0" x2="0" y2="100"/><line x1="50" y1="0" x2="50" y2="100"/><line x1="0" y1="50" x2="100" y2="50"/></g></svg>';
function el(id) { return document.getElementById(id); }
function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function note(text, kind) { var m = el("msg"); if (m) { m.className = "msg" + (kind ? " " + kind : ""); m.textContent = text; } }
// Box size: one character keeps the big box; longer words share the width.
// It also fits the height, so sideways the boxes grow and the page does not scroll.
function padSize() {
  var n = CHARS.length, gap = 8, w = el("pads").clientWidth || 340;
  var byWidth = Math.floor((w - gap * (n - 1)) / n);
  var byHeight = Math.floor(window.innerHeight - el("pads").getBoundingClientRect().top - 150);
  return Math.max(80, Math.min(340, byWidth, Math.max(110, byHeight)));
}
function draw() {
  var dots = "";
  for (var r = 1; r <= ROUNDS; r++) dots += '<div class="dot ' + (finished || r < round ? "ok" : r === round ? "on" : "") + '"></div>';
  el("dots").innerHTML = dots;
  el("roundLabel").textContent = finished ? "Done" : "Round " + round + " of " + ROUNDS + " · " + (round < ROUNDS ? "Trace" : "From memory");
  for (var i = 0; i < CHARS.length; i++) el("p" + i).className = "pad" + (!finished && i === ci ? " on" : "");
  el("tip").style.display = CHARS.length >= 3 && !finished && window.innerHeight > window.innerWidth ? "block" : "none";
}
// Make the boxes for this round. Characters already written in this round stay drawn.
function build() {
  showing = false; showRun++; afterShow = null;
  size = padSize();
  el("pads").innerHTML = CHARS.map(function (c, i) {
    return '<div class="pad" id="p' + i + '" style="width:' + size + 'px;height:' + size + 'px">' + GRID + '<div class="tg" id="t' + i + '"></div></div>';
  }).join("");
  writers = CHARS.map(function (c, i) {
    return HanziWriter.create("t" + i, c, {
      width: size, height: size, padding: Math.round(size * 0.06),
      showCharacter: finished || i < ci, showOutline: round < ROUNDS && !finished,
      strokeColor: css("--ink"), outlineColor: css("--line"), highlightColor: css("--soft"), drawingColor: css("--ink"),
      drawingWidth: Math.max(10, Math.round(size * 0.065)), strokeAnimationSpeed: 1.2, delayBetweenStrokes: 200,
      charDataLoader: function (ch, onLoad, onError) { if (DATA[ch]) onLoad(DATA[ch]); else onError(); }
    });
  });
  CHARS.forEach(function (c, i) { el("p" + i).onclick = function () { tapPad(i); }; });
  draw();
  if (!finished) quizChar();
}
// New theme: make the boxes again with the new colors. Characters already written stay;
// the character you are writing starts again from its first stroke.
function recolor() {
  writers.forEach(function (w) { try { w.cancelQuiz(); } catch (e) {} });
  build();
}
// After a stroke animation, put a box back as it was: drawn if written this round.
function restore(i) { if (finished || i < ci || (i === ci && charDone)) writers[i].showCharacter(); else writers[i].hideCharacter(); }
// Tap a box that is not the one you are writing: play its stroke order.
var playing = {};
function tapPad(i) {
  if ((i === ci && !finished) || playing[i]) return;
  playing[i] = true;
  writers[i].animateCharacter({ onComplete: function () { playing[i] = false; restore(i); } });
}
function quizChar() {
  charDone = false;
  draw();
  note(round < ROUNDS ? "Write each stroke with your finger." : "Now without the outline.");
  writers[ci].quiz({
    showHintAfterMisses: 3,
    onMistake: function () { note("Not this stroke. Try again.", "bad"); },
    onCorrectStroke: function (d) { note(d.strokesRemaining ? d.strokesRemaining + (d.strokesRemaining === 1 ? " stroke left" : " strokes left") : ""); },
    onComplete: function () {
      charDone = true;
      note("Good!", "good");
      var run = showRun;
      setTimeout(function () {
        if (run !== showRun) return; // the boxes were made again (new theme or turned phone)
        // If Show strokes is playing, go on when it ends.
        if (showing) { afterShow = goOn; return; }
        goOn();
      }, 600);
      function goOn() {
        if (ci < CHARS.length - 1) { ci++; quizChar(); return; }
        if (round < ROUNDS) { round++; ci = 0; build(); return; }
        finished = true; draw();
        writers.forEach(function (w) { w.showCharacter(); });
        note("Done! " + WORD, "good");
        act("done:" + WORD);
      }
    }
  });
}
if (CHARS.length) {
  // Hint: in the last round, show the outline for 3 seconds. You can keep writing.
  var hintTimer = null;
  el("hint").onclick = function () {
    if (finished) return;
    if (round < ROUNDS) { note("The outline is already shown. Follow it stroke by stroke."); return; }
    var w = writers[ci];
    w.showOutline();
    note("Outline shown for 3 seconds.");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { w.hideOutline(); }, 3000);
  };
  // Show strokes: play the stroke order of the whole word, box by box, then go on writing.
  // It works in every round, also after the word is done.
  el("show").onclick = function () {
    if (showing) return;
    showing = true;
    var run = showRun;
    if (!finished && !charDone) { try { writers[ci].cancelQuiz(); } catch (e) {} }
    clearTimeout(hintTimer);
    note("Watch the stroke order.");
    (function play(i) {
      if (run !== showRun) return; // the boxes were made again: this run is over
      if (i >= CHARS.length) {
        showing = false;
        var go = afterShow; afterShow = null;
        if (go) go(); else if (finished) note("Done! " + WORD, "good"); else quizChar();
        return;
      }
      playing[i] = true;
      writers[i].animateCharacter({ onComplete: function () {
        playing[i] = false;
        if (run !== showRun) return;
        restore(i);
        setTimeout(function () { play(i + 1); }, 250);
      } });
    })(0);
  };
  // Turning the phone: make the boxes again at the new size and start the current character again.
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (padSize() === size) { draw(); return; }
      writers.forEach(function (w) { try { w.cancelQuiz(); } catch (e) {} });
      build();
    }, 250);
  });
  build();
}
</script>
</body></html>`;
}

// ---------- tap a character: dictionary card ----------
// The same block is in Hourly Words, Radicals and Write. Words come from CC-CEDICT in dict.txt
// (the file Add Word uses, about 7 MB). It downloads the first time you tap a character.
const DICT_URL = "https://raw.githubusercontent.com/penguin0x3/hanzi-widgets/main/data/dict.txt";
let dictText = null;
async function getDict() {
  if (dictText) return dictText;
  const fd = FileManager.iCloud(), p = fd.joinPath(fd.documentsDirectory(), "dict.txt");
  try { if (fd.fileExists(p)) { await fd.downloadFileFromiCloud(p); dictText = fd.readString(p); } } catch (e) {}
  if (!dictText || dictText.length < 100000) {
    try {
      const r = new Request(DICT_URL);
      r.timeoutInterval = 60;
      const t = await r.loadString();
      if (t && t.length > 100000) { fd.writeString(p, t); dictText = t; }
    } catch (e) {}
  }
  return dictText && dictText.length > 100000 ? dictText : "";
}
// Every "word<TAB>pinyin<TAB>meanings" line for a word (some words have 2 or 3 readings).
function dictEntries(dict, word) {
  const out = [];
  let i = dict.startsWith(word + "\t") ? 0 : dict.indexOf("\n" + word + "\t");
  while (i >= 0 && out.length < 3) {
    const start = dict[i] === "\n" ? i + 1 : i;
    const end = dict.indexOf("\n", start);
    const p = dict.slice(start, end < 0 ? undefined : end).split("\t");
    out.push({ pinyin: p[1] || "", meaning: p[2] || "" });
    i = end < 0 ? -1 : dict.indexOf("\n" + word + "\t", end);
  }
  return out;
}
// The longest dictionary word that starts at the tapped character (up to 6 characters).
async function lookUp(text) {
  const chars = Array.from(text).slice(0, 6);
  const dict = await getDict();
  if (!dict) return { word: chars[0] || "", len: 1, entries: [], note: "The dictionary needs the internet the first time. Connect and tap again." };
  for (let n = chars.length; n >= 1; n--) {
    const word = chars.slice(0, n).join("");
    const entries = dictEntries(dict, word);
    if (entries.length) return { word, len: n, entries };
  }
  return { word: chars[0] || "", len: 1, entries: [], note: "Not in the dictionary." };
}
// The page sends "look:<id>:<characters from the tapped one>"; the card is filled in place.
async function showLook(wv, a) {
  const m = a.match(/^look:(\d+):(.*)$/);
  if (!m) return;
  const d = Object.assign({ id: Number(m[1]) }, await lookUp(m[2]));
  await wv.evaluateJavaScript("showCard(" + JSON.stringify(d).replace(/</g, "\\u003c") + ")", false);
}

// ---------- Explore: the full dictionary page for a word ----------
const LOOK_LEVELS = { "hsk1-2": "HSK 1-2", hsk3: "HSK 3", hsk4: "HSK 4", hsk5: "HSK 5", mine: "My words" };
const lookEsc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Short dictionary words that contain `word`: at most 4 characters, no names (they have capital pinyin).
function dictWordsWith(dict, word, skip, max) {
  const out = [];
  let i = dict.indexOf(word), steps = 0;
  while (i >= 0 && out.length < max && steps++ < 5000) {
    const start = dict.lastIndexOf("\n", i) + 1, nl = dict.indexOf("\n", i), end = nl < 0 ? dict.length : nl;
    const p = dict.slice(start, end).split("\t");
    if (p[0] !== word && p[0].includes(word) && Array.from(p[0]).length <= 4 && !skip.has(p[0]) && p[1] && p[1][0] === p[1][0].toLowerCase()) {
      out.push({ hanzi: p[0], pinyin: p[1], short: (p[2] || "").split(";")[0] });
      skip.add(p[0]);
    }
    i = dict.indexOf(word, end);
  }
  return out;
}
// radical-chars.json: the 50 radicals of radicals.txt, each with the HSK characters
// that have it (from Make Me a Hanzi). Saved next to the scripts, renewed every 30 days.
const RADS_URL = "https://raw.githubusercontent.com/penguin0x3/hanzi-widgets/main/data/radical-chars.json";
let radData = null;
async function getRadData() {
  if (radData) return radData;
  const fd = FileManager.iCloud(), p = fd.joinPath(fd.documentsDirectory(), "radical-chars.json");
  let t = null;
  try { if (fd.fileExists(p)) { await fd.downloadFileFromiCloud(p); t = fd.readString(p); } } catch (e) {}
  if (!t || (Date.now() - fd.modificationDate(p).getTime()) / 86400000 > 30) {
    try {
      const r = new Request(RADS_URL);
      r.timeoutInterval = 30;
      const n = await r.loadString();
      if (n && JSON.parse(n).radicals) { fd.writeString(p, n); t = n; }
    } catch (e) {}
  }
  let rads = {};
  try { rads = JSON.parse(t || "{}").radicals || {}; } catch (e) {}
  const of = {};
  for (const r of Object.keys(rads)) for (const c of rads[r].chars || []) of[c[0]] = r;
  return (radData = { rads, of });
}
// The radical part of Explore, only for the 50 radicals. A radical: its characters.
// One character: its radical and the other characters with it. A longer word: the
// radical of each character. null when no character has one of the 50.
async function radicalInfo(word) {
  const { rads, of } = await getRadData();
  const chars = Array.from(word).filter(c => /\p{Script=Han}/u.test(c));
  if (chars.length === 1) {
    const c = chars[0], r = rads[c] ? c : of[c];
    if (!r) return null;
    return { self: r === c, hanzi: r, pinyin: rads[r].pinyin, name: rads[r].name, chars: rads[r].chars.filter(e => e[0] !== c) };
  }
  const list = chars.filter(c => of[c] || rads[c]).map(c => { const r = rads[c] ? c : of[c]; return { char: c, hanzi: r, pinyin: rads[r].pinyin, name: rads[r].name }; });
  return list.length ? { list } : null;
}
// Characters with a radical, as small tiles grouped by level. Tap one for its card.
function radTiles(chars) {
  let out = "", last = null;
  for (const e of chars) {
    if (e[3] !== last) { out += (last === null ? "" : "</div>") + (LOOK_LEVELS[e[3]] ? `<div class="lvl">${LOOK_LEVELS[e[3]]}</div>` : "") + `<div class="tiles">`; last = e[3]; }
    out += `<span class="tile"><b data-look>${lookEsc(e[0])}</b><small>${lookEsc(e[1])}</small><i>${lookEsc(e[2])}</i></span>`;
  }
  return out ? out + "</div>" : "";
}
function radHTML(rad) {
  if (!rad) return "";
  const line = r => `<div class="wr"><b data-look>${lookEsc(r.hanzi)}</b> <span class="py">${lookEsc(r.pinyin)}</span> <span class="mn">${lookEsc(r.name)}</span></div>`;
  if (rad.list) return `<h2>Radicals</h2>${rad.list.map(r => `<div class="wr"><b data-look>${lookEsc(r.char)}</b> <span class="mn">→</span> <b data-look>${lookEsc(r.hanzi)}</b> <span class="py">${lookEsc(r.pinyin)}</span> <span class="mn">${lookEsc(r.name)}</span></div>`).join("")}`;
  if (rad.self) return `<h2>Radical</h2><div class="wr">This is a radical: <span class="mn">${lookEsc(rad.name)}</span> <span class="py">${lookEsc(rad.pinyin)}</span></div>${rad.chars.length ? `<h2>Characters with ${lookEsc(rad.hanzi)} (${rad.chars.length})</h2>${radTiles(rad.chars)}` : ""}`;
  return `<h2>Radical</h2>${line(rad)}${rad.chars.length ? `<h2>Other characters with ${lookEsc(rad.hanzi)} (${rad.chars.length})</h2>${radTiles(rad.chars)}` : ""}`;
}
function exploreHTML(word, words, dict, rad) {
  const entries = dict ? dictEntries(dict, word) : [];
  const own = words.find(w => w.hanzi === word);
  const pinyin = own ? own.pinyin : (entries[0] || {}).pinyin || (rad && rad.self ? rad.pinyin : "");
  const senses = own && own.senses && own.senses.length ? own.senses : entries.length ? entries[0].meaning.split(/;\s*/) : rad && rad.self ? [rad.name] : [];
  const seen = new Set([word]);
  const hsk = words.filter(w => w.hanzi.includes(word) && !/…/.test(w.hanzi) && !seen.has(w.hanzi) && seen.add(w.hanzi))
    .sort((a, b) => a.hanzi.length - b.hanzi.length).slice(0, 12);
  const more = dict ? dictWordsWith(dict, word, seen, 40).sort((a, b) => a.hanzi.length - b.hanzi.length).slice(0, 10) : [];
  const exs = [];
  for (const w of [own, ...hsk, ...words]) {
    if (exs.length >= 3) break;
    if (w && w.example && w.example.zh.includes(word) && !exs.some(e => e.zh === w.example.zh)) exs.push(w.example);
  }
  const row = w => `<div class="wr"><b data-look>${lookEsc(w.hanzi)}</b> <span class="py">${lookEsc(w.pinyin)}</span> <span class="mn">${lookEsc(w.short || (w.senses || [])[0] || "")}</span>${w.level && LOOK_LEVELS[w.level] ? ` <span class="tag">${LOOK_LEVELS[w.level]}</span>` : ""}</div>`;
  const listen = t => `<button class="play" onclick="say(${lookEsc(JSON.stringify(t))})">Listen</button>`;
  const write = `<button class="play" onclick="act(${lookEsc(JSON.stringify("write:" + JSON.stringify([word, pinyin, senses[0] || ""])))})">Write</button>`;
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
:root { --bg:#EEF7E8; --ink:#000000; --accent:#108652; --grey:#5F665F; --line:#D3E4CA; --card:#FFFFFF; --soft:#97DF67; --on:#FFFFFF; }
@media (prefers-color-scheme: dark) { :root { --bg:#0E1F16; --ink:#FFFFFF; --accent:#97DF67; --grey:#9DA39D; --line:#2F4A39; --card:#16291E; --soft:#108652; --on:#000000; } }
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
body { margin:0; padding:24px 20px 120px; background:var(--bg); color:var(--ink); font: 17px/1.45 -apple-system, "PingFang SC", sans-serif; }
.big { font-size:64px; font-weight:600; line-height:1.1; letter-spacing:2px; }
.row { display:flex; align-items:center; gap:12px; margin-top:6px; flex-wrap:wrap; }
.py { color:var(--accent); font-weight:600; } .row .py { font-size:24px; } .mn { color:var(--grey); }
.play { border:1px solid var(--line); background:var(--card); color:var(--ink); border-radius:20px; padding:6px 14px; font-size:15px; }
.tag { font-size:12px; color:var(--grey); border:1px solid var(--line); border-radius:10px; padding:0 7px; white-space:nowrap; }
h2 { font-size:13px; letter-spacing:1px; text-transform:uppercase; color:var(--grey); margin:26px 0 8px; font-weight:600; }
ol { margin:0; padding-left:24px; } li { margin:3px 0; }
.wr { padding:8px 0; border-bottom:1px solid var(--line); } .wr b { font-size:20px; font-weight:600; }
.ex { border-left:3px solid var(--accent); padding:4px 0 4px 14px; margin-bottom:12px; }
.ex .zh { font-size:20px; } .ex .py { font-size:15px; font-weight:500; }
.none { color:var(--grey); }
.lvl { font-size:13px; color:var(--grey); margin:10px 0 4px; }
.tiles { display:flex; flex-wrap:wrap; gap:6px; }
.tile { border:1px solid var(--line); background:var(--card); border-radius:12px; padding:4px 10px; text-align:center; min-width:62px; }
.tile b { display:block; font-size:22px; font-weight:600; } .tile small { display:block; font-size:12px; color:var(--accent); }
.tile i { display:block; font-size:11px; font-style:normal; color:var(--grey); max-width:90px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bar { position:fixed; left:0; right:0; bottom:0; padding:12px 20px 34px; background:var(--bg); border-top:1px solid var(--line); }
.bar button { width:100%; font-size:17px; padding:14px; border-radius:14px; border:1px solid var(--line); background:var(--card); color:var(--ink); }
/* Tap a character: dictionary card */
.c.hl { background:var(--soft); border-radius:4px; }
#look { position:fixed; inset:0; z-index:20; background:rgba(0,0,0,.25); display:flex; align-items:flex-end; }
#look .x { position:absolute; top:10px; right:14px; width:36px; height:36px; border:none; background:none; color:var(--grey); font-size:28px; line-height:1; }
#look .sheet { position:relative; width:100%; background:var(--card); border-top:1px solid var(--line); border-radius:18px 18px 0 0; padding:18px 20px 34px; max-height:70vh; overflow:auto; }
#look .w { font-size:40px; font-weight:600; line-height:1.1; }
#look .e { margin-top:10px; } #look .e .py { color:var(--accent); font-weight:600; font-size:18px; } #look .e .mn { color:var(--grey); }
#look .note { color:var(--grey); margin-top:10px; }
#look .btns { display:flex; gap:10px; margin-top:16px; }
#look .btns button { flex:1; font-size:16px; padding:12px; border-radius:14px; border:1px solid var(--line); background:var(--bg); color:var(--ink); }
</style></head><body>
<div class="big" data-look>${lookEsc(word)}</div>
<div class="row"><span class="py">${lookEsc(pinyin)}</span>${listen(word)} ${write}${own && LOOK_LEVELS[own.level] ? ` <span class="tag">${LOOK_LEVELS[own.level]}</span>` : ""}</div>
<h2>Meaning</h2>
${senses.length ? `<ol>${senses.map(s => `<li>${lookEsc(s)}</li>`).join("")}</ol>` : `<div class="none">Not in the dictionary.</div>`}
${radHTML(rad)}
${hsk.length ? `<h2>Words with ${lookEsc(word)} in your lists</h2>${hsk.map(row).join("")}` : ""}
${more.length ? `<h2>More words with ${lookEsc(word)}</h2>${more.map(row).join("")}` : ""}
${exs.length ? `<h2>Examples</h2>${exs.map(e => `<div class="ex"><div class="zh" data-look>${lookEsc(e.zh)}</div><div class="py">${lookEsc(e.pinyin)}</div><div class="mn">${lookEsc(e.en)}</div></div>`).join("")}` : ""}
<div class="bar"><button onclick="act('xback')">Back</button></div>
<script>
// Inside Write the page sits in a frame over the writing page: actions go through Write.
function act(a) { if (window.parent !== window && window.parent.act) { window.parent.act(a); return; } location.href = "hanzi://" + encodeURIComponent(a); }
function say(t) { act("speak:" + t); }
// Tap a Chinese character: a card with the dictionary word that starts there.
var HAN = /\\p{Script=Han}/u, lookId = 0, tapped = [];
function wrapHan(node) {
  Array.prototype.slice.call(node.childNodes).forEach(function (n) {
    if (n.nodeType === 1) { if (n.tagName !== "BUTTON") wrapHan(n); return; }
    if (n.nodeType !== 3 || !HAN.test(n.nodeValue)) return;
    var frag = document.createDocumentFragment();
    Array.from(n.nodeValue).forEach(function (ch) {
      if (HAN.test(ch)) { var s = document.createElement("span"); s.className = "c"; s.textContent = ch; frag.appendChild(s); }
      else frag.appendChild(document.createTextNode(ch));
    });
    n.parentNode.replaceChild(frag, n);
  });
}
document.querySelectorAll("[data-look]").forEach(wrapHan);
document.addEventListener("click", function (e) {
  var s = e.target.closest && e.target.closest(".c");
  if (!s) return;
  var run = [s], n = s.nextSibling;
  while (n && run.length < 6 && n.nodeType === 1 && n.classList.contains("c")) { run.push(n); n = n.nextSibling; }
  tapped = run;
  showCard({ id: ++lookId, word: s.textContent, len: 1, loading: true });
  act("look:" + lookId + ":" + run.map(function (x) { return x.textContent; }).join(""));
});
function hideCard() {
  var b = document.getElementById("look"); if (b) b.remove();
  document.querySelectorAll(".c.hl").forEach(function (x) { x.classList.remove("hl"); });
  tapped = []; lookId++;
}
function showCard(d) {
  if (d.id !== lookId) return; // an older tap
  document.querySelectorAll(".c.hl").forEach(function (x) { x.classList.remove("hl"); });
  for (var k = 0; k < d.len && k < tapped.length; k++) tapped[k].classList.add("hl");
  var box = document.getElementById("look");
  if (!box) {
    box = document.createElement("div"); box.id = "look";
    box.onclick = function (e) { if (e.target === box) hideCard(); };
    document.body.appendChild(box);
  }
  var sheet = document.createElement("div"); sheet.className = "sheet";
  var x = document.createElement("button"); x.className = "x"; x.textContent = "×"; x.setAttribute("aria-label", "Close"); x.onclick = hideCard; sheet.appendChild(x);
  var w = document.createElement("div"); w.className = "w"; w.textContent = d.word; sheet.appendChild(w);
  (d.entries || []).forEach(function (en) {
    var e = document.createElement("div"); e.className = "e";
    var py = document.createElement("div"); py.className = "py"; py.textContent = en.pinyin;
    var mn = document.createElement("div"); mn.className = "mn"; mn.textContent = en.meaning.split("/").join("; ");
    e.appendChild(py); e.appendChild(mn); sheet.appendChild(e);
  });
  if (d.loading || d.note) { var t = document.createElement("div"); t.className = "note"; t.textContent = d.loading ? "Looking up..." : d.note; sheet.appendChild(t); }
  var btns = document.createElement("div"); btns.className = "btns";
  function btn(label, f) { var b = document.createElement("button"); b.textContent = label; b.onclick = f; btns.appendChild(b); }
  var first = (d.entries || [])[0] || { pinyin: "", meaning: "" };
  btn("Listen", function () { say(d.word); });
  btn("Write", function () { act("write:" + JSON.stringify([d.word, first.pinyin, first.meaning.split(";")[0]])); });
  btn("Explore", function () { act("explore:" + d.word); });
  sheet.appendChild(btns);
  box.innerHTML = ""; box.appendChild(sheet);
}
</script></body></html>`;
}
// Explore pages are a trail: Back goes to the page before, the last Back to the main page.
const lookTrail = [];
let lookAt = null; // the word of the Explore page on screen, null on the main page
async function explorePage(word, words) { return exploreHTML(word, words, await getDict(), await radicalInfo(word)); }
async function exploreTo(wv, word, words) {
  if (!word) return;
  lookTrail.push(lookAt); lookAt = word;
  await wv.loadHTML(await explorePage(word, words));
}
async function exploreBack(wv, words, mainPage) {
  lookAt = lookTrail.length ? lookTrail.pop() : null;
  await wv.loadHTML(lookAt ? await explorePage(lookAt, words) : mainPage());
}

// ---------- run ----------
async function info(title, message) {
  const al = new Alert();
  al.title = title; al.message = message; al.addAction("OK");
  await al.present();
}

const settings = await readJSON(path("hanzi-settings.json"), {});
const levels = (settings.levels || []).filter(l => LEVELS.includes(l));
if (!levels.length) levels.push("hsk1-2");
const levelName = levels.map(l => LEVEL_NAMES[l]).join(", ");
const st = await readJSON(WRITE, {});
st.done = st.done || {};
st.deck = Array.isArray(st.deck) ? st.deck : [];
const saveState = () => save(WRITE, JSON.stringify(st));
let theme = String((await readText(THEME_FILE)) || "").trim();
if (!THEMES.includes(theme)) theme = "auto";

const pack = MODE === "path" ? await loadPath() : await loadWords(levels);
// Path: st.order is this round's random order. A new one is made when the round ends
// or the list on GitHub changes.
if (MODE === "path" && pack.words.length) {
  const same = Array.isArray(st.order) && st.order.length === pack.words.length && st.order.every(h => pack.byHanzi[h]) && new Set(st.order).size === st.order.length;
  if (!same) { st.order = mixOrder(pack); st.pos = 0; }
  delete st.at;
  pack.words = st.order.map(h => pack.byHanzi[h]);
}
// Opened with ?word=... (the Write button in Hourly Words or Radicals): practise
// that one word first. It does not move your place in the list.
const q = args.queryParameters || {};
const single = q.word && hanOnly(q.word).length
  ? pack.byHanzi[q.word] || { hanzi: q.word, pinyin: q.pinyin || "", short: q.meaning || "", level: "one" }
  : null;
const lib = pack.words.length || single ? await getLib() : null;
if (!pack.words.length && !single) {
  await info("Write", MODE === "path"
    ? "Write needs the internet the first time, to get the list. Connect and run Write again."
    : "No words yet. Connect to the internet and run Hourly Words once, then run Write again.");
} else if (!lib) {
  await info("Write", "Write needs the internet the first time, to get the stroke data. Connect and run Write again.");
} else {
  const rads = await loadRadicals();
  // The 3 example characters of a radical: its group in write-path.txt, else radicals.txt.
  function examplesFor(w) {
    const g = (pack.groups || []).find(g => g[0] === w.hanzi && g.length > 1);
    if (g) return g.slice(1).map(h => pack.byHanzi[h]);
    return rads[w.hanzi] || [];
  }
  const isRadical = w => !!(w.radical || rads[w.hanzi]);
  const rc = await loadRadChars();
  // A radical with its pinyin, name and characters (for the info sheet).
  function radEntry(r) {
    const info = RAD_INFO[r] || rc.rads[r] && { pinyin: rc.rads[r].pinyin, short: rc.rads[r].name } || pack.byHanzi[r] || {};
    const chars = rc.rads[r] ? rc.rads[r].chars : examplesFor({ hanzi: r }).map(e => [e.hanzi, e.pinyin, e.short, ""]);
    return { hanzi: r, pinyin: info.pinyin || "", short: info.short || "", chars };
  }
  // Which of the 50 radicals a character has: radical-chars.json, else its group in
  // write-path.txt, else the radicals.txt line that lists it. null when it is in none.
  function radicalOf(c) {
    if (rc.of[c]) return radEntry(rc.of[c]);
    const g = (pack.groups || []).find(g => g.slice(1).includes(c));
    if (g) return radEntry(g[0]);
    const r = Object.keys(rads).find(r => rads[r].some(e => e.hanzi === c));
    return r ? radEntry(r) : null;
  }
  // One entry per radical of the word's characters (no repeats).
  function radicalsFor(w) {
    const out = [];
    for (const c of hanOnly(w.hanzi)) {
      const r = radicalOf(c);
      if (r && !out.some(x => x.hanzi === r.hanzi)) out.push(r);
    }
    return out;
  }
  async function pageFor(w) {
    const strokes = {};
    for (const c of hanOnly(w.hanzi)) { const d = await getStrokes(c); if (d) strokes[c] = d; }
    const tag = isRadical(w) ? "Radical" : MODE === "path" || w.level === "one" ? "" : w.level === "mine" ? LEVEL_NAMES.mine : levelName;
    return pageHTML(w, lib, strokes, tag, at > 0, theme, isRadical(w) ? examplesFor(w) : [], isRadical(w) ? null : radicalsFor(w), isRadical(w) ? radEntry(w.hanzi) : null);
  }
  // Path: st.pos is the item to show next time. Finishing a word moves it on,
  // so closing Write after a word starts at the next one.
  const n = pack.words.length || 1;
  st.pos = Number.isInteger(st.pos) ? ((st.pos % n) + n) % n : 0;
  let cur = st.pos;
  // The item after i. After the last one, a new random round starts.
  const advance = i => {
    if (i + 1 < n) return i + 1;
    st.order = mixOrder(pack);
    pack.words = st.order.map(h => pack.byHanzi[h]);
    return 0;
  };
  const pick = () => MODE === "path" ? pack.words[cur] : nextWord(st, pack);
  let w = single || pick();
  // Words seen since Write opened, so Back can go to the one before.
  // at is the word on screen. Next after Back goes forward again before it picks a new word.
  const seen = [w];
  let at = 0;
  saveState();
  const wv = new WebView();
  let busy = Promise.resolve();
  // Words for Explore ("Words with X in your lists"): your HSK levels, also in Write (path).
  let xWords = null;
  async function exploreWords() {
    if (!xWords) xWords = MODE === "random" ? pack.words : (await loadWords(levels)).words;
    return xWords;
  }
  async function handle(a) {
    if (a.startsWith("done:")) {
      const h = a.slice(5);
      st.done[h] = (st.done[h] || 0) + 1;
      if (MODE === "path" && w !== single && pack.words[cur] && pack.words[cur].hanzi === h) st.pos = advance(cur);
      saveState();
    } else if (a === "next") {
      if (at < seen.length - 1) { w = seen[++at]; await wv.loadHTML(await pageFor(w)); return; }
      if (!pack.words.length) return;
      // After a single word or an example character, Next goes back to your place in the list.
      if (MODE === "path") {
        if (w !== single && !w.extra) { cur = st.pos === cur ? advance(cur) : st.pos; st.pos = cur; }
        else cur = st.pos;
      }
      w = pick();
      seen.push(w); at = seen.length - 1;
      saveState();
      await wv.loadHTML(await pageFor(w));
    } else if (a.startsWith("word:")) {
      // An example character of a radical: write it now. Back goes to the radical again.
      const h = a.slice(5);
      const e = examplesFor(w).find(x => x.hanzi === h);
      if (!e) return;
      w = Object.assign({ level: "one" }, pack.byHanzi[h] || e, { extra: true });
      seen.length = at + 1; seen.push(w); at = seen.length - 1;
      await wv.loadHTML(await pageFor(w));
    } else if (a.startsWith("rad:")) {
      // The radical of this character: write it now. Back comes back to the character.
      const r = radicalsFor(w).find(x => x.hanzi === a.slice(4));
      if (!r) return;
      w = Object.assign({ level: "one" }, pack.byHanzi[r.hanzi] || r, { extra: true, radical: true });
      seen.length = at + 1; seen.push(w); at = seen.length - 1;
      await wv.loadHTML(await pageFor(w));
    } else if (a.startsWith("char:")) {
      // A character from the radical sheet: write it now. Back comes back here.
      const h = a.slice(5);
      const lists = isRadical(w) ? [radEntry(w.hanzi)] : radicalsFor(w);
      let e = null;
      for (const r of lists) e = e || r.chars.find(c => c[0] === h);
      if (!e) return;
      w = Object.assign({ level: "one" }, pack.byHanzi[h] || { hanzi: e[0], pinyin: e[1], short: e[2] }, { extra: true });
      seen.length = at + 1; seen.push(w); at = seen.length - 1;
      await wv.loadHTML(await pageFor(w));
    } else if (a === "back") {
      if (at === 0) return;
      w = seen[--at];
      await wv.loadHTML(await pageFor(w));
    } else if (a.startsWith("theme:")) {
      const t = a.slice(6);
      if (THEMES.includes(t)) { theme = t; save(THEME_FILE, t); }
    } else if (a.startsWith("speak:")) {
      Speech.speak(a.slice(6));
    } else if (a.startsWith("explore:")) {
      const x = a.slice(8);
      if (!hanOnly(x).length) return;
      await wv.evaluateJavaScript("openExplore(" + forScript(await explorePage(x, await exploreWords())) + ")", false);
    } else if (a === "xback") {
      await wv.evaluateJavaScript("closeExplore()", false);
    } else if (a.startsWith("look:")) {
      await showLook(wv, a);
    } else if (a.startsWith("write:")) {
      // Write on the dictionary card or Explore page: write that word now. Back comes back here.
      let p = [];
      try { p = JSON.parse(a.slice(6)); } catch (e) { return; }
      const h = String(p[0] || "");
      if (!hanOnly(h).length) return;
      w = Object.assign({ level: "one" }, pack.byHanzi[h] || { hanzi: h, pinyin: p[1] || "", short: p[2] || "" }, { extra: true });
      seen.length = at + 1; seen.push(w); at = seen.length - 1;
      await wv.loadHTML(await pageFor(w));
    }
  }
  wv.shouldAllowRequest = req => {
    const u = String((req && req.url) || "");
    if (!u.startsWith("hanzi://")) return true;
    const a = decodeURIComponent(u.slice(8));
    busy = busy.then(() => handle(a)).catch(e => console.log("action failed: " + e));
    return false;
  };
  await wv.loadHTML(await pageFor(w));
  await wv.present(true);
  await busy;
}
Script.complete();
