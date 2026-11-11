// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: yellow; icon-glyph: magic;

// Hourly Words: one Chinese word at a time on the Lock Screen or Home Screen.
// - Tap the widget: a detail page with meanings, measure word, example and sound.
// - Run this script in the app: menu to choose HSK levels, update lists, see progress.
// - Widget Parameter (optional): "hsk3" or "hsk3,hsk4" overrides the levels for that widget.
// Word lists download from GitHub and are saved in iCloud Drive > Scriptable.
// Your own words go in mywords.txt (use the Add Word script), one per line: hanzi | pinyin | meaning

const REPO = "https://raw.githubusercontent.com/0xpenguin2/hanzi-widgets/main/";
const LEVELS = ["hsk1-2", "hsk3", "hsk4", "hsk5"];
const LEVEL_NAMES = { "hsk1-2": "HSK 1-2", hsk3: "HSK 3", hsk4: "HSK 4", hsk5: "HSK 5", mine: "My words" };
const UPDATE_DAYS = 7;      // check GitHub for a new list about once a week
const KNOWN_RATE = 0.1;     // a known word shows up about 1 time in 10 compared with other words
const WIDGET_MINUTES = 0.5; // ask iOS to refresh this often; iOS decides the real time (often 5-30 minutes)

// Lock Screen font sizes: change these numbers to make text bigger or smaller
const LOCK_HANZI = 56;      // rectangular widget: words with 1-2 characters (big, on the left)
const LOCK_HANZI_LONG = 36; // rectangular widget: words with 3+ characters (full width)
const LOCK_PINYIN = 16;
const LOCK_MEANING = 14;
const LOCK_INLINE = 16;     // one-line widget above the clock

const fm = FileManager.iCloud();
const dir = fm.documentsDirectory();
const path = name => fm.joinPath(dir, name);
const SETTINGS = path("hanzi-settings.json");
const PROGRESS = path("hanzi-progress.json");
const STATE = path("hanzi-widget-state.json");
const MYWORDS = path("mywords.txt");

// ---------- files ----------
async function readText(p) {
  if (!fm.fileExists(p)) return null;
  try { await fm.downloadFileFromiCloud(p); return fm.readString(p); } catch (e) { return null; }
}
async function readJSON(p, fallback) {
  const t = await readText(p);
  if (!t) return fallback;
  try { return JSON.parse(t); } catch (e) { return fallback; }
}
function writeJSON(p, v) { fm.writeString(p, JSON.stringify(v)); }

function parseLevels(s) {
  if (!s) return null;
  const out = String(s).toLowerCase().split(/[\s,;]+/).map(x => {
    x = x.replace(/^hsk/, "");
    if (x === "1" || x === "2" || x === "1-2" || x === "12") return "hsk1-2";
    return LEVELS.includes("hsk" + x) ? "hsk" + x : null;
  }).filter(Boolean);
  return out.length ? [...new Set(out)] : null;
}

// Download a level from GitHub when there is no copy or the copy is old.
async function getLevel(level, force) {
  const p = path(level + ".json");
  const have = fm.fileExists(p);
  let old = have ? (Date.now() - fm.modificationDate(p).getTime()) / 86400000 : Infinity;
  if (force || !have || old > UPDATE_DAYS) {
    try {
      const r = new Request(REPO + "data/" + level + ".json");
      r.timeoutInterval = 15;
      const text = await r.loadString();
      const data = JSON.parse(text);
      if (Array.isArray(data.words) && data.words.length) {
        fm.writeString(p, text);
        return data.words;
      }
    } catch (e) { /* offline or GitHub down: use the saved copy */ }
  }
  const data = await readJSON(p, null);
  return data && Array.isArray(data.words) ? data.words : null;
}

