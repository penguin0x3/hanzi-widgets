// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: yellow; icon-glyph: magic;

// Hourly Words: one Chinese word at a time on the Lock Screen or Home Screen.
// - Tap the widget: a detail page with meanings, measure word, example and sound.
// - Run this script in the app: menu to choose HSK levels, update lists, see progress.
// - Widget Parameter (optional): "hsk3" or "hsk3,hsk4" overrides the levels for that widget.
// Word lists download from GitHub and are saved in iCloud Drive > Scriptable.
// Your own words go in mywords.txt (use the Add Word script), one per line: hanzi | pinyin | meaning

const REPO = "https://raw.githubusercontent.com/penguin0x3/hanzi-widgets/main/";
const LEVELS = ["hsk1-2", "hsk3", "hsk4", "hsk5"];
const LEVEL_NAMES = { "hsk1-2": "HSK 1-2", hsk3: "HSK 3", hsk4: "HSK 4", hsk5: "HSK 5", mine: "My words" };
const UPDATE_DAYS = 7;      // check GitHub for a new list about once a week
const KNOWN_RATE = 0.1;     // a known word shows up about 1 time in 10 compared with other words
const REVIEW_DAYS = [1, 3, 7]; // a word you tap on the widget comes back after 1 day; tap it again: 3 days, then 7
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
progress.review = progress.review || {}; // hanzi -> { step, due } (due 0 = shown, waiting for a tap)
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

