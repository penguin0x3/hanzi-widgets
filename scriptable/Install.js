// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: download;

// Install: downloads Hourly Words, Radicals and Add Word from GitHub into Scriptable.
// Run it again any time to update the scripts. Your settings, progress and
// mywords.txt are not touched.

const REPO = "https://raw.githubusercontent.com/penguin0x3/hanzi-widgets/main/";
const FILES = ["Hourly Words.js", "Radicals.js", "Add Word.js", "radicals.txt"];
const fm = FileManager.iCloud();
const dir = fm.documentsDirectory();

const ok = new Alert();
ok.title = "Install hanzi widgets";
ok.message = "This downloads " + FILES.join(", ") + " into Scriptable. Existing copies with the same names are replaced.";
ok.addAction("Install");
ok.addCancelAction("Cancel");

if (await ok.present() !== -1) {
  const done = [], failed = [];
  for (const f of FILES) {
    try {
      const r = new Request(REPO + "scriptable/" + encodeURIComponent(f));
      r.timeoutInterval = 30;
      const text = await r.loadString();
      if (r.response.statusCode !== 200 || !text) throw new Error("HTTP " + r.response.statusCode);
      fm.writeString(fm.joinPath(dir, f), text);
      done.push(f);
    } catch (e) { failed.push(f); }
  }
  // Get the first word list now, so the widget works right away
  try {
    const r = new Request(REPO + "data/hsk1-2.json");
    const t = await r.loadString();
    if (JSON.parse(t).words.length) fm.writeString(fm.joinPath(dir, "hsk1-2.json"), t);
  } catch (e) { failed.push("hsk1-2.json"); }

  const end = new Alert();
  end.title = failed.length ? "Some files failed" : "Installed";
  end.message = (done.length ? "Installed: " + done.join(", ") + "\n\n" : "") +
    (failed.length ? "Failed: " + failed.join(", ") + ". Check the internet and run Install again.\n\n" : "") +
    "Next: run Hourly Words once to choose your HSK levels, then add the widgets (see GUIDE.md).";
  end.addAction("OK");
  await end.present();
}
Script.complete();
