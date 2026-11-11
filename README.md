# Hanzi widgets

Learn Chinese without opening an app. New words and radicals show up on your iPhone and Mac by themselves.

- **Hourly Words** (iPhone Lock Screen): one word at a time from about 970 words (hanzi, pinyin, Vietnamese meaning).
- **Radicals** (iPhone Home Screen): one of 50 common radicals (bo thu), with 3 example characters. A new one every 10 minutes.
- **MacHanzi** (Mac, optional): the same word in the menu bar, plus two cards on the desktop (word and radical).

Vietnamese setup guide: [HUONG-DAN.md](HUONG-DAN.md)

## What is inside

| Folder | Files |
|---|---|
| `scriptable/` | `Hourly Words.js`, `Radicals.js`, `words.txt`, `radicals.txt` |
| `mac/` | `main.swift`, `Info.plist`, `build.sh` (MacHanzi source) |
| `tests/` | `test-radicals.mjs` (checks Radicals.js in Node with fake Scriptable APIs) |

## iPhone setup (about 5 minutes)

1. Install [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) (free). Open it once.
2. Download the 4 files in `scriptable/` and save them in **Files > iCloud Drive > Scriptable**.
3. Open Scriptable. You should see `Hourly Words` and `Radicals`. Tap each one once to test.
4. Lock Screen: long press, Customize, add a Scriptable widget (rectangle), choose script `Hourly Words`.
5. Home Screen: long press, add a Scriptable widget (medium), tap it, choose script `Radicals`.

## Mac setup (optional, needs Terminal)

The app is not signed by Apple, so a downloaded copy is blocked. Build it on your own Mac instead:

```bash
xcode-select --install   # once, if you do not have the Command Line Tools
cd mac && ./build.sh
open ~/Applications/MacHanzi.app
```

The Mac app reads `words.txt` and `radicals.txt` from the iCloud Scriptable folder, so set up the iPhone part first. It needs macOS 13 or later.

## Change the lists

Edit `words.txt` or `radicals.txt` in iCloud Drive > Scriptable. Lines starting with `#` are skipped.

- `words.txt`: `hanzi | pinyin | meaning`
- `radicals.txt`: `radical | pinyin | Han-Viet name | meaning | examples`, examples split by `;`, each `character pinyin meaning`

## License

MIT. See [LICENSE](LICENSE).