// ---------- review ----------
// Tapping a word on the widget means "I want to see this again". The word comes back
// after REVIEW_DAYS[step] days. Tap it again when it comes back and the wait gets longer.
// Not tapped when it comes back: it leaves the review list.
const DAY = 24 * 60 * 60 * 1000;
function markTapped(w) {
  if (progress.known[w.hanzi]) return;
  const r = progress.review[w.hanzi];
  let step = 0;
  if (r) step = r.due === 0 ? Math.min(r.step + 1, REVIEW_DAYS.length - 1) : r.step;
  progress.review[w.hanzi] = { step, due: Date.now() + REVIEW_DAYS[step] * DAY };
  saveProgress();
}
// The word that has waited longest past its review time, or null. Also drops old
// entries: words shown for review more than a day ago and not tapped.
function dueReview(pack, now) {
  let best = null;
  for (const [h, r] of Object.entries(progress.review)) {
    if (!r || progress.known[h] || (r.due === 0 && now - (r.shown || 0) > DAY)) { delete progress.review[h]; continue; }
    if (r.due > 0 && r.due <= now && pack.byHanzi[h] && (!best || r.due < progress.review[best].due)) best = h;
  }
  if (!best) return null;
  progress.review[best] = { step: progress.review[best].step, due: 0, shown: now };
  saveProgress();
  return pack.byHanzi[best];
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
    w = dueReview(pack, now) || nextFromDeck(st, pack);
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
:root { --bg:#EEF7E8; --ink:#000000; --accent:#108652; --grey:#5F665F; --line:#D3E4CA; --card:#FFFFFF; --soft:#97DF67; --on:#FFFFFF; --bad:#C0392B; --ok:#108652; }
@media (prefers-color-scheme: dark) { :root { --bg:#0E1F16; --ink:#FFFFFF; --accent:#97DF67; --grey:#9DA39D; --line:#2F4A39; --card:#16291E; --soft:#108652; --on:#000000; --bad:#FF7A6B; --ok:#97DF67; } }
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
body { margin:0; padding:24px 20px 140px; background:var(--bg); color:var(--ink);
  font: 17px/1.45 -apple-system, "PingFang SC", sans-serif; }
.hanzi { font-size:72px; font-weight:600; line-height:1.1; letter-spacing:2px; }
.row { display:flex; align-items:center; gap:12px; margin-top:6px; }
.pinyin { font-size:24px; color:var(--accent); font-weight:600; }
.play { border:1px solid var(--line); background:var(--card); color:var(--ink); border-radius:20px;
  padding:6px 14px; font-size:15px; }
.tag { display:inline-block; margin-top:10px; font-size:13px; color:var(--grey); border:1px solid var(--line);
  border-radius:10px; padding:1px 8px; }
h2 { font-size:13px; letter-spacing:1px; text-transform:uppercase; color:var(--grey); margin:26px 0 8px; font-weight:600; }
ol { margin:0; padding-left:24px; } li { margin:4px 0; }
.mw { margin-top:8px; color:var(--grey); } .mw b { color:var(--ink); }
.ex { border-left:3px solid var(--accent); padding:4px 0 4px 14px; }
.ex .zh { font-size:22px; } .ex .py { color:var(--accent); font-size:15px; margin-top:2px; } .ex .en { color:var(--grey); margin-top:2px; }
.bar { position:fixed; left:0; right:0; bottom:0; padding:12px 20px 34px; background:var(--bg); border-top:1px solid var(--line);
  display:flex; gap:10px; }
.bar button { flex:1; font-size:17px; padding:14px; border-radius:14px; border:1px solid var(--line); background:var(--card); color:var(--ink); }
.bar button.on { background:var(--accent); color:var(--on); border-color:var(--accent); }
.foot { color:var(--grey); font-size:13px; margin-top:28px; }
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
<div class="hanzi" data-look>${esc(w.hanzi)}</div>
<div class="row"><span class="pinyin">${esc(w.pinyin)}</span>
<button class="play" ontouchstart="warmUp()" onclick="say(${esc(JSON.stringify(w.hanzi))})">Listen</button>
<button class="play" onclick="act(${esc(JSON.stringify("write:" + JSON.stringify([w.hanzi, w.pinyin || "", w.short || senses[0] || ""])))})">Write</button></div>
<span class="tag">${esc(LEVEL_NAMES[w.level] || w.level)}</span>
<h2>Meaning</h2>
<ol>${senses.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
${w.measure ? `<div class="mw">Measure word: <b>${esc(w.measure)}</b></div>` : ""}
${ex ? `<h2>Example</h2><div class="ex"><div class="zh" data-look>${esc(ex.zh)}</div>
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
var keepAwake = null, warm = false, lastSay = 0;
function zhVoice() {
  var vs = speechSynthesis.getVoices() || [];
  for (var i = 0; i < vs.length; i++) if (/^zh[-_]CN/i.test(vs[i].lang)) return vs[i];
  for (var j = 0; j < vs.length; j++) if (/^zh/i.test(vs[j].lang)) return vs[j];
  return null;
}
// First touch anywhere: open the audio channel and load the voice, so Play starts at once.
function warmUp() {
  if (warm) return; warm = true;
  try {
    keepAwake = new Audio(SILENT); keepAwake.loop = true;
    keepAwake.play().catch(function () {});
  } catch (e) {}
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
function say(t) {
  var now = Date.now(); if (now - lastSay < 400) return; lastSay = now;
  voice(t);
}
function act(a) { location.href = "hanzi://" + encodeURIComponent(a); }
function toggleKnown() {
  var b = document.getElementById("known"), on = b.className !== "on";
  b.className = on ? "on" : ""; b.textContent = on ? "Known" : "Mark known"; act("known");
}
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

// ---------- tap a character: dictionary card ----------
// The same block is in Hourly Words and Radicals. Words come from CC-CEDICT in dict.txt
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
function act(a) { location.href = "hanzi://" + encodeURIComponent(a); }
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
    } else if (a.startsWith("look:")) {
      await showLook(wv, a);
    } else if (a.startsWith("explore:")) {
      await exploreTo(wv, a.slice(8), pack.words);
    } else if (a === "xback") {
      await exploreBack(wv, pack.words, () => detailHTML(w, pack));
    } else if (a.startsWith("write:")) {
      // Run the Write script on this word. Write keeps your place in its own list.
      let p = [];
      try { p = JSON.parse(a.slice(6)); } catch (e) { return; }
      Safari.open("scriptable:///run/" + encodeURIComponent("Write") + "?word=" + encodeURIComponent(p[0] || "") +
        "&pinyin=" + encodeURIComponent(p[1] || "") + "&meaning=" + encodeURIComponent(p[2] || ""));
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
    if (w) { markTapped(w); return showDetail(w, pack); }
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
