import fs from "fs";
const DIR = process.argv[2];
const src = fs.readFileSync(DIR + "/Radicals.js", "utf8");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
let fails = 0;
const check = (name, ok) => { console.log((ok ? "PASS " : "FAIL ") + name); if (!ok) fails++; };

function makeEnv(family, inWidget, nowMs) {
  const texts = [];
  const mkStack = () => ({
    addText(t) { texts.push(t); return { centerAlignText() {} }; },
    addStack() { return mkStack(); }, addSpacer() {}, centerAlignContent() {}, layoutVertically() {}, setPadding() {},
  });
  class ListWidget { constructor() { Object.assign(this, mkStack()); } async presentMedium() {} }
  const env = {
    FileManager: { iCloud: () => ({
      documentsDirectory: () => DIR, joinPath: (a, b) => a + "/" + b,
      fileExists: p => fs.existsSync(p), downloadFileFromiCloud: async () => {}, readString: p => fs.readFileSync(p, "utf8"),
    }) },
    Color: class { constructor(h) { this.h = h; } },
    Font: { systemFont: s => s, boldSystemFont: s => s, semiboldSystemFont: s => s, mediumSystemFont: s => s },
    Size: class { constructor(w, h) { this.w = w; this.h = h; } },
    ListWidget,
    config: { runsInWidget: inWidget, runsInAccessoryWidget: false, widgetFamily: family },
    Script: { setWidget: w => { env.widget = w; }, complete() {} },
    console: { log() {} },
    Date: class extends Date { constructor(...a) { a.length ? super(...a) : super(nowMs); } },
  };
  env.texts = texts;
  return env;
}
async function run(family, inWidget, nowMs) {
  const env = makeEnv(family, inWidget, nowMs);
  const names = Object.keys(env).filter(k => k !== "texts" && k !== "widget");
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
const app = await run(null, false, t);
check("in-app run builds a preview", app.texts.length > 0);
process.exit(fails ? 1 : 0);
