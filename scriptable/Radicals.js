// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-brown; icon-glyph: language;

// One Chinese radical at a time, for Home Screen widgets.
// Best size: medium (radical on the left, 3 example characters on the right).
// Data: radicals.txt in iCloud Drive > Scriptable, one radical per line:
//   radical | pinyin | name | meaning | examples
//   examples: up to 3, split by ";", each "character pinyin meaning"
// Every widget shows the same radical at the same time, and every radical
// appears once before any of them repeats. No state file is needed.
// Tap the widget (or run this script in the app): a detail page with each
// example character, a common word with it, an example sentence and sound.
// Words and sentences come from the HSK lists that Hourly Words saved.

const LIST_FILE = "radicals.txt";
const MINUTES = 10; // a new radical every 10 minutes (iOS decides the real refresh time)

// Colors: "paper and ink", same as the Mac desktop card
const BG = new Color("#F5EFE3");
const INK = new Color("#2B2118");
const RED = new Color("#A8392B");
const GREY = new Color("#6B5E50");

const fm = FileManager.iCloud();
const listPath = fm.joinPath(fm.documentsDirectory(), LIST_FILE);
const goodList = t => typeof t === "string" && t.includes("|");
// Read the saved list. Right after Install, iCloud may still be syncing the file
// and reading it gives nothing, so this never throws.
async function readList() {
  if (!fm.fileExists(listPath)) return null;
  try { await fm.downloadFileFromiCloud(listPath); return fm.readString(listPath); } catch (e) { return null; }
}
let listText = await readList();
if (!goodList(listText)) { // first run, or the file could not be read: get the list from GitHub
  try {
    const r = new Request("https://raw.githubusercontent.com/penguin0x3/hanzi-widgets/main/scriptable/" + LIST_FILE);
    const t = await r.loadString();
    if (goodList(t)) { listText = t; try { fm.writeString(listPath, t); } catch (e) {} }
  } catch (e) {}
}
if (!goodList(listText)) listText = "";

// "河 hé river" -> { char: "河", pinyin: "hé", meaning: "river" }
function parseExample(s) {
  const parts = s.trim().split(/\s+/);
  return { char: parts[0] || "", pinyin: parts[1] || "", meaning: parts.slice(2).join(" ") };
}

// "Big" and "big": the meaning only repeats the name, so it is not shown.
const baseName = n => n.replace(/\s*\(.*?\)/g, "").trim().toLowerCase();
const meaningOf = (name, meaning) => (meaning.trim().toLowerCase() === baseName(name) ? "" : meaning);

const ITEMS = listText
  .split(/\r?\n/)
  .map(l => l.trim())
  .filter(l => l && !l.startsWith("#"))
  .map(l => l.split(/\s*[|\t]\s*/))
  .map(p => ({
    radical: p[0],
    pinyin: p[1] || "",
    name: p[2] || "",
    meaning: meaningOf(p[2] || "", p[3] || ""),
    examples: (p[4] || "").split(";").map(parseExample).filter(e => e.char).slice(0, 3),
  }));

