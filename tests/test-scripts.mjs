// Tests for Hourly Words, Add Word and Install with fake Scriptable APIs.
// Run from the repo root: node tests/test-scripts.mjs
// "GitHub" is this repo folder, "iCloud Drive > Scriptable" is a temp folder.
import fs from "fs";
import os from "os";
import path from "path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const REPO = "https://raw.githubusercontent.com/penguin0x3/hanzi-widgets/main/";
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
let fails = 0;
const check = (name, ok) => { console.log((ok ? "PASS " : "FAIL ") + name); if (!ok) fails++; };

function newDir() { return fs.mkdtempSync(path.join(os.tmpdir(), "scriptable-")); }

// opts: { dir, family, widget, param, query, shared, alerts: [answers], web: [actions], offline }
async function run(file, opts) {
  const src = fs.readFileSync(path.join(ROOT, "scriptable", file), "utf8");
  const out = { texts: [], alerts: [], speak: [], html: [], allowed: [], requests: 0, opened: [] };
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
      if (this.url.startsWith("https://cdn.jsdelivr.net/")) { // fake Hanzi Writer library and stroke data
        this.response = { statusCode: 200 };
        if (this.url.includes("hanzi-writer.min.js")) return "window.HanziWriter = {}; // HanziWriter";
        return JSON.stringify({ strokes: ["M 0 0 L 9 9"], medians: [[[0, 0], [9, 9]]], src: decodeURIComponent(this.url.split("/").pop()) });
      }
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
      modificationDate: p => fs.statSync(p).mtime, createDirectory: p => fs.mkdirSync(p, { recursive: true }),
    }) },
    Font: { systemFont: s => s, boldSystemFont: s => s, semiboldSystemFont: s => s, mediumSystemFont: s => s },
    Color: class {}, Size: class {}, ListWidget, Alert, Request, WebView,
    Speech: { speak: t => out.speak.push(t) },
    Safari: { open: u => out.opened.push(u) },
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
check("Install downloads 6 files and the HSK1-2 list",
  ["Hourly Words.js", "Radicals.js", "Add Word.js", "Write.js", "Write 2.js", "radicals.txt", "hsk1-2.json"].every(f => fs.existsSync(path.join(dir, f))));
check("Install reports success", o.alerts[1].title === "Installed");
check("Install updates itself", fs.readFileSync(path.join(dir, "Install.js"), "utf8") === fs.readFileSync(path.join(ROOT, "scriptable", "Install.js"), "utf8"));
check("Install takes the file list from files.txt", fs.readFileSync(path.join(ROOT, "scriptable", "files.txt"), "utf8").split("\n").filter(l => l && !l.startsWith("#")).every(f => fs.existsSync(path.join(dir, f))));
check("Install does not list itself in the first message", !o.alerts[0].message.includes("Install.js"));
o = await run("Install.js", { dir: newDir(), alerts: [0, 0], offline: true });
check("Install offline reports failure", o.alerts[1].title === "Some files failed");

// ---------- Hourly Words widget ----------
dir = newDir();
o = await run("Hourly Words.js", { dir, widget: true, family: "accessoryRectangular" });
check("first widget run downloads HSK1-2 by itself", fs.existsSync(path.join(dir, "hsk1-2.json")));
check("widget shows a word with pinyin and meaning", o.texts.length >= 2 && o.texts.join(" ").includes(" ") && o.texts.every(t => t && t.trim()));
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
check("Play uses the iPhone voice, no recorded audio", !page.includes("data-say") && !page.includes("main/audio/") && page.includes("function voice("));
check("Mark known saves the word", read(dir, "hanzi-progress.json").known["晚上"] === 1);
check("Next word loads another word", o.html.length === 2 && !o.html[1].includes('<div class="hanzi">晚上</div>'));
check("speech fallback uses Speech.speak", o.speak[0] === "晚上");
o = await run("Hourly Words.js", { dir, query: { word: "晚上", levels: "hsk1-2" }, web: ["known"] });
check("Mark known again undoes it", !read(dir, "hanzi-progress.json").known["晚上"]);
check("page actions are caught and the page stays open", o.allowed.length === 1 && o.allowed[0] === false);
check("detail page does not use the callback loop", !page.includes("__wait") && page.includes('location.href = "hanzi://"'));
check("Mark known button updates on the page", page.includes("toggleKnown()"));
check("detail page escapes HTML", !/<li>[^<]*<script/.test(page));
check("detail page has one Listen, for the word, not the example", (page.match(/>Listen<\/button>/g) || []).length === 1 && !page.includes(">Play</button>"));
check("detail page has one Write button, for the word", (page.match(/>Write<\/button>/g) || []).length === 1);
o = await run("Hourly Words.js", { dir, query: { word: "晚上", levels: "hsk1-2" }, web: ['write:["晚上","wǎnshang","evening"]'] });
check("Write button opens the Write script on that word", o.opened.length === 1 && o.opened[0].startsWith("scriptable:///run/Write?word=" + encodeURIComponent("晚上") + "&pinyin=") && o.allowed[0] === false);

