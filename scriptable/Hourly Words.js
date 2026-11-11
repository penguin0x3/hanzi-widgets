// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: yellow; icon-glyph: magic;

// false = widget only (no notifications; existing ones are removed on next run)
// true  = also send one notification per hour (needs the daily Shortcuts automation)
const NOTIFICATIONS = false;

const HOURS_AHEAD = 60;
const LIST_FILE = "words.txt";
const TAG = "word-hourly";
const HOUR = 3600 * 1000;
const WIDGET_MINUTES = 0.5; // ask iOS to refresh the widget this often (0.5 = 30 seconds).
                            // iOS decides the real time: often 1-5 minutes, longer when the phone sleeps.

// Lock Screen font sizes: change these numbers to make text bigger or smaller
const LOCK_HANZI = 56;      // rectangular widget: words with 1-2 characters (big, on the left)
const LOCK_HANZI_LONG = 36; // rectangular widget: words with 3+ characters (full width)
const LOCK_PINYIN = 16;     // rectangular widget: pinyin
const LOCK_MEANING = 14;    // rectangular widget: meaning
const LOCK_INLINE = 16;   // one-line widget above the clock

const fm = FileManager.iCloud();
const dir = fm.documentsDirectory();
const listPath = fm.joinPath(dir, LIST_FILE);
const statePath = fm.joinPath(dir, "word-hourly-state.json");

if (!fm.fileExists(listPath)) {
  throw new Error("Missing " + LIST_FILE + " in iCloud Drive > Scriptable");
}
await fm.downloadFileFromiCloud(listPath);
const WORDS = fm.readString(listPath)
  .split(/\r?\n/)
  .map(l => l.trim())
  .filter(l => l && !l.startsWith("#"))
  .map(l => l.split(/\s*[|\t]\s*/))
  .map(p => ({ hanzi: p[0], pinyin: p[1] || "", meaning: p.slice(2).join(" / ") }));
if (WORDS.length === 0) throw new Error(LIST_FILE + " is empty");

const signature = WORDS.length + ":" + WORDS[0].hanzi + ":" + WORDS[WORDS.length - 1].hanzi;

// schedule: { "<hour timestamp>": wordIndex } for every hour that has a word
let state = { deck: [], lastScheduled: 0, signature: "", schedule: {} };
if (fm.fileExists(statePath)) {
  try { await fm.downloadFileFromiCloud(statePath); state = JSON.parse(fm.readString(statePath)); } catch (e) {}
}
if (!state.schedule) state.schedule = {};

let pending = (await Notification.allPending()).filter(n => n.threadIdentifier === TAG);

if (state.signature !== signature) {
  if (pending.length) Notification.removePending(pending.map(n => n.identifier));
  pending = [];
  state = { deck: [], lastScheduled: 0, signature, schedule: {} };
}

// Notifications off: remove every scheduled one and reset the hourly schedule
if (!NOTIFICATIONS) {
  if (pending.length) Notification.removePending(pending.map(n => n.identifier));
  try {
    const delivered = (await Notification.allDelivered()).filter(n => n.threadIdentifier === TAG);
    if (delivered.length) Notification.removeDelivered(delivered.map(n => n.identifier));
  } catch (e) {}
  pending = [];
  state.schedule = {};
  state.lastScheduled = 0;
}