// Pick the radical from the clock: the same time slot gives the same radical
// in every widget. Each cycle of slots is a fresh shuffle of the whole list.
function rng(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffledOrder(cycle) {
  const a = ITEMS.map((_, i) => i);
  const r = rng(cycle * 7919 + ITEMS.length);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const now = new Date();
const slotMs = MINUTES * 60 * 1000;
const slot = Math.floor(now.getTime() / slotMs);
const item = ITEMS.length === 0 ? null : ITEMS[shuffledOrder(Math.floor(slot / ITEMS.length))[slot % ITEMS.length]];
const nextChange = new Date((slot + 1) * slotMs);

function addLine(stack, text, font, color, lines, scale) {
  const t = stack.addText(text || " ");
  t.font = font;
  if (color) t.textColor = color;
  t.lineLimit = lines;
  t.minimumScaleFactor = scale;
  return t;
}

// One example row: big character, then pinyin and meaning stacked
function addExample(stack, e, charSize, textSize) {
  const row = stack.addStack();
  row.centerAlignContent();
  addLine(row, e.char, Font.mediumSystemFont(charSize), INK, 1, 0.6);
  row.addSpacer(8);
  const col = row.addStack();
  col.layoutVertically();
  addLine(col, e.pinyin, Font.semiboldSystemFont(textSize), RED, 1, 0.6);
  addLine(col, e.meaning, Font.systemFont(textSize), GREY, 1, 0.6);
  row.addSpacer();
}

function buildWidget(r, family) {
  const lw = new ListWidget();
  if (!String(family).startsWith("accessory")) lw.backgroundColor = BG;
  switch (family) {
    case "medium": { // radical left, 3 examples right
      lw.setPadding(12, 16, 12, 16);
      const row = lw.addStack();
      row.centerAlignContent();
      const left = row.addStack();
      left.layoutVertically();
      left.size = new Size(112, 0);
      addLine(left, r.radical, Font.boldSystemFont(58), INK, 1, 0.5);
      addLine(left, r.name, Font.boldSystemFont(15), INK, 1, 0.6);
      addLine(left, r.pinyin, Font.semiboldSystemFont(14), RED, 1, 0.6);
      if (r.meaning) addLine(left, r.meaning, Font.systemFont(13), GREY, 2, 0.6);
      row.addSpacer(10);
      const right = row.addStack();
      right.layoutVertically();
      r.examples.forEach((e, i) => {
        if (i > 0) right.addSpacer(4);
        addExample(right, e, 28, 14);
      });
      row.addSpacer();
      break;
    }

    case "large":
    case "extraLarge": { // radical on top, examples below
      lw.setPadding(18, 20, 18, 20);
      const top = lw.addStack();
      top.centerAlignContent();
      addLine(top, r.radical, Font.boldSystemFont(84), INK, 1, 0.5);
      top.addSpacer(16);
      const info = top.addStack();
      info.layoutVertically();
      addLine(info, r.name, Font.boldSystemFont(22), INK, 1, 0.6);
      addLine(info, r.pinyin, Font.semiboldSystemFont(17), RED, 1, 0.6);
      if (r.meaning) addLine(info, r.meaning, Font.systemFont(15), GREY, 2, 0.6);
      top.addSpacer();
      lw.addSpacer(14);
      addLine(lw, "Examples", Font.semiboldSystemFont(12), GREY, 1, 0.8);
      lw.addSpacer(6);
      r.examples.forEach((e, i) => {
        if (i > 0) lw.addSpacer(10);
        addExample(lw, e, 36, 15);
      });
      lw.addSpacer();
      break;
    }

    case "accessoryInline":
    case "accessoryCircular":
    case "accessoryRectangular": // not designed for the Lock Screen; show the basics
      addLine(lw, r.radical + " " + r.name, Font.systemFont(14), null, 1, 0.5);
      break;

    default: { // small: radical, name, meaning, first example
      lw.setPadding(12, 12, 12, 12);
      const big = addLine(lw, r.radical, Font.boldSystemFont(48), INK, 1, 0.5);
      big.centerAlignText();
      const name = addLine(lw, r.name + "  " + r.pinyin, Font.semiboldSystemFont(12), RED, 1, 0.6);
      name.centerAlignText();
      if (r.meaning) addLine(lw, r.meaning, Font.systemFont(11), GREY, 1, 0.6).centerAlignText();
      if (r.examples[0]) {
        lw.addSpacer(4);
        const e = r.examples[0];
        const ex = addLine(lw, e.char + " " + e.meaning, Font.systemFont(12), INK, 1, 0.6);
        ex.centerAlignText();
      }
    }
  }
  lw.refreshAfterDate = nextChange;
  lw.url = "scriptable:///run/" + encodeURIComponent(Script.name()) + "?radical=" + encodeURIComponent(r.radical);
  return lw;
}

// ---------- detail page ----------
const LEVEL_FILES = ["hsk1-2", "hsk3", "hsk4", "hsk5"];
const REPO = "https://raw.githubusercontent.com/penguin0x3/hanzi-widgets/main/";

// Words from all HSK lists (lowest level first). A missing list is downloaded once
// (all 4 are about 550 KB) and saved next to the ones Hourly Words uses.
async function loadWords() {
  const words = [];
  for (const lv of LEVEL_FILES) {
    const p = fm.joinPath(fm.documentsDirectory(), lv + ".json");
    try {
      if (!fm.fileExists(p)) {
        const r = new Request(REPO + "data/" + lv + ".json");
        r.timeoutInterval = 15;
        const t = await r.loadString();
        if (JSON.parse(t).words.length) fm.writeString(p, t);
      }
    } catch (e) {}
    if (!fm.fileExists(p)) continue;
    try {
      await fm.downloadFileFromiCloud(p);
      for (const w of JSON.parse(fm.readString(p)).words || []) words.push(w);
    } catch (e) {}
  }
  return words;
}

// For one character: a common word that contains it and an example sentence.
function wordFor(ch, words) {
  const self = words.find(w => w.hanzi === ch);
  const multi = words.filter(w => w.hanzi !== ch && w.hanzi.includes(ch) && w.hanzi.length <= 4 && !/[…]/.test(w.hanzi));
  multi.sort((a, b) => (!!b.example - !!a.example) || (a.hanzi.length - b.hanzi.length));
  const word = multi[0] || null;
  const ex = [word, self].map(w => w && w.example).find(e => e && e.zh.includes(ch)) || null;
  return { word, example: ex };
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// Radical forms like 氵 have no sound of their own in the voice, so Play reads a
// character with the same reading (氵 shuǐ -> 水).
const SPEAK = { "氵": "水", "亻": "人", "扌": "手", "艹": "草", "忄": "心", "辶": "绰", "讠": "言", "纟": "丝",
  "钅": "金", "饣": "食", "宀": "棉", "灬": "火", "衤": "衣", "王": "玉", "刂": "刀", "阝": "阜", "冫": "冰",
  "疒": "讷", "囗": "围", "犭": "犬", "礻": "示", "攵": "扑", "彳": "赤" };
const playBtn = t => `<button class="play" ontouchstart="warmUp()" onclick="say(${esc(JSON.stringify(t))})">Play</button>`;

function detailHTML(r, words) {
  const blocks = r.examples.map(e => {
    const f = wordFor(e.char, words);
    return `<div class="card">
<div class="row"><span class="ch">${esc(e.char)}</span><div><div class="py">${esc(e.pinyin)}</div><div class="mn">${esc(e.meaning)}</div></div>
<span class="sp"></span>${playBtn(e.char)}</div>
${f.word ? `<div class="word"><span class="label">Word</span> <b>${esc(f.word.hanzi)}</b> <span class="py">${esc(f.word.pinyin)}</span> <span class="mn">${esc(f.word.short)}</span> ${playBtn(f.word.hanzi)}</div>` : ""}
${f.example ? `<div class="ex"><div class="zh">${esc(f.example.zh)} ${playBtn(f.example.zh)}</div>
<div class="py">${esc(f.example.pinyin)}</div><div class="mn">${esc(f.example.en)}</div></div>` : ""}
</div>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
:root { --bg:#F5EFE3; --ink:#2B2118; --red:#A8392B; --grey:#6B5E50; --line:#E2D8C6; --card:#FBF7EF; }
@media (prefers-color-scheme: dark) { :root { --bg:#1E1A16; --ink:#F1E9DC; --red:#E07A5F; --grey:#B5A894; --line:#3A332B; --card:#28231E; } }
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
body { margin:0; padding:24px 20px 120px; background:var(--bg); color:var(--ink);
  font: 17px/1.45 -apple-system, "PingFang SC", sans-serif; }
.top { display:flex; align-items:center; gap:18px; }
.rad { font-size:84px; font-weight:700; line-height:1; }
.name { font-size:24px; font-weight:700; } .top .py { font-size:20px; }
.py { color:var(--red); font-weight:600; } .mn { color:var(--grey); }
h2 { font-size:13px; letter-spacing:1px; text-transform:uppercase; color:var(--grey); margin:26px 0 10px; font-weight:600; }
.card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:14px 16px; margin-bottom:12px; }
.row { display:flex; align-items:center; gap:14px; } .sp { flex:1; }
.ch { font-size:44px; font-weight:500; line-height:1.1; }
.word { margin-top:10px; padding-top:10px; border-top:1px solid var(--line); }
.word b { font-size:20px; font-weight:600; } .label { font-size:12px; text-transform:uppercase; letter-spacing:1px; color:var(--grey); }
.ex { margin-top:10px; border-left:3px solid var(--red); padding:2px 0 2px 12px; }
.ex .zh { font-size:20px; } .ex .py { font-size:15px; font-weight:500; }
.play { border:1px solid var(--line); background:var(--bg); color:var(--ink); border-radius:16px; padding:4px 12px; font-size:14px; vertical-align:middle; }
.bar { position:fixed; left:0; right:0; bottom:0; padding:12px 20px 34px; background:var(--bg); border-top:1px solid var(--line); }
.bar button { width:100%; font-size:17px; padding:14px; border-radius:14px; border:1px solid var(--line); background:var(--card); color:var(--ink); }
.foot { color:var(--grey); font-size:13px; margin-top:20px; }
</style></head><body>
<div class="top"><div class="rad">${esc(r.radical)}</div>
<div><div class="name">${esc(r.name)}</div><div class="py">${esc(r.pinyin)} ${playBtn(SPEAK[r.radical] || r.radical)}</div>${r.meaning ? `<div class="mn">${esc(r.meaning)}</div>` : ""}</div></div>
<h2>Characters with this radical</h2>
${blocks}
<div class="foot">${words.length ? "Words and sentences from your HSK lists (CC-CEDICT, Tatoeba)." : "Run Hourly Words once to get words and example sentences here."}</div>
<div class="bar"><button onclick="act('next')">Next radical</button></div>
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
  try { var u = new SpeechSynthesisUtterance(" "); u.volume = 0; u.lang = "zh-CN"; var v = zhVoice(); if (v) u.voice = v; speechSynthesis.speak(u); } catch (e) {}
}
document.addEventListener("touchstart", warmUp, { passive: true, capture: true });
function voice(t) {
  warmUp();
  if (keepAwake && keepAwake.paused) keepAwake.play().catch(function () {});
  if (!window.speechSynthesis) return;
  if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
  var u = new SpeechSynthesisUtterance(t); u.lang = "zh-CN"; u.rate = 0.85;
  var v = zhVoice(); if (v) u.voice = v;
  speechSynthesis.speak(u);
}
function say(t) {
  var now = Date.now(); if (now - lastSay < 400) return; lastSay = now;
  voice(t);
}
function act(a) { location.href = "hanzi://" + encodeURIComponent(a); }
</script></body></html>`;
}

// The page asks for "next" by opening hanzi://next; we catch it and load the next radical.
async function showDetail(start) {
  const words = await loadWords();
  const wv = new WebView();
  let k = start;
  const itemAt = n => ITEMS[shuffledOrder(Math.floor(n / ITEMS.length))[((n % ITEMS.length) + ITEMS.length) % ITEMS.length]];
  let busy = Promise.resolve();
  wv.shouldAllowRequest = req => {
    const u = String((req && req.url) || "");
    if (!u.startsWith("hanzi://")) return true;
    if (decodeURIComponent(u.slice(8)) === "next") {
      k += 1;
      busy = busy.then(() => wv.loadHTML(detailHTML(itemAt(k), words))).catch(e => console.log("next failed: " + e));
    }
    return false;
  };
  await wv.loadHTML(detailHTML(itemAt(k), words));
  await wv.present(true);
  await busy;
}

const NO_LIST = "Could not read the radicals list. Open Scriptable and run Radicals once with internet.";
if (!item) {
  // No list yet (no internet, or iCloud still syncing): a short note instead of an error.
  if (config.runsInWidget || config.runsInAccessoryWidget) {
    const lw = new ListWidget();
    lw.backgroundColor = BG;
    const t = lw.addText(NO_LIST);
    t.font = Font.systemFont(13);
    t.textColor = INK;
    lw.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
    Script.setWidget(lw);
  } else {
    const al = new Alert();
    al.title = "Radicals";
    al.message = NO_LIST;
    al.addAction("OK");
    await al.present();
  }
} else if (config.runsInWidget || config.runsInAccessoryWidget) {
  Script.setWidget(buildWidget(item, config.widgetFamily));
} else {
  // Run in the app or tapped from the widget: open the detail page.
  // From the widget, start at the radical it showed (it may be from an older slot).
  const want = args.queryParameters && args.queryParameters.radical;
  let start = slot;
  if (want) {
    for (let n = slot; n > slot - ITEMS.length * 2; n--) {
      if (ITEMS[shuffledOrder(Math.floor(n / ITEMS.length))[n % ITEMS.length]].radical === want) { start = n; break; }
    }
  }
  console.log(ITEMS.length + " radicals loaded. Now: " + item.radical + " " + item.name);
  await showDetail(start);
}
Script.complete();
