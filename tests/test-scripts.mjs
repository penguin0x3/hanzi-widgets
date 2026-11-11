// Tests for Hourly Words, Add Word and Install with fake Scriptable APIs.
// Run from the repo root: node tests/test-scripts.mjs
// "GitHub" is this repo folder, "iCloud Drive > Scriptable" is a temp folder.
import fs from "fs";
import os from "os";
import path from "path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const REPO = "https://raw.githubusercontent.com/0xpenguin2/hanzi-widgets/main/";
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
let fails = 0;
const check = (name, ok) => { console.log((ok ? "PASS " : "FAIL ") + name); if (!ok) fails++; };

function newDir() { return fs.mkdtempSync(path.join(os.tmpdir(), "scriptable-")); }

// opts: { dir, family, widget, param, query, shared, alerts: [answers], web: [actions], offline }
async function run(file, opts) {
  const src = fs.readFileSync(path.join(ROOT, "scriptable", file), "utf8");
  const out = { texts: [], alerts: [], speak: [], html: [], allowed: [], requests: 0 };
  const answers = [...(opts.alerts || [])];
  const webActions = [...(opts.web || [])];
  const mkStack = () => ({
    addText(t) { out.texts.push(t); return { centerAlignText() {} }; },
    addStack() { return mkStack(); }, addSpacer() {}, centerAlignContent() {}, layoutVertically() {}, setPadding() {},
  });
  class ListWidget { constructor() { Object.assign(this, mkStack()); } }
  class Alert {
    constructor() { this.actions = []; this.fields = []; }
    addAction(a) { this.actions.push(a); } addCancelAction(a) { this.cancel = a; }
    addTextField(p, v) { this.fields.push(v || ""); }
    textFieldValue(i) { return this.fields[i]; }
    async present() { return this._answer(); } async presentSheet() { return this._answer(); }
    _answer() {
      out.alerts.push({ title: this.title, message: this.message, actions: this.actions, fields: [...this.fields] });
      let a = answers.length ? answers.shift() : -1;
      if (typeof a === "function") a = a(this);
      if (typeof a === "string") a = this.actions.findIndex(x => x.includes(a));
      return a;
    }
  }
  class Request {
    constructor(url) { this.url = url; }
    async loadString() {
      out.requests++;
      if (opts.offline) throw new Error("offline");
      const rel = decodeURIComponent(this.url.replace(REPO, ""));
      const p = path.join(ROOT, rel);
      if (!this.url.startsWith(REPO) || !fs.existsSync(p)) { this.response = { statusCode: 404 }; return "404: Not Found"; }
      this.response = { statusCode: 200 };
      return fs.readFileSync(p, "utf8");
    }
  }
  class WebView {
    async loadHTML(h) { out.html.push(h); }
    async evaluateJavaScript() {}
    async present() { // the user taps the page buttons, then Close
      for (const a of webActions) {
        const allowed = this.shouldAllowRequest({ url: "hanzi://" + encodeURIComponent(a) });
        out.allowed.push(allowed);
        await new Promise(r => setTimeout(r, 5));
      }
    }
  }
  const env = {
    FileManager: { iCloud: () => ({
      documentsDirectory: () => opts.dir, joinPath: (a, b) => path.join(a, b),
      fileExists: p => fs.existsSync(p), downloadFileFromiCloud: async () => {},
      readString: p => fs.readFileSync(p, "utf8"), writeString: (p, s) => fs.writeFileSync(p, s),
      modificationDate: p => fs.statSync(p).mtime,
    }) },
    Font: { systemFont: s => s, boldSystemFont: s => s, semiboldSystemFont: s => s, mediumSystemFont: s => s },
    Color: class {}, Size: class {}, ListWidget, Alert, Request, WebView,
    Speech: { speak: t => out.speak.push(t) },
    config: { runsInWidget: !!opts.widget, runsInAccessoryWidget: false, widgetFamily: opts.family || null },
    args: { widgetParameter: opts.param || null, queryParameters: opts.query || {}, plainTexts: opts.shared ? [opts.shared] : [] },
    Script: { name: () => file.replace(/\.js$/, ""), setWidget: w => { out.widget = w; }, complete() {} },
    console: { log() {} },
  };
  const names = Object.keys(env);
  await new AsyncFunction(...names, src)(...names.map(n => env[n]));
  return out;
}
const read = (dir, f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));

// ---------- data ----------
for (const lv of ["hsk1-2", "hsk3", "hsk4", "hsk5"]) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, "data", lv + ".json"), "utf8"));
  check(`${lv}: every word has hanzi, pinyin, short and senses`,
    d.words.length > 100 && d.words.every(w => w.hanzi && w.pinyin && w.short && w.senses.length));
  check(`${lv}: every short meaning fits the Lock Screen (30 chars, no "...")`,
    d.words.every(w => w.short.length <= 30 && (!w.short.endsWith("...") || w.hanzi.includes("…"))));
  check(`${lv}: no duplicate words`, new Set(d.words.map(w => w.hanzi)).size === d.words.length);
  check(`${lv}: most words have an example`, d.words.filter(w => w.example).length / d.words.length > 0.85);
}