// ---------- review of tapped words ----------
dir = newDir();
fs.writeFileSync(path.join(dir, "hanzi-settings.json"), JSON.stringify({ levels: ["hsk3"] }));
const DAY = 24 * 60 * 60 * 1000;
const setProgress = f => { const p = read(dir, "hanzi-progress.json"); f(p); fs.writeFileSync(path.join(dir, "hanzi-progress.json"), JSON.stringify(p)); };
const expire = () => { const p = path.join(dir, "hanzi-widget-state.json"); if (fs.existsSync(p)) { const s = read(dir, "hanzi-widget-state.json"); if (s.hsk3) s.hsk3.until = 0; fs.writeFileSync(p, JSON.stringify(s)); } };
const widgetWord = async () => { expire(); const r = await run("Hourly Words.js", { dir, widget: true, family: "accessoryRectangular" }); return decodeURIComponent(r.widget.url.match(/word=([^&]+)/)[1]); };
const rw = (await widgetWord());
await run("Hourly Words.js", { dir, query: { word: rw, levels: "hsk3" }, web: [] });
let rv = read(dir, "hanzi-progress.json").review[rw];
check("tapping the widget word puts it in review for 1 day", rv && rv.step === 0 && Math.abs(rv.due - Date.now() - DAY) < 60000);
let early = 0;
for (let i = 0; i < 20; i++) if ((await widgetWord()) === rw) early++;
check("a review word does not come back before its day", early <= 1);
setProgress(p => { p.review[rw].due = Date.now() - 1000; });
check("a due review word shows at the next refresh", (await widgetWord()) === rw);
check("a shown review word waits for a tap", read(dir, "hanzi-progress.json").review[rw].due === 0);
await run("Hourly Words.js", { dir, query: { word: rw, levels: "hsk3" }, web: [] });
rv = read(dir, "hanzi-progress.json").review[rw];
check("tapping it again waits 3 days", rv.step === 1 && Math.abs(rv.due - Date.now() - 3 * DAY) < 60000);
await run("Hourly Words.js", { dir, query: { word: rw, levels: "hsk3" }, web: [] });
check("a second tap on the same day does not skip a step", read(dir, "hanzi-progress.json").review[rw].step === 1);
setProgress(p => { p.review[rw] = { step: 2, due: 0, shown: Date.now() }; });
await run("Hourly Words.js", { dir, query: { word: rw, levels: "hsk3" }, web: [] });
check("the wait stops growing at 7 days", read(dir, "hanzi-progress.json").review[rw].step === 2);
setProgress(p => { p.review[rw] = { step: 1, due: 0, shown: Date.now() - 2 * DAY }; });
await widgetWord();
check("a review word not tapped leaves the review list", !read(dir, "hanzi-progress.json").review[rw]);
await run("Hourly Words.js", { dir, query: { word: rw, levels: "hsk3" }, web: ["known"] });
setProgress(p => { p.review[rw].due = Date.now() - 1000; });
await widgetWord();
check("a known word leaves the review list", !read(dir, "hanzi-progress.json").review[rw]);
o = await run("Hourly Words.js", { dir, query: { word: rw, levels: "hsk3" }, web: [] });
check("tapping a known word does not add it to review", !read(dir, "hanzi-progress.json").review[rw]);
o = await run("Hourly Words.js", { dir, query: { word: rw, levels: "hsk3" }, web: ["known", "next"] });
const nextW = (o.html[1].match(/<div class="hanzi">([^<]+)<\/div>/) || [])[1];
check("Next word on the page is not added to review", nextW && !read(dir, "hanzi-progress.json").review[nextW]);

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

