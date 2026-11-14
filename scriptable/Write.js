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

const fm = FileManager.iCloud();
const dir = fm.documentsDirectory();
const path = name => fm.joinPath(dir, name);
const CACHE = path("hanzi-write"); // a folder, so these files do not show up as scripts
const LIB = fm.joinPath(CACHE, "hanzi-writer.min.js");
const WRITE = path(MODE === "path" ? "hanzi-write-path.json" : "hanzi-write.json");
const PATH_FILE = fm.joinPath(CACHE, "write-path.txt");

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

function pageHTML(w, lib, strokes, levelName) {
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
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
:root { --bg:#EEF7E8; --ink:#000000; --accent:#108652; --grey:#5F665F; --line:#D3E4CA; --card:#FFFFFF; --soft:#97DF67; --on:#FFFFFF; --bad:#C0392B; --ok:#108652; }
@media (prefers-color-scheme: dark) { :root { --bg:#0E1F16; --ink:#FFFFFF; --accent:#97DF67; --grey:#9DA39D; --line:#2F4A39; --card:#16291E; --soft:#108652; --on:#000000; --bad:#FF7A6B; --ok:#97DF67; } }
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
body { margin:0; padding:20px 20px 120px; background:var(--bg); color:var(--ink);
  font: 17px/1.45 -apple-system, "PingFang SC", sans-serif; -webkit-user-select:none; user-select:none; }
.top { display:flex; justify-content:space-between; align-items:center; color:var(--grey); font-size:14px; }
.lv { border:1px solid var(--line); border-radius:10px; padding:1px 8px; }
.word { margin-top:14px; display:flex; align-items:center; gap:12px; }
.pinyin { font-size:26px; color:var(--accent); font-weight:600; }
.play { border:1px solid var(--line); background:var(--card); color:var(--ink); border-radius:20px; padding:6px 14px; font-size:15px; }
.mean { color:var(--grey); font-size:18px; margin-top:2px; }
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
.bar { position:fixed; left:0; right:0; bottom:0; padding:12px 20px 30px; background:var(--bg); border-top:1px solid var(--line);
  display:flex; gap:10px; }
.bar button { flex:1; font-size:16px; padding:13px 6px; border-radius:14px; border:1px solid var(--line); background:var(--card); color:var(--ink); }
.bar button.main { background:var(--accent); color:var(--on); border-color:var(--accent); }
.bar button[disabled] { opacity:.4; }
</style></head><body>
<div class="head">
<div class="top"><span>Write</span>${levelName ? `<span class="lv">${esc(levelName)}</span>` : ""}</div>
<div class="word"><span class="pinyin">${esc(w.pinyin)}</span><button class="play" onclick="say(${esc(JSON.stringify(w.hanzi))})">Listen</button></div>
<div class="mean">${esc(meaning)}</div>
</div>
${body}
<div class="bar">
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

var WORD = ${forScript(w.hanzi)}, CHARS = ${forScript(chars)}, DATA = ${forScript(strokes)}, ROUNDS = ${ROUNDS};
// All characters of the word sit in one row. Each round you write the whole word:
// rounds 1-2 trace over the outline, the last round is from memory.
var ci = 0, round = 1, writers = [], finished = false, size = 0;
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
// After a stroke animation, put a box back as it was: drawn if written this round.
function restore(i) { if (finished || i < ci) writers[i].showCharacter(); else writers[i].hideCharacter(); }
// Tap a box that is not the one you are writing: play its stroke order.
var playing = {};
function tapPad(i) {
  if ((i === ci && !finished) || playing[i]) return;
  playing[i] = true;
  writers[i].animateCharacter({ onComplete: function () { playing[i] = false; restore(i); } });
}
function quizChar() {
  draw();
  note(round < ROUNDS ? "Write each stroke with your finger." : "Now without the outline.");
  writers[ci].quiz({
    showHintAfterMisses: 3,
    onMistake: function () { note("Not this stroke. Try again.", "bad"); },
    onCorrectStroke: function (d) { note(d.strokesRemaining ? d.strokesRemaining + (d.strokesRemaining === 1 ? " stroke left" : " strokes left") : ""); },
    onComplete: function () {
      note("Good!", "good");
      setTimeout(function () {
        if (ci < CHARS.length - 1) { ci++; quizChar(); return; }
        if (round < ROUNDS) { round++; ci = 0; build(); return; }
        finished = true; draw();
        writers.forEach(function (w) { w.showCharacter(); });
        note("Done! " + WORD, "good");
        act("done:" + WORD);
      }, 600);
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
  var showing = false;
  el("show").onclick = function () {
    if (finished || showing) return;
    showing = true;
    writers[ci].cancelQuiz();
    note("Watch the stroke order.");
    (function play(i) {
      if (i >= CHARS.length) { showing = false; quizChar(); return; }
      playing[i] = true;
      writers[i].animateCharacter({ onComplete: function () {
        playing[i] = false;
        if (i === ci) writers[i].hideCharacter(); else restore(i);
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
  async function pageFor(w) {
    const strokes = {};
    for (const c of hanOnly(w.hanzi)) { const d = await getStrokes(c); if (d) strokes[c] = d; }
    const tag = w.radical ? "Radical" : MODE === "path" || w.level === "one" ? "" : w.level === "mine" ? LEVEL_NAMES.mine : levelName;
    return pageHTML(w, lib, strokes, tag);
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
  saveState();
  const wv = new WebView();
  let busy = Promise.resolve();
  async function handle(a) {
    if (a.startsWith("done:")) {
      const h = a.slice(5);
      st.done[h] = (st.done[h] || 0) + 1;
      if (MODE === "path" && w !== single && pack.words[cur] && pack.words[cur].hanzi === h) st.pos = advance(cur);
      saveState();
    } else if (a === "next") {
      if (!pack.words.length) return;
      // After a single word, Next goes back to your place in the list.
      if (MODE === "path" && w !== single) { cur = st.pos === cur ? advance(cur) : st.pos; st.pos = cur; }
      w = pick();
      saveState();
      await wv.loadHTML(await pageFor(w));
    } else if (a.startsWith("speak:")) {
      Speech.speak(a.slice(6));
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
