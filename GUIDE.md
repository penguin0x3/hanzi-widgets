# Setup guide

Learn Chinese without opening an app. New words and radicals show up on your iPhone by themselves.

- **Lock Screen:** one word at a time (hanzi, pinyin, Vietnamese meaning), from about 970 words.
- **Home Screen:** one of 50 common radicals, with 3 example characters. A new one about every 10 minutes.

Total setup time: about 5 minutes.

## Step 1. Install Scriptable

Get **Scriptable** (free) from the App Store. Open it once, then close it.

## Step 2. Download the 4 files

Go to the [`scriptable/`](scriptable/) folder and download these 4 files:

- `Hourly Words.js`
- `Radicals.js`
- `words.txt`
- `radicals.txt`

To download a file on the iPhone: tap the file name, tap **Download raw file** (the down arrow at the top right), then choose **Save to Files**.

Save each file in **iCloud Drive > Scriptable**. This is the most important step. If a file is saved in the wrong place, the widget shows "Missing words.txt".

## Step 3. Check

Open Scriptable. You should see 2 scripts: `Hourly Words` and `Radicals`. Tap each one to run it:

- `Radicals` shows a preview of the radical card.
- `Hourly Words` shows nothing. This is normal, because it only runs inside a widget.

## Step 4. Add the Lock Screen widget (words)

1. Unlock the phone, press and hold the Lock Screen, tap **Customize**, then choose **Lock Screen**.
2. Tap the widget area under the clock, choose **Scriptable**, and pick the **rectangle** widget.
3. Tap the new widget. Under **Script**, choose `Hourly Words`.

## Step 5. Add the Home Screen widget (radicals)

1. Press and hold the Home Screen, tap **Edit**, then **Add Widget**.
2. Find **Scriptable**, pick the **medium** size, and add it.
3. Press and hold the widget, tap **Edit Widget**. Under **Script**, choose `Radicals`.

## Common questions

**How often does the word change?** iOS decides when widgets refresh, usually every 5 to 30 minutes. If you use the phone less, it changes less often.

**It says "Missing words.txt" or "Missing radicals.txt".** The `.txt` file is not in iCloud Drive > Scriptable. Open the Files app and move it into that folder.

**Can I add my own words?** Open `words.txt` in the Files app and add a line like `hanzi | pinyin | meaning`, for example `学生 | xuéshēng | học sinh`.

**Is there a Mac version?** Yes, but you build it yourself in Terminal. See "Mac setup" in [README.md](README.md).
