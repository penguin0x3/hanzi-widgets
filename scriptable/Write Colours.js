// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-brown; icon-glyph: palette;

// Write Colours: choose the colours of Write, Write 2 and Write Saved.
// Green: green on a light mint background. Blue & Coral: French Blue and
// Burnt Coral on a chalk background. Both are light.
// The choice is saved in iCloud Drive > Scriptable > hanzi-write > theme.txt,
// and every Write script reads it when it opens.

const fm = FileManager.iCloud();
const CACHE = fm.joinPath(fm.documentsDirectory(), "hanzi-write");
const FILE = fm.joinPath(CACHE, "theme.txt");
const THEMES = ["green", "coral"];
const LABELS = { green: "Green", coral: "Blue & Coral" };

let now = "green";
try {
  if (fm.fileExists(FILE)) {
    await fm.downloadFileFromiCloud(FILE);
    now = fm.readString(FILE).trim();
  }
} catch (e) {}
if (!THEMES.includes(now)) now = "green"; // also the old "auto", "light" and "dark"

const al = new Alert();
al.title = "Write colours";
al.message = "Now: " + LABELS[now] + ". Pick the colours for Write, Write 2 and Write Saved.";
for (const t of THEMES) al.addAction((t === now ? "[x] " : "") + LABELS[t]);
al.addCancelAction("Cancel");
const i = await al.presentSheet();

if (i >= 0 && i < THEMES.length) {
  if (!fm.fileExists(CACHE)) fm.createDirectory(CACHE, true);
  fm.writeString(FILE, THEMES[i]);
  const ok = new Alert();
  ok.title = "Saved";
  ok.message = "Write uses " + LABELS[THEMES[i]] + " from now on.";
  ok.addAction("OK");
  await ok.present();
}
Script.complete();
