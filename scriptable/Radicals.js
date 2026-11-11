// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-brown; icon-glyph: language;

// One Chinese radical (bo thu) at a time, for Home Screen widgets.
// Best size: medium (radical on the left, 3 example characters on the right).
// Data: radicals.txt in iCloud Drive > Scriptable, one radical per line:
//   radical | pinyin | Han-Viet name | meaning | examples
//   examples: up to 3, split by ";", each "character pinyin meaning"
// Every widget shows the same radical at the same time, and every radical
// appears once before any of them repeats. No state file is needed.

const LIST_FILE = "radicals.txt";
const MINUTES = 10; // a new radical every 10 minutes (iOS decides the real refresh time)

// Colors: "paper and ink", same as the Mac desktop card
const BG = new Color("#F5EFE3");
const INK = new Color("#2B2118");
const RED = new Color("#A8392B");
const GREY = new Color("#6B5E50");

const fm = FileManager.iCloud();
const listPath = fm.joinPath(fm.documentsDirectory(), LIST_FILE);
if (!fm.fileExists(listPath)) {
  throw new Error("Missing " + LIST_FILE + " in iCloud Drive > Scriptable");
}
await fm.downloadFileFromiCloud(listPath);

// "河 hé sông" -> { char: "河", pinyin: "hé", meaning: "sông" }
function parseExample(s) {
  const parts = s.trim().split(/\s+/);
  return { char: parts[0] || "", pinyin: parts[1] || "", meaning: parts.slice(2).join(" ") };
}

const ITEMS = fm.readString(listPath)
  .split(/\r?\n/)
  .map(l => l.trim())
  .filter(l => l && !l.startsWith("#"))
  .map(l => l.split(/\s*[|\t]\s*/))
  .map(p => ({
    radical: p[0],
    pinyin: p[1] || "",
    name: p[2] || "",
    meaning: p[3] || "",
    examples: (p[4] || "").split(";").map(parseExample).filter(e => e.char).slice(0, 3),
  }));
if (ITEMS.length === 0) throw new Error(LIST_FILE + " is empty");

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
const item = ITEMS[shuffledOrder(Math.floor(slot / ITEMS.length))[slot % ITEMS.length]];
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
      addLine(left, r.meaning, Font.systemFont(13), GREY, 2, 0.6);
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
      addLine(info, r.meaning, Font.systemFont(15), GREY, 2, 0.6);
      top.addSpacer();
      lw.addSpacer(14);
      addLine(lw, "Ví dụ", Font.semiboldSystemFont(12), GREY, 1, 0.8);
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
      const m = addLine(lw, r.meaning, Font.systemFont(11), GREY, 1, 0.6);
      m.centerAlignText();
      if (r.examples[0]) {
        lw.addSpacer(4);
        const e = r.examples[0];
        const ex = addLine(lw, e.char + " " + e.meaning, Font.systemFont(12), INK, 1, 0.6);
        ex.centerAlignText();
      }
    }
  }
  lw.refreshAfterDate = nextChange;
  return lw;
}

if (config.runsInWidget || config.runsInAccessoryWidget) {
  Script.setWidget(buildWidget(item, config.widgetFamily));
} else {
  // Run in the app: show a preview so you can check the look
  console.log(ITEMS.length + " radicals loaded. Now: " + item.radical + " " + item.name + " (" + item.meaning + ")");
  await buildWidget(item, "medium").presentMedium();
}
Script.complete();