// ---------- Write (path: radicals, then simple words) ----------
check("Write and Write 2 differ only in MODE", (() => {
  const a = fs.readFileSync(path.join(ROOT, "scriptable", "Write.js"), "utf8").split("\n");
  const b = fs.readFileSync(path.join(ROOT, "scriptable", "Write 2.js"), "utf8").split("\n");
  const diff = a.map((l, i) => l === b[i] ? null : l + " / " + b[i]).filter(Boolean);
  return a.length === b.length && diff.length === 1 && diff[0].includes('MODE = "path"') && diff[0].includes('MODE = "random"');
})());
const pathItems = fs.readFileSync(path.join(ROOT, "scriptable", "write-path.txt"), "utf8").split("\n").filter(l => l.trim() && !l.startsWith("#")).map(l => l.split("|")[0].trim());
check("write-path.txt starts with 20 radicals, then 你好 and 谢谢 come early", pathItems.length > 60 && pathItems[0] === "人" && pathItems[19] === "艹" && pathItems.indexOf("谢谢") < 35);
check("write-path.txt has no duplicates", new Set(pathItems).size === pathItems.length);
dir = newDir();
const firstChars = item => "CHARS = " + JSON.stringify(Array.from(item));
o = await run("Write.js", { dir, web: ["next", "next"] });
check("Write starts with the first radical 人", o.html[0].includes(firstChars("人")) && o.html[0].includes("Person"));
check("Write path has no level tag at the top", !o.html[0].includes('class="lv"'));
check("Next goes through the path in order", o.html[1].includes(firstChars(pathItems[1])) && o.html[2].includes(firstChars(pathItems[2])));
check("Write remembers where you stopped", read(dir, "hanzi-write-path.json").pos === 2);
o = await run("Write.js", { dir, web: ["done:" + pathItems[2]] });
check("Write opens where you stopped", o.html[0].includes(firstChars(pathItems[2])));
check("finishing an item moves to the next one", read(dir, "hanzi-write-path.json").pos === 3);
o = await run("Write.js", { dir, web: ["done:" + pathItems[3], "next"] });
check("Next after finishing does not skip an item", o.html[1].includes(firstChars(pathItems[4])) && read(dir, "hanzi-write-path.json").pos === 4);
check("Write path keeps its own progress file", !fs.existsSync(path.join(dir, "hanzi-write.json")) && !fs.existsSync(path.join(dir, "hanzi-progress.json")));
fs.writeFileSync(path.join(dir, "hanzi-write-path.json"), JSON.stringify({ done: {}, deck: [], pos: pathItems.length - 1 }));
o = await run("Write.js", { dir, web: ["next"] });
check("after the last item the path starts again", o.html[1].includes(firstChars(pathItems[0])));
const posBefore = read(dir, "hanzi-write-path.json").pos;
o = await run("Write.js", { dir, query: { word: "螃蟹", pinyin: "pángxiè", meaning: "crab" }, web: ["done:螃蟹", "next"] });
check("Write ?word= shows that word, even if it is not in the list", o.html[0].includes(firstChars("螃蟹")) && o.html[0].includes("crab") && o.html[0].includes("pángxiè"));
check("a single word does not move your place in the list", read(dir, "hanzi-write-path.json").pos === posBefore);
check("Next after a single word goes back to your place", o.html[1].includes(firstChars(pathItems[posBefore])));
check("Write page says Listen", o.html[0].includes(">Listen</button>"));
o = await run("Write.js", { dir, offline: true });
check("Write path works offline with the saved list", o.html.length === 1 && o.html[0].includes("CHARS = "));
o = await run("Write.js", { dir: newDir(), offline: true });
check("Write path offline the first time: a clear message", o.alerts.length === 1 && o.alerts[0].message.includes("needs the internet"));

