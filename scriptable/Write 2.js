// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-brown; icon-glyph: pen-nib;

// Write: practice writing Chinese characters with your finger.
// - MODE "path" (Write): radicals first, then the simplest words, in the order of
//   write-path.txt on GitHub. It remembers where you stopped.
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

const MODE = "random"; // "path" or "random" (see above)
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
  const words = [], byHanzi = {};
  for (const l of (t || "").split(/\r?\n/)) {
    const line = l.trim();
    if (!line || line.startsWith("#")) continue;
    const p = line.split(/\s*\|\s*/);
    if (!p[0] || !hanOnly(p[0]).length || byHanzi[p[0]]) continue;
    byHanzi[p[0]] = { hanzi: p[0], pinyin: p[1] || "", short: p.slice(2).join(" | "), level: "path" };
    words.push(byHanzi[p[0]]);
  }
  return { words, byHanzi };
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
<div class="chars" id="chips"></div>
<div class="round"><span class="label" id="roundLabel"></span><div class="dots" id="dots"></div></div>
<div class="pad">
  <svg class="grid" viewBox="0 0 100 100" preserveAspectRatio="none">
    <g stroke="var(--line)" stroke-width="0.5" stroke-dasharray="2,2" fill="none">
      <line x1="0" y1="0" x2="100" y2="100"/><line x1="100" y1="0" x2="0" y2="100"/>
      <line x1="50" y1="0" x2="50" y2="100"/><line x1="0" y1="50" x2="100" y2="50"/>
    </g>
  </svg>
  <div id="target"></div>
