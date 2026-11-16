"""Build data/radical-chars.json: the 50 radicals of scriptable/radicals.txt, each with
the HSK characters that have it. Characters with any other radical are left out.

Usage:
  python3 tools/build_radicals.py <makemeahanzi dictionary.txt> <data dir>

<makemeahanzi dictionary.txt>: https://github.com/skishore/makemeahanzi (dictionary.txt).
Its "radical" field gives the radical of each character.
<data dir> must already have hsk1-2.json, hsk3.json, hsk4.json, hsk5.json and dict.txt
(made by build_data.py). Names of the 50 common radicals come from scriptable/radicals.txt.

Output, radical-chars.json:
  {"radicals": {"门": {"pinyin": "mén", "name": "Door",
                      "chars": [["问", "wèn", "to ask", "hsk1-2"], ...]}, ...}}
Characters are sorted by level, then by their place in the level list.
"""
import json, re, sys
from pathlib import Path

MMAH, DATA = Path(sys.argv[1]), Path(sys.argv[2])
ROOT = Path(__file__).resolve().parent.parent
LEVELS = ["hsk1-2", "hsk3", "hsk4", "hsk5"]
HAN = re.compile(r"[㐀-鿿]")
# Make Me a Hanzi uses a few "radical supplement" code points. Use the normal
# character instead, so it shows in every font and matches radicals.txt.
SAME = {"⺗": "心", "⺼": "月", "⺀": "冫", "⺌": "小", "⺊": "卜", "⺮": "竹"}

mm = {}
for line in MMAH.read_text(encoding="utf-8").splitlines():
    d = json.loads(line)
    mm[d["character"]] = d

# The 50 common radicals: pinyin and short English name
names = {}
for line in (ROOT / "scriptable" / "radicals.txt").read_text(encoding="utf-8").splitlines():
    p = [x.strip() for x in line.split("|")]
    if line.startswith("#") or len(p) < 3 or not p[0]:
        continue
    names[p[0]] = (p[1], p[2])

# CC-CEDICT lines for single characters: "char<TAB>pinyin<TAB>meanings<TAB>measure"
cedict = {}
for line in (DATA / "dict.txt").read_text(encoding="utf-8").splitlines():
    p = line.split("\t")
    if len(p) >= 3 and len(p[0]) == 1:
        cedict.setdefault(p[0], (p[1], p[2]))

def short(meaning):
    return meaning.split(";")[0].strip()[:40]

# Every character of the HSK words, with the first level it shows up in
level_of, info = {}, {}
for lv in LEVELS:
    for w in json.loads((DATA / (lv + ".json")).read_text(encoding="utf-8"))["words"]:
        h = w["hanzi"]
        if len(h) == 1 and h not in info:
            info[h] = (w.get("pinyin", ""), w.get("short", ""))
        for c in h:
            if HAN.match(c) and c not in level_of:
                level_of[c] = lv

out, missing = {}, []
for c, lv in level_of.items():
    d = mm.get(c)
    if not d or not d.get("radical"):
        missing.append(c)
        continue
    r = SAME.get(d["radical"], d["radical"])
    if c == r or r not in names:
        continue  # the radical itself, or a radical that is not one of the 50
    # Pinyin and meaning: the HSK word, else CC-CEDICT, else Make Me a Hanzi
    if c in info:
        py, mean = info[c]
    elif c in cedict:
        py, mean = cedict[c][0], short(cedict[c][1])
    else:
        py, mean = (d.get("pinyin") or [""])[0], short(d.get("definition", ""))
    if r not in out:
        py_r, name = names[r]
        out[r] = {"pinyin": py_r, "name": name, "chars": []}
    out[r]["chars"].append([c, py, mean, lv])

for r in out.values():
    r["chars"].sort(key=lambda e: LEVELS.index(e[3]))  # stable: keeps list order inside a level

result = {"source": "Make Me a Hanzi (radicals), CC-CEDICT (CC BY-SA 4.0)", "radicals": dict(sorted(out.items(), key=lambda kv: -len(kv[1]["chars"])))}
(DATA / "radical-chars.json").write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"{sum(len(r['chars']) for r in out.values())} of {len(level_of)} characters have one of the {len(names)} radicals ({len(out)} used). Not in Make Me a Hanzi: {''.join(missing) or 'none'}")
