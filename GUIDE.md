# Setup guide

Learn Chinese without opening an app. New words and radicals show up on your iPhone by themselves.

- **Lock Screen:** one word at a time (hanzi, pinyin, English meaning). Tap it to see more.
- **Home Screen:** one of 50 common radicals, with 3 example characters. A new one about every 10 minutes.
- **Levels:** HSK 1-2, HSK 3, HSK 4 and HSK 5. Pick one or more.

Setup takes about 3 minutes.

## Step 1. Install Scriptable

Get **Scriptable** (free) from the App Store and open it once.

## Step 2. Add the Install script

1. On the iPhone, open this link: [Install.js (raw)](https://raw.githubusercontent.com/penguin0x3/hanzi-widgets/main/scriptable/Install.js). Press and hold the text, tap **Select All**, then **Copy**.
2. In Scriptable, tap **+** (top right), paste the code, and tap the title at the top to rename it to `Install`.
3. Tap **Done**, then tap `Install` to run it, then tap **Install**.

You now have 5 scripts: `Hourly Words`, `Radicals`, `Add Word`, `Write` and `Write 2`. Run `Install` again any time to get the newest version. It also updates itself and adds new scripts when there are any. Your settings and words are kept.

## Step 3. Choose your levels

1. Tap `Hourly Words`. A menu opens.
2. Tap **Choose levels**, tick the levels you want (for example HSK 3), then tap **Done**.
3. The lists download by themselves and are saved on the phone, so the widget also works offline.

## Step 4. Add the Lock Screen widget (words)

1. Press and hold the Lock Screen, tap **Customize**, then **Lock Screen**.
2. Tap the widget area under the clock, choose **Scriptable**, and pick the **rectangle** widget.
3. Tap the new widget. Under **Script**, choose `Hourly Words`.

Tap the widget at any time to open the detail page: all meanings, measure word, an example sentence, and **Play** for the sound. Tap **Mark known** for words you already know: they show up much less often. Tap **Next word** to keep going.

A word you tap on the Lock Screen comes back the next day for a quick review. Tap it again when it comes back and it returns after 3 days, then after 7 days. If you do not tap it, it goes back to the normal mix.

## Step 5. Add the Home Screen widget (radicals)

1. Press and hold the Home Screen, tap **Edit**, then **Add Widget**.
2. Find **Scriptable**, pick the **medium** size, and add it.
3. Press and hold the widget, tap **Edit Widget**. Under **Script**, choose `Radicals`.

Tap the widget to open the radical page: each example character with a common word, an example sentence and **Play**. Tap **Next radical** to see another one.

## Practice writing characters

Run `Write` in Scriptable. It starts with 20 radicals, then about 45 of the simplest words (我, 你, 谢谢, 没有...), always in the same order. It remembers where you stopped. `Write 2` works the same way but picks random words from your HSK levels.

1. **Rounds 1 and 2:** trace each stroke over the faint characters, in the right order.
2. **Round 3:** write the word from memory on the empty grid.

All characters of a word sit side by side, and each round you write the whole word, so you see it as one piece. Words with 3 or more characters get smaller boxes: turn your phone sideways to make them bigger.

A wrong stroke turns red. After 3 misses, the right stroke is shown. **Hint** shows the faint character for 3 seconds in round 3 (you can keep writing), **Show strokes** plays the stroke order of the whole word, and **Next word** skips to another word. Tap any other box to see the stroke order of that character. In `Write 2`, words you have not written yet come first.

Write needs internet the first time it shows a character. After that, the characters you wrote also work offline. It does not change your widgets, settings or progress.

## Add your own words

- **From any app:** select a Chinese word (in Pleco, Safari, WeChat...), tap **Share**, then **Run Script** (Scriptable), then **Add Word**. Pinyin and meaning are filled in. Tap **Save**.
- **By typing:** run `Add Word` in Scriptable and type the word.

If Scriptable is not in the share menu, scroll to the end of the app row, tap **More**, and turn on **Scriptable**.

Your words are saved in `mywords.txt` and show up in the widget with your levels. Updates never remove them.

## Optional: different levels per widget

In a widget's settings, type a level in **Parameter**, for example `hsk4` or `hsk3,hsk4`. That widget then uses those levels; the others follow the menu.

## Common questions

**How often does the word change?** iOS decides when widgets refresh, usually every 5 to 30 minutes.

**The widget says "No words yet".** Open Scriptable, run `Hourly Words` once with internet, then wait for the next refresh.

**Play has no sound.** Play uses the Chinese voice of the iPhone and also works in silent mode. Turn up the volume. If it is still quiet, download a Chinese voice: Settings > Accessibility > Spoken Content > Voices > Chinese.

**How do I see my progress?** Run `Hourly Words` and tap **Progress**. It shows how many words you have seen and marked known in each level.

**Where do the meanings come from?** Meanings and pinyin from CC-CEDICT, example sentences from Tatoeba. Both are free, open projects.

**Is there a Mac version?** Yes, but you build it yourself in Terminal. See "Mac setup" in [README.md](README.md).
