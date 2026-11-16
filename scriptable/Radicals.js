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
const BG = Color.dynamic(new Color("#EEF7E8"), new Color("#0E1F16"));
const INK = Color.dynamic(new Color("#000000"), new Color("#FFFFFF"));
const RED = Color.dynamic(new Color("#108652"), new Color("#97DF67")); // accent (pinyin)
const GREY = Color.dynamic(new Color("#5F665F"), new Color("#9DA39D"));

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
      for (const w of JSON.parse(fm.readString(p)).words || []) words.push(Object.assign({ level: lv }, w));
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
const playBtn = t => `<button class="play" ontouchstart="warmUp()" onclick="say(${esc(JSON.stringify(t))})">Listen</button>`;
// Write opens the Write script on this one character (see openWrite).
const writeBtn = (c, py, mn) => `<button class="play" onclick="act(${esc(JSON.stringify("write:" + JSON.stringify([c, py || "", mn || ""])))})">Write</button>`;

function detailHTML(r, words) {
  const blocks = r.examples.map(e => {
    const f = wordFor(e.char, words);
    return `<div class="card">
<div class="row"><span class="ch" data-look>${esc(e.char)}</span><div><div class="py">${esc(e.pinyin)}</div><div class="mn">${esc(e.meaning)}</div></div>
<span class="sp"></span>${playBtn(e.char)} ${writeBtn(e.char, e.pinyin, e.meaning)}</div>
${f.word ? `<div class="word"><span class="label">Word</span> <b data-look>${esc(f.word.hanzi)}</b> <span class="py">${esc(f.word.pinyin)}</span> <span class="mn">${esc(f.word.short)}</span></div>` : ""}
${f.example ? `<div class="ex"><div class="zh" data-look>${esc(f.example.zh)}</div>
<div class="py">${esc(f.example.pinyin)}</div><div class="mn">${esc(f.example.en)}</div></div>` : ""}
</div>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
:root { --bg:#EEF7E8; --ink:#000000; --accent:#108652; --grey:#5F665F; --line:#D3E4CA; --card:#FFFFFF; --soft:#97DF67; --on:#FFFFFF; --bad:#C0392B; --ok:#108652; }
@media (prefers-color-scheme: dark) { :root { --bg:#0E1F16; --ink:#FFFFFF; --accent:#97DF67; --grey:#9DA39D; --line:#2F4A39; --card:#16291E; --soft:#108652; --on:#000000; --bad:#FF7A6B; --ok:#97DF67; } }
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
body { margin:0; padding:24px 20px 120px; background:var(--bg); color:var(--ink);
  font: 17px/1.45 -apple-system, "PingFang SC", sans-serif; }
.top { display:flex; align-items:center; gap:18px; }
.rad { font-size:84px; font-weight:700; line-height:1; }
.name { font-size:24px; font-weight:700; } .top .py { font-size:20px; }
.py { color:var(--accent); font-weight:600; } .mn { color:var(--grey); }
h2 { font-size:13px; letter-spacing:1px; text-transform:uppercase; color:var(--grey); margin:26px 0 10px; font-weight:600; }
.card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:14px 16px; margin-bottom:12px; }
.row { display:flex; align-items:center; gap:14px; } .sp { flex:1; }
.ch { font-size:44px; font-weight:500; line-height:1.1; }
.word { margin-top:10px; padding-top:10px; border-top:1px solid var(--line); }
.word b { font-size:20px; font-weight:600; } .label { font-size:12px; text-transform:uppercase; letter-spacing:1px; color:var(--grey); }
.ex { margin-top:10px; border-left:3px solid var(--accent); padding:2px 0 2px 12px; }
.ex .zh { font-size:20px; } .ex .py { font-size:15px; font-weight:500; }
.play { border:1px solid var(--line); background:var(--bg); color:var(--ink); border-radius:16px; padding:4px 12px; font-size:14px; vertical-align:middle; }
.bar { position:fixed; left:0; right:0; bottom:0; padding:12px 20px 34px; background:var(--bg); border-top:1px solid var(--line); }
.bar button { width:100%; font-size:17px; padding:14px; border-radius:14px; border:1px solid var(--line); background:var(--card); color:var(--ink); }
.foot { color:var(--grey); font-size:13px; margin-top:20px; }
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
<div class="top"><div class="rad" data-look>${esc(r.radical)}</div>
<div><div class="name">${esc(r.name)}</div><div class="py">${esc(r.pinyin)} ${playBtn(SPEAK[r.radical] || r.radical)} ${writeBtn(r.radical, r.pinyin, r.meaning || r.name)}</div>${r.meaning ? `<div class="mn">${esc(r.meaning)}</div>` : ""}</div></div>
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

// Write button: run the Write script on one character. Write keeps your place in its own list.
function openWrite(a) {
  let p = [];
  try { p = JSON.parse(a.slice(6)); } catch (e) { return; }
  Safari.open("scriptable:///run/" + encodeURIComponent("Write") + "?word=" + encodeURIComponent(p[0] || "") +
    "&pinyin=" + encodeURIComponent(p[1] || "") + "&meaning=" + encodeURIComponent(p[2] || ""));
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
// The radicals.txt line for a radical: { name, pinyin, examples }.
async function radicalInfo(word) {
  try {
    const fd = FileManager.iCloud(), p = fd.joinPath(fd.documentsDirectory(), "radicals.txt");
    if (!fd.fileExists(p)) return null;
    await fd.downloadFileFromiCloud(p);
    for (const l of fd.readString(p).split(/\r?\n/)) {
      const q = l.trim().split(/\s*[|\t]\s*/);
      if (q[0] === word && !l.trim().startsWith("#")) return { pinyin: q[1] || "", name: q[2] || "", examples: (q[4] || "").split(";").map(e => e.trim()).filter(Boolean) };
    }
  } catch (e) {}
  return null;
}
function exploreHTML(word, words, dict, rad) {
  const entries = dict ? dictEntries(dict, word) : [];
  const own = words.find(w => w.hanzi === word);
  const pinyin = own ? own.pinyin : (entries[0] || {}).pinyin || "";
  const senses = own && own.senses && own.senses.length ? own.senses : entries.length ? entries[0].meaning.split(/;\s*/) : [];
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
${rad ? `<h2>Radical</h2><div>${lookEsc(rad.name)} <span class="py">${lookEsc(rad.pinyin)}</span></div>${rad.examples.length ? `<div class="mn" data-look>${lookEsc(rad.examples.join(" · "))}</div>` : ""}` : ""}
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
    const a = decodeURIComponent(u.slice(8));
    if (a.startsWith("write:")) openWrite(a);
    else if (a.startsWith("look:")) busy = busy.then(() => showLook(wv, a)).catch(e => console.log("look failed: " + e));
    else if (a.startsWith("speak:")) Speech.speak(a.slice(6));
    else if (a.startsWith("explore:")) busy = busy.then(() => exploreTo(wv, a.slice(8), words)).catch(e => console.log("explore failed: " + e));
    else if (a === "xback") busy = busy.then(() => exploreBack(wv, words, () => detailHTML(itemAt(k), words))).catch(e => console.log("back failed: " + e));
    else if (a === "next") {
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