// ---------- Install ----------
let dir = newDir();
let o = await run("Install.js", { dir, alerts: [0, 0] });
check("Install downloads 4 files and the HSK1-2 list",
  ["Hourly Words.js", "Radicals.js", "Add Word.js", "radicals.txt", "hsk1-2.json"].every(f => fs.existsSync(path.join(dir, f))));
check("Install reports success", o.alerts[1].title === "Installed");
o = await run("Install.js", { dir: newDir(), alerts: [0, 0], offline: true });
check("Install offline reports failure", o.alerts[1].title === "Some files failed");

// ---------- Hourly Words widget ----------
dir = newDir();
o = await run("Hourly Words.js", { dir, widget: true, family: "accessoryRectangular" });
check("first widget run downloads HSK1-2 by itself", fs.existsSync(path.join(dir, "hsk1-2.json")));
check("widget shows a word with pinyin and meaning", o.texts.length >= 3 && o.texts.every(t => t && t.trim()));
check("widget opens the detail page on tap", /^scriptable:\/\/\/run\/Hourly%20Words\?word=/.test(o.widget.url));
const firstWord = decodeURIComponent(o.widget.url.match(/word=([^&]+)/)[1]);
check("shown word is marked as seen", read(dir, "hanzi-progress.json").seen[firstWord] === 1);

o = await run("Hourly Words.js", { dir, widget: true, family: "accessoryRectangular", param: "hsk4" });
const hsk4 = new Set(read(dir, "hsk4.json").words.map(w => w.hanzi));
check("Parameter hsk4 shows an HSK4 word", hsk4.has(decodeURIComponent(o.widget.url.match(/word=([^&]+)/)[1])));
check("Parameter levels go into the tap link", o.widget.url.includes("levels=hsk4"));

let offlineDir = newDir();
o = await run("Hourly Words.js", { dir: offlineDir, widget: true, family: "small", offline: true });
check("offline with no saved list shows a clear message", o.texts.join(" ").includes("No words yet"));
o = await run("Hourly Words.js", { dir, widget: true, family: "small", offline: true });
check("offline with a saved list still shows a word", !!o.widget.url);

// old copy (8 days) is downloaded again; fresh copy is not
const p12 = path.join(dir, "hsk1-2.json");
fs.utimesSync(p12, new Date(Date.now() - 8 * 86400000), new Date(Date.now() - 8 * 86400000));
o = await run("Hourly Words.js", { dir, widget: true, family: "small" });
check("a list older than 7 days is downloaded again", o.requests === 1 && Date.now() - fs.statSync(p12).mtimeMs < 60000);
o = await run("Hourly Words.js", { dir, widget: true, family: "small" });
check("a fresh list is not downloaded again", o.requests === 0);

for (const f of ["accessoryInline", "accessoryCircular", "accessoryRectangular", "small", "medium", "large"]) {
  o = await run("Hourly Words.js", { dir, widget: true, family: f });
  check("family " + f + " builds with refresh date", o.widget && o.widget.refreshAfterDate instanceof Date && o.texts.length > 0);
}

// every word once before repeats (deck), with no known words
dir = newDir();
fs.copyFileSync(path.join(ROOT, "data", "hsk3.json"), path.join(dir, "hsk3.json"));
const n3 = read(dir, "hsk3.json").words.length;
const shown = new Set();
for (let i = 0; i < n3; i++) {
  const s = fs.existsSync(path.join(dir, "hanzi-widget-state.json")) ? read(dir, "hanzi-widget-state.json") : {};
  if (s.hsk3) { s.hsk3.until = 0; fs.writeFileSync(path.join(dir, "hanzi-widget-state.json"), JSON.stringify(s)); }
  o = await run("Hourly Words.js", { dir, widget: true, family: "small", param: "hsk3" });
  shown.add(decodeURIComponent(o.widget.url.match(/word=([^&]+)/)[1]));
}
check(`every HSK3 word shows once in ${n3} refreshes`, shown.size === n3);

// known words show much less often
const words3 = read(dir, "hsk3.json").words.map(w => w.hanzi);
const known = Object.fromEntries(words3.slice(0, 150).map(h => [h, 1]));
fs.writeFileSync(path.join(dir, "hanzi-progress.json"), JSON.stringify({ known, seen: {} }));
fs.unlinkSync(path.join(dir, "hanzi-widget-state.json"));
let knownShown = 0;
for (let i = 0; i < 150; i++) {
  const s = fs.existsSync(path.join(dir, "hanzi-widget-state.json")) ? read(dir, "hanzi-widget-state.json") : {};
  if (s.hsk3) { s.hsk3.until = 0; fs.writeFileSync(path.join(dir, "hanzi-widget-state.json"), JSON.stringify(s)); }
  o = await run("Hourly Words.js", { dir, widget: true, family: "small", param: "hsk3" });
  if (known[decodeURIComponent(o.widget.url.match(/word=([^&]+)/)[1])]) knownShown++;
}
check(`known words show rarely (${knownShown} of 150 refreshes)`, knownShown < 40);