// ---------- Write 2 (random words from your levels) ----------
dir = newDir();
fs.copyFileSync(path.join(ROOT, "data", "hsk1-2.json"), path.join(dir, "hsk1-2.json"));
fs.writeFileSync(path.join(dir, "hanzi-settings.json"), JSON.stringify({ levels: ["hsk1-2"] }));
fs.writeFileSync(path.join(dir, "hanzi-progress.json"), JSON.stringify({ known: { "我": 1 }, seen: {}, review: { "你": { step: 0, due: 1 } } }));
const shared = ["hsk1-2.json", "hanzi-settings.json", "hanzi-progress.json"].map(f => fs.readFileSync(path.join(dir, f), "utf8"));
o = await run("Write 2.js", { dir, query: { word: "谢谢" }, web: ["done:谢谢", "next", "speak:谢谢"] });
let wp = o.html[0];
check("Write opens a page for the word", o.html.length >= 1 && wp.includes("xièxie") && wp.includes("to thank"));
check("Write page has the library and stroke data inside", wp.includes("// HanziWriter") && wp.includes('"src":"谢.json"') && wp.includes('CHARS = ["谢","谢"]'));
check("Write page has the grid, Hint, Show strokes and Play", wp.includes('class="grid"') && wp.includes(">Hint<") && wp.includes(">Show strokes<") && wp.includes("say("));
check("Write page has 3 rounds and the last round has no outline", wp.includes("ROUNDS = 3") && wp.includes("showOutline: round < ROUNDS && !finished"));
check("Write page puts every character of the word in one row", wp.includes('id="pads"') && wp.includes("CHARS.map(function (c, i)") && wp.includes("(w - gap * (n - 1)) / n"));
check("Write page asks to turn the phone for words of 3+ characters", wp.includes("CHARS.length >= 3") && wp.includes("Turn your phone sideways"));
check("tapping another box plays its stroke order", wp.includes("function tapPad(i)") && wp.includes('.onclick = function () { tapPad(i); }'));
check("Show strokes plays the whole word", wp.includes("(function play(i)") && wp.includes("play(i + 1)"));
check("Hint in the last round shows the outline for 3 seconds", wp.includes("w.hideOutline(); }, 3000)") && wp.includes("Outline shown for 3 seconds."));
check("Write page grows the boxes when the phone turns", wp.includes('addEventListener("resize"') && wp.includes("@media (orientation: landscape)"));
check("Write saves a written word in hanzi-write.json", read(dir, "hanzi-write.json").done["谢谢"] === 1);
check("Next word loads another word", o.html.length === 2 && !o.html[1].includes("xièxie"));
check("Write Play falls back to Speech.speak", o.speak[0] === "谢谢");
check("page actions are caught and the page stays open", o.allowed.every(a => a === false));
check("Write saves stroke data in the hanzi-write folder", fs.existsSync(path.join(dir, "hanzi-write", "hanzi-writer.min.js")) && fs.existsSync(path.join(dir, "hanzi-write", "c8c22.json")));
check("Write does not change shared files", ["hsk1-2.json", "hanzi-settings.json", "hanzi-progress.json"].every((f, i) => fs.readFileSync(path.join(dir, f), "utf8") === shared[i]));
check("Write does not add files that show up as scripts", fs.readdirSync(dir).filter(f => f.endsWith(".js")).length === 0);
o = await run("Write 2.js", { dir, query: { word: "谢谢" }, offline: true });
check("a word written before works offline", o.html.length === 1 && o.html[0].includes('"src":"谢.json"'));
for (const c of "学生") fs.rmSync(path.join(dir, "hanzi-write", "c" + c.codePointAt(0).toString(16) + ".json"), { force: true }); // "Next word" may have saved them
o = await run("Write 2.js", { dir, query: { word: "学生" }, offline: true });
check("a new word offline says it needs internet", o.html.length === 1 && o.html[0].includes("Check your internet") && o.html[0].includes('id="hint" disabled'));
o = await run("Write 2.js", { dir: (() => { const d = newDir(); fs.copyFileSync(path.join(ROOT, "data", "hsk1-2.json"), path.join(d, "hsk1-2.json")); return d; })(), offline: true });
check("first run offline: a clear message, no error", o.alerts.length === 1 && o.alerts[0].message.includes("needs the internet"));
o = await run("Write 2.js", { dir: newDir(), offline: true });
check("no word lists: a clear message", o.alerts.length === 1 && o.alerts[0].message.includes("run Hourly Words once"));
const allWords = JSON.parse(fs.readFileSync(path.join(dir, "hsk1-2.json"), "utf8")).words.map(w => w.hanzi);
const left = allWords[17];
fs.writeFileSync(path.join(dir, "hanzi-write.json"), JSON.stringify({ done: Object.fromEntries(allWords.filter(h => h !== left).map(h => [h, 1])), deck: [] }));
o = await run("Write 2.js", { dir });
check("words not written yet come first", o.html[0].includes("CHARS = " + JSON.stringify(Array.from(left).filter(c => /\p{Script=Han}/u.test(c)))));
fs.writeFileSync(path.join(dir, "mywords.txt"), "螺蛳粉 | luósīfěn | river snail rice noodles\n");
o = await run("Write 2.js", { dir, query: { word: "螺蛳粉" } });
check("Write also has my own words", o.html[0].includes("luósīfěn") && o.html[0].includes("My words"));

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
