// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: plus; share-sheet-inputs: plain-text;

// Add Word: save a Chinese word to mywords.txt so Hourly Words shows it.
// - From any app: select Chinese text -> Share -> Scriptable -> Add Word.
// - Or run this script and type the word.
// Pinyin and meaning are filled in from CC-CEDICT (downloaded once, about 7 MB).

const REPO = "https://raw.githubusercontent.com/0xpenguin2/hanzi-widgets/main/";
const fm = FileManager.iCloud();
const dir = fm.documentsDirectory();
const path = name => fm.joinPath(dir, name);
const DICT = path("dict.txt");
const MYWORDS = path("mywords.txt");
const LEVELS = ["hsk1-2", "hsk3", "hsk4", "hsk5"];
const LEVEL_NAMES = { "hsk1-2": "HSK 1-2", hsk3: "HSK 3", hsk4: "HSK 4", hsk5: "HSK 5" };

async function readText(p) {
  if (!fm.fileExists(p)) return null;
  try { await fm.downloadFileFromiCloud(p); return fm.readString(p); } catch (e) { return null; }
}

async function getDict() {
  let text = await readText(DICT);
  const old = text ? (Date.now() - fm.modificationDate(DICT).getTime()) / 86400000 : Infinity;
  if (!text || old > 90) {
    try {
      const r = new Request(REPO + "data/dict.txt");
      r.timeoutInterval = 60;
      const t = await r.loadString();
      if (t && t.length > 100000) { fm.writeString(DICT, t); text = t; }
    } catch (e) { /* no internet: type pinyin and meaning yourself */ }
  }
  return text || "";
}

// Find "word<TAB>pinyin<TAB>meanings<TAB>measure" in the dictionary
function lookup(dict, word) {
  const i = dict.indexOf("\n" + word + "\t");
  const start = i >= 0 ? i + 1 : (dict.startsWith(word + "\t") ? 0 : -1);
  if (start < 0) return null;
  const end = dict.indexOf("\n", start);
  const p = dict.slice(start, end < 0 ? undefined : end).split("\t");
  return { pinyin: p[1] || "", meaning: p[2] || "" };
}

async function alreadyIn(word) {
  for (const lv of LEVELS) {
    const t = await readText(path(lv + ".json"));
    if (t && t.includes('"hanzi":"' + word + '"')) return LEVEL_NAMES[lv];
  }
  const mine = await readText(MYWORDS);
  if (mine && mine.split(/\r?\n/).some(l => l.split("|")[0].trim() === word)) return "My words";
  return null;
}

async function say(title, message) {
  const al = new Alert();
  al.title = title; al.message = message; al.addAction("OK");
  await al.present();
}

// 1. Get the word: shared text, or ask
let input = (args.plainTexts && args.plainTexts[0]) || (args.queryParameters && args.queryParameters.text) || "";
let word = (input.match(/[㐀-鿿]+/) || [""])[0].slice(0, 8);
if (!word) {
  const ask = new Alert();
  ask.title = "Add a word";
  ask.message = "Type or paste a Chinese word.";
  ask.addTextField("学生", input);
  ask.addAction("Next");
  ask.addCancelAction("Cancel");
  if (await ask.present() === -1) return Script.complete();
  word = (ask.textFieldValue(0).match(/[㐀-鿿]+/) || [""])[0];
}

if (!word) {
  await say("No Chinese text", "Select a Chinese word and try again.");
} else {
  const where = await alreadyIn(word);
  const found = lookup(await getDict(), word);
  // 2. Check and edit
  const al = new Alert();
  al.title = where ? word + " (already in " + where + ")" : word;
  al.message = found ? "Filled in from CC-CEDICT. Edit if you like." : "Not in the dictionary. Type the pinyin and meaning.";
  al.addTextField("Hanzi", word);
  al.addTextField("Pinyin", found ? found.pinyin : "");
  al.addTextField("Meaning", found ? found.meaning : "");
  al.addAction(where ? "Save anyway" : "Save");
  al.addCancelAction("Cancel");
  if (await al.present() !== -1) {
    const clean = s => s.replace(/[|\r\n]/g, " ").trim();
    const h = clean(al.textFieldValue(0)), py = clean(al.textFieldValue(1)), m = clean(al.textFieldValue(2));
    if (h) {
      const old = (await readText(MYWORDS)) || "# My words: hanzi | pinyin | meaning\n";
      fm.writeString(MYWORDS, old.replace(/\n?$/, "\n") + [h, py, m].join(" | ") + "\n");
      await say("Saved", h + " " + py + "\nHourly Words will show it from the next refresh.");
    }
  }
}
Script.complete();