</div>
<div class="msg" id="msg"></div>` : `
<div class="msg">No stroke data for this word yet. Write needs internet the first time it shows a character. Tap Next word.</div>`;
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
:root { --bg:#F5EFE3; --ink:#2B2118; --red:#A8392B; --grey:#6B5E50; --line:#E2D8C6; --card:#FBF7EF; --ok:#3F7D4E; }
@media (prefers-color-scheme: dark) { :root { --bg:#1E1A16; --ink:#F1E9DC; --red:#E07A5F; --grey:#B5A894; --line:#3A332B; --card:#28231E; --ok:#7FBF8E; } }
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
body { margin:0; padding:20px 20px 120px; background:var(--bg); color:var(--ink);
  font: 17px/1.45 -apple-system, "PingFang SC", sans-serif; -webkit-user-select:none; user-select:none; }
.top { display:flex; justify-content:space-between; align-items:center; color:var(--grey); font-size:14px; }
.lv { border:1px solid var(--line); border-radius:10px; padding:1px 8px; }
.word { margin-top:14px; display:flex; align-items:center; gap:12px; }
.pinyin { font-size:26px; color:var(--red); font-weight:600; }
.play { border:1px solid var(--line); background:var(--card); color:var(--ink); border-radius:20px; padding:6px 14px; font-size:15px; }
.mean { color:var(--grey); font-size:18px; margin-top:2px; }
.chars { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; }
.chip { min-width:44px; height:44px; border-radius:12px; border:1px solid var(--line); background:var(--card);
  display:flex; align-items:center; justify-content:center; font-size:22px; color:var(--grey); }
.chip.now { border:2px solid var(--ink); color:var(--ink); }
.chip.done { color:var(--ok); border-color:var(--ok); }
.round { margin-top:18px; display:flex; align-items:center; justify-content:space-between; }
.dots { display:flex; gap:6px; } .dot { width:28px; height:6px; border-radius:3px; background:var(--line); }
.dot.on { background:var(--ink); } .dot.ok { background:var(--ok); }
.label { font-size:13px; letter-spacing:1px; text-transform:uppercase; color:var(--grey); font-weight:600; }
.pad { margin:10px auto 0; width:100%; max-width:340px; aspect-ratio:1; background:var(--card); border:1px solid var(--line);
  border-radius:16px; position:relative; touch-action:none; }
.pad svg.grid { position:absolute; inset:0; width:100%; height:100%; }
#target { position:absolute; inset:0; }
.msg { text-align:center; min-height:24px; margin-top:12px; color:var(--grey); }
.msg.bad { color:var(--red); } .msg.good { color:var(--ok); font-weight:600; }
.bar { position:fixed; left:0; right:0; bottom:0; padding:12px 20px 30px; background:var(--bg); border-top:1px solid var(--line);
  display:flex; gap:10px; }
.bar button { flex:1; font-size:16px; padding:13px 6px; border-radius:14px; border:1px solid var(--line); background:var(--card); color:var(--ink); }
.bar button.main { background:var(--ink); color:var(--bg); border-color:var(--ink); }
.bar button[disabled] { opacity:.4; }
</style></head><body>
<div class="top"><span>Write</span>${levelName ? `<span class="lv">${esc(levelName)}</span>` : ""}</div>
<div class="word"><span class="pinyin">${esc(w.pinyin)}</span><button class="play" onclick="say(${esc(JSON.stringify(w.hanzi))})">Play</button></div>
<div class="mean">${esc(meaning)}</div>
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
var ci = 0, round = 1, writer = null, finished = false;
function el(id) { return document.getElementById(id); }
function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function note(text, kind) { var m = el("msg"); if (m) { m.className = "msg" + (kind ? " " + kind : ""); m.textContent = text; } }
function draw() {
  el("chips").innerHTML = CHARS.map(function (c, i) {
    var show = i < ci || finished || (i === ci && round < ROUNDS);
    return '<div class="chip ' + (i < ci || finished ? "done" : i === ci ? "now" : "") + '">' + (show ? c : "?") + "</div>";
  }).join("");
  var dots = "";
  for (var r = 1; r <= ROUNDS; r++) dots += '<div class="dot ' + (finished || r < round ? "ok" : r === round ? "on" : "") + '"></div>';
  el("dots").innerHTML = dots;
  el("roundLabel").textContent = finished ? "Done" :
    "Round " + round + " of " + ROUNDS + " · " + (round < ROUNDS ? "Trace" : "From memory") +
    (CHARS.length > 1 ? " · character " + (ci + 1) + " of " + CHARS.length : "");
}
function start() {
  draw();
  el("target").innerHTML = "";
  var size = el("target").clientWidth || 300;
  writer = HanziWriter.create("target", CHARS[ci], {
    width: size, height: size, padding: 18,
    showCharacter: false, showOutline: round < ROUNDS,
    strokeColor: css("--ink"), outlineColor: css("--line"), highlightColor: css("--red"), drawingColor: css("--ink"),
    drawingWidth: 22, strokeAnimationSpeed: 1.2, delayBetweenStrokes: 200,
    charDataLoader: function (c, onLoad, onError) { if (DATA[c]) onLoad(DATA[c]); else onError(); }
  });
  note(round < ROUNDS ? "Write each stroke with your finger." : "Now without the outline.");
  writer.quiz({
    showHintAfterMisses: 3,
    onMistake: function () { note("Not this stroke. Try again.", "bad"); },
    onCorrectStroke: function (d) { note(d.strokesRemaining ? d.strokesRemaining + (d.strokesRemaining === 1 ? " stroke left" : " strokes left") : ""); },
    onComplete: function () {
      note("Good!", "good");
      setTimeout(function () {
        if (round < ROUNDS) round++;
        else { round = 1; ci++; }
        if (ci >= CHARS.length) {
          finished = true; draw();
          writer.showCharacter();
          note("Done! " + WORD, "good");
          act("done:" + WORD);
          return;
        }
        start();
      }, 700);
    }
  });
}
if (CHARS.length) {
  el("hint").onclick = function () { if (writer && !finished) { writer.showOutline(); note("Outline shown for this round."); } };
  el("show").onclick = function () {
    if (!writer || finished) return;
    writer.cancelQuiz();
    writer.animateCharacter({ onComplete: function () { writer.hideCharacter(); start(); } });
  };
  start();
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
const lib = pack.words.length ? await getLib() : null;
if (!pack.words.length) {
  await info("Write", MODE === "path"
    ? "Write needs the internet the first time, to get the list. Connect and run Write again."
    : "No words yet. Connect to the internet and run Hourly Words once, then run Write again.");
} else if (!lib) {
  await info("Write", "Write needs the internet the first time, to get the stroke data. Connect and run Write again.");
} else {
  const q = args.queryParameters || {};
  async function pageFor(w) {
    const strokes = {};
    for (const c of hanOnly(w.hanzi)) { const d = await getStrokes(c); if (d) strokes[c] = d; }
    return pageHTML(w, lib, strokes, MODE === "path" ? "" : w.level === "mine" ? LEVEL_NAMES.mine : levelName);
  }
  // Path: st.pos is the item to show next time. Finishing a word moves it on,
  // so closing Write after a word starts at the next one.
  const n = pack.words.length;
  st.pos = Number.isInteger(st.pos) ? ((st.pos % n) + n) % n : 0;
  let cur = st.pos;
  const pick = () => MODE === "path" ? pack.words[cur] : nextWord(st, pack);
  let w = (q.word && pack.byHanzi[q.word]) || pick();
  saveState();
  const wv = new WebView();
  let busy = Promise.resolve();
  async function handle(a) {
    if (a.startsWith("done:")) {
      const h = a.slice(5);
      st.done[h] = (st.done[h] || 0) + 1;
      if (MODE === "path" && pack.words[cur] && pack.words[cur].hanzi === h) st.pos = (cur + 1) % n;
      saveState();
    } else if (a === "next") {
      if (MODE === "path") { cur = st.pos === cur ? (cur + 1) % n : st.pos; st.pos = cur; }
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