async function myWords() {
  const t = await readText(MYWORDS);
  if (!t) return [];
  return t.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#")).map(l => {
    const p = l.split(/\s*[|\t]\s*/);
    const meaning = p.slice(2).join(" / ");
    return { hanzi: p[0], pinyin: p[1] || "", short: meaning, senses: meaning ? meaning.split(/\s*;\s*/) : [] };
  }).filter(w => w.hanzi);
}

// All words of the chosen levels plus my words, without duplicates.
async function loadWords(levels, force) {
  const words = [], byHanzi = {}, missing = [];
  for (const lv of levels) {
    const list = await getLevel(lv, force);
    if (!list) { missing.push(lv); continue; }
    for (const w of list) {
      if (byHanzi[w.hanzi]) continue;
      byHanzi[w.hanzi] = Object.assign({ level: lv }, w);
      words.push(byHanzi[w.hanzi]);
    }
  }
  for (const w of await myWords()) {
    if (byHanzi[w.hanzi]) continue;
    byHanzi[w.hanzi] = Object.assign({ level: "mine" }, w);
    words.push(byHanzi[w.hanzi]);
  }
  return { words, byHanzi, missing };
}

const settings = await readJSON(SETTINGS, {});
if (!parseLevels((settings.levels || []).join(","))) settings.levels = ["hsk1-2"];
const progress = await readJSON(PROGRESS, {});
progress.known = progress.known || {};
progress.seen = progress.seen || {};
const saveProgress = () => writeJSON(PROGRESS, progress);

// ---------- picking words ----------
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// A deck has every word that is not known, plus a few known words. Every word in
// the deck shows once before the deck is built again.
function newDeck(words) {
  const deck = words.filter(w => !progress.known[w.hanzi] || Math.random() < KNOWN_RATE).map(w => w.hanzi);
  return shuffle(deck.length ? deck : words.map(w => w.hanzi));
}
function nextFromDeck(st, pack) {
  for (let tries = 0; tries < 2; tries++) {
    while (st.deck && st.deck.length) {
      const h = st.deck.pop();
      if (pack.byHanzi[h]) return pack.byHanzi[h];
    }
    st.deck = newDeck(pack.words);
  }
  return pack.words[0];
}

// ---------- widget ----------
function addLine(lw, text, font, lines, scale) {
  const t = lw.addText(text || " ");
  t.font = font;
  t.lineLimit = lines;
  t.minimumScaleFactor = scale;
  return t;
}

function messageWidget(text) {
  const lw = new ListWidget();
  addLine(lw, text, Font.systemFont(13), 3, 0.6);
  lw.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  return lw;
}

function buildWidget(w, family) {
  const lw = new ListWidget();
  const meaning = w.short || (w.senses || [])[0] || "";
  switch (family) {
    case "accessoryInline":
      addLine(lw, w.hanzi + " " + w.pinyin, Font.systemFont(LOCK_INLINE), 1, 0.5);
      break;
    case "accessoryCircular": {
      lw.addAccessoryWidgetBackground = true;
      const c = addLine(lw, w.hanzi, Font.boldSystemFont(w.hanzi.length <= 2 ? 20 : 14), 2, 0.4);
      c.centerAlignText();
      break;
    }
    case "accessoryRectangular":
      lw.setPadding(0, 0, 0, 0);
      if ([...w.hanzi].length <= 2) {
        const row = lw.addStack();
        row.centerAlignContent();
        const h = row.addText(w.hanzi);
        h.font = Font.boldSystemFont(LOCK_HANZI);
        h.lineLimit = 1;
        h.minimumScaleFactor = 0.3;
        row.addSpacer(6);
        const col = row.addStack();
        col.layoutVertically();
        addLine(col, w.pinyin, Font.boldSystemFont(LOCK_PINYIN), 1, 0.6);
        addLine(col, meaning, Font.systemFont(LOCK_MEANING), 2, 0.6);
        row.addSpacer();
      } else {
        addLine(lw, w.hanzi, Font.boldSystemFont(LOCK_HANZI_LONG), 1, 0.4);
        addLine(lw, w.pinyin + "  " + meaning, Font.systemFont(LOCK_MEANING), 1, 0.6);
      }
      break;
    case "medium":
    case "large":
    case "extraLarge":
      addLine(lw, w.hanzi, Font.boldSystemFont(44), 1, 0.4);
      lw.addSpacer(4);
      addLine(lw, w.pinyin, Font.systemFont(18), 1, 0.6);
      lw.addSpacer(4);
      addLine(lw, meaning, Font.systemFont(14), 3, 0.6);
      break;
    default: // small
      addLine(lw, w.hanzi, Font.boldSystemFont(34), 1, 0.4);
      addLine(lw, w.pinyin, Font.systemFont(14), 1, 0.6);
      addLine(lw, meaning, Font.systemFont(11), 3, 0.6);
  }
  return lw;
}

