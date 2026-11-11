import fs from "fs";
import os from "os";
import path from "path";
const DIR = process.argv[2];
const src = fs.readFileSync(DIR + "/Radicals.js", "utf8");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
let fails = 0;
const check = (name, ok) => { console.log((ok ? "PASS " : "FAIL ") + name); if (!ok) fails++; };

function makeEnv(family, inWidget, nowMs, opts = {}) {
  const docs = opts.dir || DIR;
  const html = [];
  const texts = [];
  const mkStack = () => ({
    addText(t) { texts.push(t); return { centerAlignText() {} }; },
    addStack() { return mkStack(); }, addSpacer() {}, centerAlignContent() {}, layoutVertically() {}, setPadding() {},
  });
  class ListWidget { constructor() { Object.assign(this, mkStack()); } async presentMedium() {} }
  const env = {
    FileManager: { iCloud: () => ({
      documentsDirectory: () => docs, joinPath: (a, b) => a + "/" + b,
      fileExists: p => fs.existsSync(p), downloadFileFromiCloud: async () => {}, readString: p => fs.readFileSync(p, "utf8"),
      writeString: (p, t) => fs.writeFileSync(p, t),
    }) },
    Color: class { constructor(h) { this.h = h; } },
    Font: { systemFont: s => s, boldSystemFont: s => s, semiboldSystemFont: s => s, mediumSystemFont: s => s },
    Size: class { constructor(w, h) { this.w = w; this.h = h; } },
    ListWidget,
    config: { runsInWidget: inWidget, runsInAccessoryWidget: false, widgetFamily: family },
    Script: { name: () => "Radicals", setWidget: w => { env.widget = w; }, complete() {} },
    args: { queryParameters: opts.query || {} },
    Request: class { constructor(u) { this.url = u; } async loadString() { throw new Error("offline"); } },
    WebView: class {
      async loadHTML(h) { html.push(h); }
      async present() { for (const a of opts.web || []) { env.allowed.push(this.shouldAllowRequest({ url: "hanzi://" + a })); await new Promise(r => setTimeout(r, 5)); } }
    },
    console: { log() {} },
    Date: class extends Date { constructor(...a) { a.length ? super(...a) : super(nowMs); } },
  };
  env.texts = texts; env.html = html; env.allowed = [];
  return env;
}
async function run(family, inWidget, nowMs, opts) {
  const env = makeEnv(family, inWidget, nowMs, opts);
  const names = Object.keys(env).filter(k => !["texts", "widget", "html", "allowed"].includes(k));
  await new AsyncFunction(...names, src)(...names.map(n => env[n]));
  return env;
}

const lines = fs.readFileSync(DIR + "/radicals.txt", "utf8").split(/\r?\n/).filter(l => l.trim() && !l.startsWith("#"));
check("radicals.txt has 50 entries", lines.length === 50);
check("every line has 5 fields", lines.every(l => l.split("|").length === 5));
check("every radical has 3 examples with char, pinyin, meaning", lines.every(l => { const ex = l.split("|")[4].split(";"); return ex.length === 3 && ex.every(e => e.trim().split(/\s+/).length >= 3); }));
check("no duplicate radicals", new Set(lines.map(l => l.split("|")[0].trim())).size === 50);

const slot = 10 * 60 * 1000;
const base = Math.floor(Date.now() / slot / 50) * 50 * slot; // start of a cycle
const seen = new Set();
for (let i = 0; i < 50; i++) {
  const e = await run("accessoryCircular", true, base + i * slot + 1000);
  seen.add(e.texts[0]);
}
check("one full cycle shows all 50 radicals", seen.size === 50);

const t = base + 7 * slot + 5000;
const a = await run("small", true, t), b = await run("medium", true, t + 60000);
check("small and medium widgets show the same radical in the same slot", a.texts[0] === b.texts[0]);
for (const f of ["accessoryRectangular", "small", "medium", "large", "accessoryInline", "accessoryCircular"]) {
  const e = await run(f, true, t);
  check("family " + f + " builds and sets refresh", !!e.widget && e.widget.refreshAfterDate instanceof Date && e.texts.length > 0);
  if (f === "medium" || f === "large") check("family " + f + " shows 3 example characters with meanings", e.texts.length >= 4 + 9);
}
const med = await run("medium", true, t);
check("widget opens the detail page of the radical it shows", med.widget.url === "scriptable:///run/Radicals?radical=" + encodeURIComponent(a.texts[0]));

// detail page, with the HSK 1-2 list saved by Hourly Words
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rad-"));
fs.copyFileSync(DIR + "/radicals.txt", tmp + "/radicals.txt");
fs.copyFileSync(DIR + "/../data/hsk1-2.json", tmp + "/hsk1-2.json");
const app = await run(null, false, t, { dir: tmp });
const page = app.html[0] || "";
check("in-app run opens the detail page of the current radical", app.html.length === 1 && page.includes('<div class="rad">' + a.texts[0] + "</div>"));
const exChars = lines.find(l => l.split("|")[0].trim() === a.texts[0]).split("|")[4].split(";").map(e => e.trim().split(/\s+/)[0]);
check("detail page has one block per example character", (page.match(/class="card"/g) || []).length === exChars.length && exChars.every(c => page.includes('<span class="ch">' + c)));
check("detail page has Play buttons", (page.match(/>Play</g) || []).length >= exChars.length);
const chePage = (await run(null, false, t, { dir: tmp, query: { radical: "车" } })).html[0];
check("radical itself has a Play button", /class="py">chē <button class="play"[^>]*say\(&quot;车&quot;\)/.test(chePage));
const waterPage = (await run(null, false, t, { dir: tmp, query: { radical: "氵" } })).html[0];
check("Play for 氵 reads 水", waterPage.includes('say(&quot;水&quot;)'));
check("tap on widget opens that radical", chePage.includes('<div class="rad">车</div>'));
check("车 page shows an example sentence with 辆", /class="zh">[^<]*辆/.test(chePage));
const nx = await run(null, false, t, { dir: tmp, query: { radical: "车" }, web: ["next", "next"] });
check("Next radical loads other radicals and keeps the page open", nx.html.length === 3 && nx.allowed.every(x => x === false) && !nx.html[1].includes('<div class="rad">车</div>'));
const empty = fs.mkdtempSync(path.join(os.tmpdir(), "rad-"));
fs.copyFileSync(DIR + "/radicals.txt", empty + "/radicals.txt");
const off = await run(null, false, t, { dir: empty });
check("without HSK lists and offline the page still opens", off.html.length === 1 && off.html[0].includes("Run Hourly Words once"));
process.exit(fails ? 1 : 0);
