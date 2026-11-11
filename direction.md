# hanzi-widgets - product direction

## 1. Problem
People who learn Chinese forget words because they only see them when they open a study app. A widget puts one word on the Lock Screen, so they see it many times a day with no effort. The first version worked for me, but sharing it was hard: friends had to download 4 files, save them in the right folder, and could only use my HSK1-2 list with Vietnamese meanings.

## 2. User
Me and my friends. They are comfortable with tech and can use Scriptable with a good guide. They glance at the Lock Screen many times a day, tap only when curious, and will not edit files or read long guides. They study different HSK levels.

## 3. Main flows
- Flow 1 (install): install Scriptable -> paste one script (`Install`) -> run it -> all scripts and the radical list are downloaded. About 1 minute.
- Flow 2 (choose levels): run `Hourly Words` in the app -> menu -> Levels -> tick HSK1-2, HSK3, HSK4 or HSK5 -> saved. The widget uses these levels. A widget Parameter (for example `hsk3`) overrides the choice for that one widget.
- Flow 3 (lists download by themselves): the first run downloads each chosen list from GitHub and keeps a copy in iCloud Drive > Scriptable. It checks for a new version about once a week. With no internet it uses the saved copy.
- Flow 4 (glance): the Lock Screen widget shows hanzi, pinyin and a short English meaning. A new word at each refresh.
- Flow 5 (look closer): tap the widget -> a detail page opens: hanzi, pinyin, numbered meanings, measure word, one example sentence with pinyin and English, a "Play" button for sound. Buttons: Known, Next word.
- Flow 6 (known words): tap Known -> the word shows up much less often (about 1 time in 10 compared with other words). Tap again to undo.
- Flow 7 (add my own word): select Chinese text in any app (Pleco, Safari, WeChat) -> Share -> Scriptable -> `Add Word` -> pinyin and meaning are filled in from a dictionary -> edit if needed -> Save. Or run `Add Word` and type the word. Saved in `mywords.txt`, which updates never overwrite.
- Flow 8 (progress): the detail page and the menu show "Seen 230 of 974" for the chosen levels.
- Flow 9 (radicals): the Home Screen widget shows one of 50 radicals with 3 examples (unchanged).
- Flow 10 (Mac): MacHanzi downloads the same lists from GitHub and shows them in the menu bar and on the desktop cards. Menu -> Levels to choose.

## 4. Out of scope
- No quiz and no buttons on the widget itself (Scriptable widgets cannot have buttons; a tap only opens the app).
- No notifications (most people turn them off after a few days).
- No accounts, no server, no sync of Known words between iPhone and Mac.
- No streaks or reminders.
- No Vietnamese meanings in the word lists (English only, decided 2026-11-11). Radicals keep their Vietnamese names.
- No part of speech labels.
- No real iOS app (WidgetKit). Scriptable is fine for this group of users.
- No HSK6 or HSK 3.0 levels 6-9 for now.

## 5. Done means
- [ ] A new phone can go from zero to a working Lock Screen widget with only the Install script and GUIDE.md.
- [ ] Choosing HSK3 in the menu makes the widget show HSK3 words after the next refresh.
- [ ] A widget with Parameter `hsk4` shows only HSK4 words.
- [ ] With airplane mode on, the widget still shows words from the saved copy.
- [ ] Tapping the widget opens the detail page of that same word.
- [ ] The Play button speaks the word in Chinese.
- [ ] Known words show up much less often; Known can be undone.
- [ ] Sharing 学生 from Safari to Add Word fills in xuéshēng and "student".
- [ ] Added words appear in the widget and survive a list update.
- [ ] The menu shows how many words have been seen for each level.
- [ ] MacHanzi shows words from the chosen levels and keeps working offline.
- [ ] Every entry in the HSK files has pinyin and at least one English meaning.

## 6. Platform and limits
- iPhone with Scriptable (free). Mac app is optional and is built from source.
- Data lives in this GitHub repo (`data/`) and is downloaded by the scripts. Local copies and user data (settings, Known words, my words) live in iCloud Drive > Scriptable.
- Word data: pinyin and English meanings from CC-CEDICT (CC BY-SA 4.0). Example sentences from Tatoeba (CC BY 2.0 FR). Data files keep those licenses; code is MIT.
- Levels: HSK1-2 is my own list (book words plus words I added). HSK3, HSK4 and HSK5 follow HSK 2.0 (300, 600 and 1300 new words).
- File format: one JSON file per level, each word has `hanzi`, `pinyin`, `short`, `senses`, `measure`, `example`.

## 7. Open questions
- HSK 2.0 or HSK 3.0 for levels 3-5? HSK 2.0 is used for now. Change if my book is HSK 3.0.
- Should Known words sync to the Mac? Only if I miss it.
- Is 1 in 10 the right rate for Known words?
- After 5 friends install it on their own: where did they get stuck?