function detailURL(w, levels) {
  return "scriptable:///run/" + encodeURIComponent(Script.name()) +
    "?word=" + encodeURIComponent(w.hanzi) + "&levels=" + encodeURIComponent(levels.join(","));
}

async function runWidget() {
  const levels = parseLevels(args.widgetParameter) || settings.levels;
  const pack = await loadWords(levels, false);
  if (!pack.words.length) {
    Script.setWidget(messageWidget("No words yet. Open Scriptable and run Hourly Words once with internet."));
    return;
  }
  const state = await readJSON(STATE, {});
  const key = levels.join(",");
  const st = state[key] || (state[key] = { deck: [] });
  const now = Date.now();
  let w = pack.byHanzi[st.current];
  if (!w || !st.until || now >= st.until) {
    w = nextFromDeck(st, pack);
    st.current = w.hanzi;
    st.until = now + Math.max(0, WIDGET_MINUTES * 60 - 20) * 1000;
  }
  writeJSON(STATE, state);
  if (!progress.seen[w.hanzi]) { progress.seen[w.hanzi] = 1; saveProgress(); }
  const lw = buildWidget(w, config.widgetFamily);
  lw.url = detailURL(w, levels);
  lw.refreshAfterDate = new Date(now + WIDGET_MINUTES * 60 * 1000);
  Script.setWidget(lw);
}

// ---------- detail page ----------
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function countSeen(words) { return words.filter(w => progress.seen[w.hanzi]).length; }

