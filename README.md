# Hanzi widgets

Learn Chinese without opening an app. New words and radicals show up on your iPhone and Mac by themselves.

- **Hourly Words** (iPhone Lock Screen or Home Screen): one word at a time, with hanzi, pinyin and an English meaning. Tap it for all meanings, the measure word, an example sentence and sound. Mark words as known so they show up less. Tap any Chinese character on the word page (the word or the example sentence) for a dictionary card: the longest word that starts there, with pinyin, meaning, Listen and Write. A word you tap comes back the next day for review (then after 3 and 7 days if you tap it again).
- **Levels:** HSK 1-2, HSK 3, HSK 4, HSK 5. Lists download by themselves from this repo and work offline after that.
- **Add Word:** share a Chinese word from any app to add it to your own list. Pinyin and meaning are filled in.
- **Radicals** (iPhone Home Screen): one of 50 common radicals, with 3 example characters. Tap it for a word and an example sentence with sound for each character. Tap any character there for the same dictionary card.
- **Write** (iPhone, in Scriptable): practice writing characters with your finger, with 20 radicals and the simplest words in a random order: each radical always comes with 3 characters that have it, then 1 or 2 other words (list in `scriptable/write-path.txt`, radicals marked with `| radical`). Trace each character twice, then write it from memory. **Write 2** does the same with random words from your HSK levels. Wrong strokes turn red. **Back** goes to the word before (Next then goes forward again), **Show strokes** plays the stroke order in every round, also after you finish, a radical gets a **Radical** tag and a row with its 3 example characters (tap one to write it, Back goes to the radical), and the button at the top right picks the colours: Auto (follows the iPhone), Light or Dark. It only reads the word lists, so the widgets are not changed. The **Write** button on the word and radical pages opens Write on that one character or word.
- **MacHanzi** (Mac, optional): the same words in the menu bar, plus a word card and a radical card on the desktop.

Setup guide: [GUIDE.md](GUIDE.md)

## What is inside

| Folder | Files |
|---|---|
| `scriptable/` | `Install.js` (start here), `Hourly Words.js`, `Add Word.js`, `Radicals.js`, `Write.js`, `Write 2.js`, `write-path.txt`, `radicals.txt`, `files.txt` (the list Install downloads) |
| `data/` | `hsk1-2.json`, `hsk3.json`, `hsk4.json`, `hsk5.json` (word lists), `dict.txt` (dictionary for Add Word) |
| `mac/` | `main.swift`, `Info.plist`, `build.sh` (MacHanzi source) |
| `tools/` | `build_data.py` (makes the files in `data/` from the sources below) |
| `tests/` | `test-scripts.mjs`, `test-radicals.mjs` (run the scripts in Node with fake Scriptable APIs) |

Product direction for this project: [direction.md](direction.md)

## Mac setup (optional, needs Terminal)

The app is not signed by Apple, so a downloaded copy is blocked. Build it on your own Mac instead:

```bash
xcode-select --install   # once, if you do not have the Command Line Tools
cd mac && ./build.sh
open ~/Applications/MacHanzi.app
```

MacHanzi downloads the word lists from this repo. Choose levels in the menu: **Levels**. It needs macOS 13 or later.

## Data and sources

- **HSK 1-2:** my own list (textbook words plus words I added), about 970 words. It already includes all HSK 2.0 level 3 words.
- **HSK 3, 4, 5:** the full HSK 2.0 levels (300, 600 and 1300 words), from [complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) (MIT). When several levels are on, duplicates are removed.
- **Pinyin and meanings:** [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict), licensed CC BY-SA 4.0.
- **Example sentences:** [Tatoeba](https://tatoeba.org), licensed CC BY 2.0 FR. Each example keeps its Tatoeba sentence id in `src`.
- **Sound:** Listen uses the Chinese voice built into iPhone.
- **Colours:** green (#108652, #97DF67) on a light mint background (#EEF7E8), with a dark moss green dark mode (#0E1F16).
- **Writing:** [Hanzi Writer](https://hanziwriter.org) (MIT), with stroke data from [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) (Arphic Public License). Write downloads them the first time and saves them in iCloud Drive > Scriptable > hanzi-write.

To rebuild the data: download the sources listed at the top of `tools/build_data.py`, then run `python3 tools/build_data.py <sources> <my list> data`.

## Change your own words

Use **Add Word**, or edit `mywords.txt` in iCloud Drive > Scriptable. One word per line: `hanzi | pinyin | meaning`. Lines starting with `#` are skipped.

## Status

- **2026-11-15:** Write and Write 2 got a Back button (4 buttons at the bottom), Show strokes now works in round 3 and after the word is done, and a theme button (Auto / Light / Dark, saved in `hanzi-write/theme.txt`). Tests: 132 pass.
- **2026-11-16:** every radical (from `write-path.txt` or `radicals.txt`) gets a Radical tag in Write and Write 2, with an Examples row under the meaning. Tests: 140 pass.
- **2026-11-16:** tap a character in Hourly Words or Radicals for a dictionary card (CC-CEDICT from `dict.txt`, downloaded the first time, then offline). Tests: 150 + 34 pass.
- **Next step:** run Install on the iPhone to get the new `Write.js` and `Write 2.js`, and try them on a real word.

## License

Code: MIT, see [LICENSE](LICENSE). Files in `data/` keep the licenses of their sources (CC BY-SA 4.0 for CC-CEDICT content, CC BY 2.0 FR for Tatoeba sentences).