function shuffledDeck() {
  const a = WORDS.map((_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function nextIndex() {
  if (state.deck.length === 0) state.deck = shuffledDeck();
  return state.deck.pop();
}
function makeNotification(w, id) {
  const n = new Notification();
  n.identifier = id;
  n.threadIdentifier = TAG;
  n.title = w.hanzi + (w.pinyin ? "  " + w.pinyin : "");
  n.body = w.meaning || " ";
  return n;
}

const now = new Date();
const thisHour = new Date(now); thisHour.setMinutes(0, 0, 0);
const thisKey = String(thisHour.getTime());

// Current hour has no word yet (first run, new list, or a gap): give it one now.
let firedNow = false;
if (NOTIFICATIONS && !config.runsInWidget && state.schedule[thisKey] === undefined) {
  const idx = nextIndex();
  state.schedule[thisKey] = idx;
  await makeNotification(WORDS[idx], TAG + "-now-" + thisHour.getTime()).schedule(); // no date = show now
  firedNow = true;
}

// Fill future hours up to HOURS_AHEAD pending notifications
let t = new Date(thisHour.getTime() + HOUR);
if (state.lastScheduled >= t.getTime()) t = new Date(state.lastScheduled + HOUR);

let added = 0;
for (let slots = NOTIFICATIONS ? HOURS_AHEAD - pending.length : 0; slots > 0; slots--) {
  const idx = nextIndex();
  const n = makeNotification(WORDS[idx], TAG + "-" + t.getTime());
  n.setTriggerDate(new Date(t));
  await n.schedule();
  state.schedule[String(t.getTime())] = idx;
  state.lastScheduled = t.getTime();
  t = new Date(t.getTime() + HOUR);
  added++;
}

// Drop schedule entries older than 2 hours
const cutoff = thisHour.getTime() - 2 * HOUR;
for (const k of Object.keys(state.schedule)) {
  if (Number(k) < cutoff) delete state.schedule[k];
}

// Widget: its own shuffled deck, a new word every WIDGET_MINUTES
// (iOS decides the real refresh time, usually 15-30 minutes)
const isWidget = config.runsInWidget || config.runsInAccessoryWidget;
let widgetWord = null;
if (isWidget) {
  if (!Array.isArray(state.widgetDeck)) state.widgetDeck = [];
  const due = !state.widgetUntil || now.getTime() >= state.widgetUntil || !WORDS[state.widgetIdx];
  if (due) {
    if (state.widgetDeck.length === 0) state.widgetDeck = shuffledDeck();
    state.widgetIdx = state.widgetDeck.pop();
    state.widgetUntil = now.getTime() + Math.max(0, WIDGET_MINUTES * 60 - 20) * 1000; // every refresh = new word
  }
  widgetWord = WORDS[state.widgetIdx];
}
fm.writeString(statePath, JSON.stringify(state));

// Word of the current hour = latest scheduled slot at or before now
function currentWord() {
  const keys = Object.keys(state.schedule).map(Number).filter(k => k <= now.getTime());
  if (keys.length) {
    const idx = state.schedule[String(Math.max(...keys))];
    if (WORDS[idx]) return WORDS[idx];
  }
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function addLine(lw, text, font, lines, scale) {
  const t = lw.addText(text || " ");
  t.font = font;
  t.lineLimit = lines;
  t.minimumScaleFactor = scale;
  return t;
}

function buildWidget(w, family) {
  const lw = new ListWidget();
  switch (family) {
    case "accessoryInline": // one line above the lock screen clock
      addLine(lw, w.hanzi + " " + w.pinyin, Font.systemFont(LOCK_INLINE), 1, 0.5);
      break;
    case "accessoryCircular": // small round lock screen widget
      lw.addAccessoryWidgetBackground = true;
      const c = addLine(lw, w.hanzi, Font.boldSystemFont(w.hanzi.length <= 2 ? 20 : 14), 2, 0.4);
      c.centerAlignText();
      break;
    case "accessoryRectangular": // wide lock screen widget
      lw.setPadding(0, 0, 0, 0);
      if ([...w.hanzi].length <= 2) {
        // Big characters on the left, pinyin + meaning stacked on the right
        const row = lw.addStack();
        row.centerAlignContent();
        const h = row.addText(w.hanzi);
        h.font = Font.boldSystemFont(LOCK_HANZI);
        h.lineLimit = 1;
        h.minimumScaleFactor = 0.3;
        row.addSpacer(6);
        const col = row.addStack();
        col.layoutVertically();
        const p = col.addText(w.pinyin || " ");
        p.font = Font.boldSystemFont(LOCK_PINYIN);
        p.lineLimit = 1;
        p.minimumScaleFactor = 0.6;
        const m = col.addText(w.meaning || " ");
        m.font = Font.systemFont(LOCK_MEANING);
        m.lineLimit = 2;
        m.minimumScaleFactor = 0.6;
        row.addSpacer();
      } else {
        // Long words: characters across the full width, pinyin + meaning below
        addLine(lw, w.hanzi, Font.boldSystemFont(LOCK_HANZI_LONG), 1, 0.4);
        addLine(lw, w.pinyin + "  " + w.meaning, Font.systemFont(LOCK_MEANING), 1, 0.6);
      }
      break;
    case "medium":
    case "large":
    case "extraLarge":
      addLine(lw, w.hanzi, Font.boldSystemFont(44), 1, 0.4);
      lw.addSpacer(4);
      addLine(lw, w.pinyin, Font.systemFont(18), 1, 0.6);
      lw.addSpacer(4);
      addLine(lw, w.meaning, Font.systemFont(14), 3, 0.6);
      break;
    default: // small home screen widget
      addLine(lw, w.hanzi, Font.boldSystemFont(34), 1, 0.4);
      addLine(lw, w.pinyin, Font.systemFont(14), 1, 0.6);
      addLine(lw, w.meaning, Font.systemFont(11), 3, 0.6);
  }
  lw.refreshAfterDate = new Date(now.getTime() + WIDGET_MINUTES * 60 * 1000);
  return lw;
}

const word = currentWord();
if (isWidget) {
  Script.setWidget(buildWidget(widgetWord || word, config.widgetFamily));
} else {
  if (NOTIFICATIONS) {
    console.log(WORDS.length + " words loaded. Added " + added + " notifications. Pending: " + (pending.length + added));
    console.log("Current hour word: " + word.hanzi + " " + word.pinyin + (firedNow ? " (sent now)" : ""));
  } else {
    console.log(WORDS.length + " words loaded. Notifications off (all removed). Widget only.");
  }
}
Script.complete();