// my words are included and survive updates
dir = newDir();
fs.writeFileSync(path.join(dir, "mywords.txt"), "# My words\n螺蛳粉 | luósīfěn | river snail rice noodles\n");
fs.writeFileSync(path.join(dir, "hanzi-settings.json"), JSON.stringify({ levels: ["hsk3"] }));
o = await run("Hourly Words.js", { dir, query: { word: "螺蛳粉" }, web: [] });
check("tap link opens a detail page for my own word", o.html.length === 1 && o.html[0].includes("螺蛳粉") && o.html[0].includes("river snail"));
await run("Hourly Words.js", { dir, alerts: ["Update", 0, -1] });
check("updating lists keeps mywords.txt", fs.readFileSync(path.join(dir, "mywords.txt"), "utf8").includes("螺蛳粉"));

// ---------- detail page ----------
dir = newDir();
o = await run("Hourly Words.js", { dir, query: { word: "晚上", levels: "hsk1-2" }, web: ["known", "next", "speak:晚上"] });
const page = o.html[0];
check("detail page has meanings, measure word and example", page.includes("evening") && page.includes("Measure word") && page.includes("晚上好"));
check("detail page has a Play button", page.includes("say("));
check("Mark known saves the word", read(dir, "hanzi-progress.json").known["晚上"] === 1);
check("Next word loads another word", o.html.length === 2 && !o.html[1].includes('<div class="hanzi">晚上</div>'));
check("speech fallback uses Speech.speak", o.speak[0] === "晚上");
o = await run("Hourly Words.js", { dir, query: { word: "晚上", levels: "hsk1-2" }, web: ["known"] });
check("Mark known again undoes it", !read(dir, "hanzi-progress.json").known["晚上"]);
check("page actions are caught and the page stays open", o.allowed.length === 1 && o.allowed[0] === false);
check("detail page does not use the callback loop", !page.includes("__wait") && page.includes('location.href = "hanzi://"'));
check("Mark known button updates on the page", page.includes("toggleKnown()"));
check("detail page escapes HTML", !/<li>[^<]*<script/.test(page));

// ---------- menu ----------
dir = newDir();
o = await run("Hourly Words.js", { dir, alerts: ["Choose levels", "HSK 4", "HSK 1-2", -1, 0, -1] });
check("Choose levels saves HSK4 only", JSON.stringify(read(dir, "hanzi-settings.json").levels) === '["hsk4"]');
check("Choose levels downloads the new level", fs.existsSync(path.join(dir, "hsk4.json")));
o = await run("Hourly Words.js", { dir, alerts: ["Choose levels", "HSK 4", -1, 0, -1] });
check("the last level cannot be turned off", JSON.stringify(read(dir, "hanzi-settings.json").levels) === '["hsk4"]');
o = await run("Hourly Words.js", { dir, widget: true, family: "small" });
check("widget follows the saved levels", hsk4.has(decodeURIComponent(o.widget.url.match(/word=([^&]+)/)[1])));
o = await run("Hourly Words.js", { dir, alerts: ["Progress", 0, -1] });
check("Progress lists every level", /HSK 4: seen 1 of \d+/.test(o.alerts[1].message) && o.alerts[1].message.includes("HSK 5: not downloaded"));
o = await run("Hourly Words.js", { dir, alerts: ["Show a word", -1] });
check("Show a word opens a detail page", o.html.length === 1);

// ---------- Add Word ----------
dir = newDir();
o = await run("Add Word.js", { dir, shared: "我是一个学生。", alerts: [0, 0] });
check("shared text: first Chinese run is used", o.alerts[0].fields[0] === "我是一个学生");
dir = newDir();
o = await run("Add Word.js", { dir, shared: "学生", alerts: [0, 0] });
check("Add Word downloads the dictionary", fs.existsSync(path.join(dir, "dict.txt")));
check("Add Word fills in pinyin and meaning", o.alerts[0].fields[1] === "xuésheng" && o.alerts[0].fields[2].includes("student"));
check("Add Word saves to mywords.txt", /学生 \| xuésheng \| student/.test(fs.readFileSync(path.join(dir, "mywords.txt"), "utf8")));
fs.copyFileSync(path.join(ROOT, "data", "hsk1-2.json"), path.join(dir, "hsk1-2.json"));
o = await run("Add Word.js", { dir, shared: "学生", alerts: [-1] });
check("Add Word warns when the word is already in a list", o.alerts[0].title.includes("already in"));
o = await run("Add Word.js", { dir, alerts: [a => { a.fields[0] = "螺蛳粉"; return 0; }, 0, 0] });
check("Add Word without shared text asks for the word", o.alerts[0].title === "Add a word" && o.alerts[1].title === "螺蛳粉");
o = await run("Add Word.js", { dir: newDir(), shared: "螺蛳粉", offline: true, alerts: [a => { a.fields[1] = "luósīfěn"; a.fields[2] = "snail noodles"; return 0; }, 0] });
check("offline Add Word still lets you type pinyin and meaning", o.alerts[0].message.includes("Not in the dictionary"));

process.exit(fails ? 1 : 0);