function detailHTML(w, pack) {
  const senses = (w.senses && w.senses.length ? w.senses : [w.short]).filter(Boolean);
  const ex = w.example;
  const known = !!progress.known[w.hanzi];
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
:root { --bg:#F5EFE3; --ink:#2B2118; --red:#A8392B; --grey:#6B5E50; --line:#E2D8C6; --card:#FBF7EF; }
@media (prefers-color-scheme: dark) { :root { --bg:#1E1A16; --ink:#F1E9DC; --red:#E07A5F; --grey:#B5A894; --line:#3A332B; --card:#28231E; } }
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
body { margin:0; padding:24px 20px 140px; background:var(--bg); color:var(--ink);
  font: 17px/1.45 -apple-system, "PingFang SC", sans-serif; }
.hanzi { font-size:72px; font-weight:600; line-height:1.1; letter-spacing:2px; }
.row { display:flex; align-items:center; gap:12px; margin-top:6px; }
.pinyin { font-size:24px; color:var(--red); font-weight:600; }
.play { border:1px solid var(--line); background:var(--card); color:var(--ink); border-radius:20px;
  padding:6px 14px; font-size:15px; }
.tag { display:inline-block; margin-top:10px; font-size:13px; color:var(--grey); border:1px solid var(--line);
  border-radius:10px; padding:1px 8px; }
h2 { font-size:13px; letter-spacing:1px; text-transform:uppercase; color:var(--grey); margin:26px 0 8px; font-weight:600; }
ol { margin:0; padding-left:24px; } li { margin:4px 0; }
.mw { margin-top:8px; color:var(--grey); } .mw b { color:var(--ink); }
.ex { border-left:3px solid var(--red); padding:4px 0 4px 14px; }
.ex .zh { font-size:22px; } .ex .py { color:var(--red); font-size:15px; margin-top:2px; } .ex .en { color:var(--grey); margin-top:2px; }
.bar { position:fixed; left:0; right:0; bottom:0; padding:12px 20px 34px; background:var(--bg); border-top:1px solid var(--line);
  display:flex; gap:10px; }
.bar button { flex:1; font-size:17px; padding:14px; border-radius:14px; border:1px solid var(--line); background:var(--card); color:var(--ink); }
.bar button.on { background:var(--ink); color:var(--bg); border-color:var(--ink); }
.foot { color:var(--grey); font-size:13px; margin-top:28px; }
</style></head><body>
<div class="hanzi">${esc(w.hanzi)}</div>
<div class="row"><span class="pinyin">${esc(w.pinyin)}</span>
<button class="play" onclick="say(${esc(JSON.stringify(w.hanzi))})">Play</button></div>
<span class="tag">${esc(LEVEL_NAMES[w.level] || w.level)}</span>
<h2>Meaning</h2>
<ol>${senses.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
${w.measure ? `<div class="mw">Measure word: <b>${esc(w.measure)}</b></div>` : ""}
${ex ? `<h2>Example</h2><div class="ex"><div class="zh">${esc(ex.zh)}
<button class="play" onclick="say(${esc(JSON.stringify(ex.zh))})">Play</button></div>
<div class="py">${esc(ex.pinyin)}</div><div class="en">${esc(ex.en)}</div></div>` : ""}
<div class="foot">Seen ${countSeen(pack.words)} of ${pack.words.length} words in your levels.
${ex ? "<br>Example from Tatoeba. " : "<br>"}Meanings from CC-CEDICT.</div>
<div class="bar">
<button id="known" class="${known ? "on" : ""}" onclick="toggleKnown()">${known ? "Known" : "Mark known"}</button>
<button onclick="act('next')">Next word</button></div>
<script>
// Play: the Chinese voice of the page. A silent looping <audio> runs while it
// speaks, so iOS uses the media channel and plays sound in silent mode too.
var SILENT = "data:audio/wav;base64,UklGRsQPAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YaAPAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";
var keepAwake = null;
function zhVoice() {
  var vs = speechSynthesis.getVoices() || [];
  for (var i = 0; i < vs.length; i++) if (/^zh[-_]CN/i.test(vs[i].lang)) return vs[i];
  for (var j = 0; j < vs.length; j++) if (/^zh/i.test(vs[j].lang)) return vs[j];
  return null;
}
function say(t) {
  try {
    if (!keepAwake) { keepAwake = new Audio(SILENT); keepAwake.loop = true; }
    keepAwake.play().catch(function () {});
  } catch (e) {}
  if (!window.speechSynthesis) { act("speak:" + t); return; }
  speechSynthesis.cancel();
  var u = new SpeechSynthesisUtterance(t);
  u.lang = "zh-CN"; u.rate = 0.85;
  var v = zhVoice(); if (v) u.voice = v;
  u.onend = u.onerror = function () { try { keepAwake.pause(); } catch (e) {} };
  speechSynthesis.speak(u);
}
function act(a) { location.href = "hanzi://" + encodeURIComponent(a); }
function toggleKnown() {
  var b = document.getElementById("known"), on = b.className !== "on";
  b.className = on ? "on" : ""; b.textContent = on ? "Known" : "Mark known"; act("known");
}
</script></body></html>`;
}

// The page asks for actions by opening "hanzi://<action>" links. We catch them
// in shouldAllowRequest and cancel the navigation, so the page stays open.
async function showDetail(first, pack) {
  const wv = new WebView();
  let w = first;
  const deck = { deck: [] };
  let busy = Promise.resolve();
  async function handle(a) {
    if (a === "known") {
      if (progress.known[w.hanzi]) delete progress.known[w.hanzi]; else progress.known[w.hanzi] = 1;
      saveProgress();
    } else if (a === "next") {
      w = nextFromDeck(deck, pack);
      if (!progress.seen[w.hanzi]) { progress.seen[w.hanzi] = 1; saveProgress(); }
      await wv.loadHTML(detailHTML(w, pack));
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
  await wv.loadHTML(detailHTML(w, pack));
  await wv.present(true);
  await busy;
}

// ---------- menu in the app ----------
async function chooseLevels() {
  const chosen = new Set(settings.levels);
  while (true) {
    const al = new Alert();
    al.title = "Levels";
    al.message = "Tap a level to turn it on or off. Widgets with a Parameter keep their own levels.";
    for (const lv of LEVELS) al.addAction((chosen.has(lv) ? "[x] " : "[  ] ") + LEVEL_NAMES[lv]);
    al.addCancelAction("Done");
    const i = await al.presentSheet();
    if (i === -1) break;
    const lv = LEVELS[i];
    if (chosen.has(lv)) { if (chosen.size > 1) chosen.delete(lv); } else chosen.add(lv);
  }
  settings.levels = LEVELS.filter(lv => chosen.has(lv));
  writeJSON(SETTINGS, settings);
  const pack = await loadWords(settings.levels, false);
  await info("Saved", pack.missing.length
    ? "Could not download: " + pack.missing.map(l => LEVEL_NAMES[l]).join(", ") + ". Check the internet and try Update lists."
    : pack.words.length + " words ready. The widget uses them at the next refresh.");
}

async function info(title, message) {
  const al = new Alert();
  al.title = title; al.message = message; al.addAction("OK");
  await al.present();
}

async function showProgress() {
  const lines = [];
  for (const lv of LEVELS) {
    const list = fm.fileExists(path(lv + ".json")) ? await getLevel(lv, false) : null;
    if (!list) { lines.push(LEVEL_NAMES[lv] + ": not downloaded"); continue; }
    const seen = list.filter(w => progress.seen[w.hanzi]).length;
    const known = list.filter(w => progress.known[w.hanzi]).length;
    lines.push(`${LEVEL_NAMES[lv]}: seen ${seen} of ${list.length}, known ${known}`);
  }
  const mine = await myWords();
  lines.push(`My words: ${mine.length}`);
  await info("Progress", lines.join("\n"));
}

async function runApp() {
  const q = args.queryParameters || {};
  if (q.word) {
    const levels = parseLevels(q.levels) || settings.levels;
    const pack = await loadWords(levels, false);
    const w = pack.byHanzi[q.word];
    if (w) return showDetail(w, pack);
  }
  while (true) {
    const pack = await loadWords(settings.levels, false);
    const al = new Alert();
    al.title = "Hourly Words";
    al.message = `Levels: ${settings.levels.map(l => LEVEL_NAMES[l]).join(", ")}\n${pack.words.length} words` +
      (pack.missing.length ? `\nNot downloaded yet: ${pack.missing.map(l => LEVEL_NAMES[l]).join(", ")}` : "");
    al.addAction("Show a word");
    al.addAction("Choose levels");
    al.addAction("Update lists now");
    al.addAction("Progress");
    al.addCancelAction("Close");
    const i = await al.presentSheet();
    if (i === -1) break;
    if (i === 0 && pack.words.length) await showDetail(nextFromDeck({ deck: [] }, pack), pack);
    if (i === 0 && !pack.words.length) await info("No words", "Connect to the internet and tap Update lists now.");
    if (i === 1) await chooseLevels();
    if (i === 2) {
      const p = await loadWords(settings.levels, true);
      await info("Update", p.missing.length ? "Could not reach GitHub. The saved lists are still used." : p.words.length + " words, all up to date.");
    }
    if (i === 3) await showProgress();
  }
}

if (config.runsInWidget || config.runsInAccessoryWidget) await runWidget();
else await runApp();
Script.complete();
