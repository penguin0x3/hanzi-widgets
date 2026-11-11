"""Build the word lists in data/ from open sources.

Usage:
  python3 tools/build_data.py <source dir> <my HSK1-2 list> <output dir>

<source dir> must contain:
  cedict_ts.u8                 CC-CEDICT (https://www.mdbg.net/chinese/dictionary?page=cc-cedict)
  old3.json old4.json old5.json HSK 2.0 lists (https://github.com/drkameleon/complete-hsk-vocabulary,
                                wordlists/exclusive/old)
  cmn_sentences.tsv.bz2, cmn-eng_links.tsv.bz2, eng_sentences.tsv.bz2
                               Tatoeba exports (https://downloads.tatoeba.org/exports/per_language/)
<my HSK1-2 list> is a text file: hanzi | pinyin | meaning (only hanzi and pinyin are used).
Needs: pip install pypinyin jieba

Output: hsk1-2.json, hsk3.json, hsk4.json, hsk5.json, dict.txt, report.txt
"""
import bz2, json, re, sys, unicodedata
from collections import defaultdict
from pathlib import Path
from pypinyin import lazy_pinyin, Style
import jieba
jieba.setLogLevel(60)

SRC, MYLIST, OUT = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
OUT.mkdir(parents=True, exist_ok=True)
report = []

# ---------- pinyin: "wan3 shang5" -> "wǎnshang" ----------
MARKS = {"a": "āáǎà", "e": "ēéěè", "i": "īíǐì", "o": "ōóǒò", "u": "ūúǔù", "ü": "ǖǘǚǜ"}

def syllable(s):
    m = re.fullmatch(r"([A-Za-zü:]+)([1-5])", s)
    if not m:
        return s.replace("u:", "ü").replace("U:", "Ü")
    body, tone = m.group(1).replace("u:", "ü").replace("U:", "Ü"), int(m.group(2))
    if tone == 5:
        return body
    low = body.lower()
    if "a" in low: i = low.index("a")
    elif "e" in low: i = low.index("e")
    elif "ou" in low: i = low.index("o")
    else: i = max(low.rfind(v) for v in "iouü")
    if i < 0:
        return body
    ch = MARKS[low[i]][tone - 1]
    if body[i].isupper(): ch = ch.upper()
    return body[:i] + ch + body[i + 1:]

def marks(numeric):
    out = []
    for k, s in enumerate(numeric.split()):
        p = syllable(s)
        if k and out and p[:1].lower() in "aāáǎàeēéěèoōóǒò":
            out.append("'")
        out.append(p)
    return "".join(out).replace(" ", "")

def plain(p):
    """Lowercase, no tones, no spaces: for loose matching."""
    p = unicodedata.normalize("NFD", p.lower())
    return re.sub(r"[^a-zü]", "", "".join(c for c in p if not unicodedata.combining(c) or c == "̈"))

def norm(p):
    return re.sub(r"[\s']", "", p.lower())

# ---------- CC-CEDICT ----------
def inline(text):
    # 個|个[ge4] -> 个 gè ; [dao4 heng2] -> dàoheng
    text = re.sub(r"(\S+?)\|(\S+?)\[([^\]]+)\]", lambda m: m.group(2) + " " + marks(m.group(3)), text)
    text = re.sub(r"(\S+?)\[([^\]]+)\]", lambda m: m.group(1) + " " + marks(m.group(2)), text)
    return text

SKIP = re.compile(r"^(surname |variant of|old variant|archaic variant|see |used in |also written|also pr\.|Japanese variant|erhua variant|\(old\)|abbr\. for|\(Tw\)|\(dialect\)|\(archaic\))", re.I)

entries = defaultdict(list)   # simplified -> [entry]
simp_chars, trad_chars = set(), set()
for line in open(SRC / "cedict_ts.u8", encoding="utf-8"):
    if line.startswith("#"): continue
    m = re.match(r"(\S+) (\S+) \[([^\]]*)\] /(.*)/\s*$", line)
    if not m: continue
    trad, simp, num, defs = m.groups()
    simp_chars.update(simp); trad_chars.update(trad)
    senses, measure = [], ""
    for d in defs.split("/"):
        if d.startswith("CL:"):
            if not measure:
                measure = inline(d[3:].split(",")[0])
            continue
        d = re.sub(r"\s*\((Taiwan|Tw) pr\.[^)]*\)", "", d)
        if SKIP.match(d): continue
        d = inline(d).strip()
        if d: senses.append(d)
    if not senses:   # "variant of 橘子[ju2 zi5]" -> look up 橘子 later
        v = re.search(r"variant of (\S+?)(?:\|(\S+?))?\[", defs)
        if v: senses = ["@" + (v.group(2) or v.group(1))]
    entries[simp].append({"num": num, "pinyin": marks(num), "senses": senses, "measure": measure})
trad_only = trad_chars - simp_chars

def short_of(senses):
    s = senses[0] if senses else ""
    s = re.sub(r"^(\([^)]*\)\s*)+", "", s)          # drop leading "(bound form)" etc.
    s = re.sub(r"\s*\([^)]*\)", "", s).strip()       # drop other notes
    s = s.split(";")[0].strip()
    if not s and senses:                             # "(completed action marker)" -> keep the note
        s = re.sub(r"[()]", "", senses[0]).split(";")[0].strip()
    return s if len(s) <= 40 else s[:38].rstrip() + "..."

def pick(simp, want=None, numeric=None, depth=0):
    """Choose CC-CEDICT readings for a word. Merge entries with the same reading."""
    cands = entries.get(simp, [])
    if not cands: return None
    def same(e):
        if numeric: return e["num"].lower() == numeric.lower()
        return norm(e["pinyin"]) == norm(want)
    chosen = [e for e in cands if same(e)] if (want or numeric) else []
    if not chosen and want:
        chosen = [e for e in cands if plain(e["pinyin"]) == plain(want)]
    if not chosen:
        lower = [e for e in cands if e["num"][:1].islower() and e["senses"]]
        chosen = [max(lower or cands, key=lambda e: len(e["senses"]))]
        chosen = [e for e in cands if e["num"] == chosen[0]["num"]]
    # proper-noun entries (capital pinyin) go last
    chosen.sort(key=lambda e: e["num"][:1].isupper())
    senses, measure = [], ""
    for e in chosen:
        if e["senses"][:1] and e["senses"][0].startswith("@") and depth < 2:
            target = pick(e["senses"][0][1:], depth=depth + 1)
            if target:
                e = dict(e, senses=target["senses"], measure=e["measure"] or target["measure"])
        for s in e["senses"]:
            if s.startswith("@"): continue
            if s not in senses: senses.append(s)
        measure = measure or e["measure"]
    if not senses: return None
    return {"pinyin": chosen[0]["pinyin"], "senses": senses[:4], "measure": measure}

# ---------- Tatoeba example sentences ----------
links = defaultdict(list)
for line in bz2.open(SRC / "cmn-eng_links.tsv.bz2", "rt", encoding="utf-8"):
    a, b = line.rstrip("\n").split("\t")[:2]
    links[a].append(b)
cmn = {}
for line in bz2.open(SRC / "cmn_sentences.tsv.bz2", "rt", encoding="utf-8"):
    sid, _, text = line.rstrip("\n").split("\t")[:3]
    if sid not in links: continue
    han = [c for c in text if "一" <= c <= "鿿"]
    if not 3 <= len(han) <= 16: continue
    if any(c in trad_only for c in han): continue       # keep simplified sentences only
    cmn[sid] = text
need = {e for s in cmn for e in links[s]}
eng = {}
for line in bz2.open(SRC / "eng_sentences.tsv.bz2", "rt", encoding="utf-8"):
    sid, _, text = line.rstrip("\n").split("\t")[:3]
    if sid in need and len(text) <= 70: eng[sid] = text
pairs = []
for sid, text in cmn.items():
    en = [eng[e] for e in links[sid] if e in eng]
    if en: pairs.append((sid, text, min(en, key=len)))
by_char = defaultdict(list)
for i, (_, text, _) in enumerate(pairs):
    for c in set(text): by_char[c].append(i)

PUNCT = str.maketrans({"。": ".", "，": ",", "？": "?", "！": "!", "、": ",", "：": ":", "；": ";",
                       "“": '"', "”": '"', "‘": "'", "’": "'", "（": "(", "）": ")", "…": "...", "—": "-"})

def sentence_pinyin(text, word=None, word_py=None):
    """Pinyin with one space between words: 我明白。 -> Wǒ míngbai."""
    parts = []
    for chunk in (re.split(r"(" + re.escape(word) + ")", text) if word else [text]):
        if not chunk: continue
        if chunk == word and word_py:
            parts.append(word_py.replace(" ", "")); continue
        for piece in jieba.cut(chunk):
            if re.search(r"[\u4e00-\u9fff]", piece):
                parts.append("".join(lazy_pinyin(piece, style=Style.TONE)))
            elif piece.strip():
                parts.append(piece.translate(PUNCT))
    out = ""
    for p in parts:
        p = p.translate(PUNCT)
        if re.fullmatch(r"[\W_]+", p): out = out.rstrip() + p + " "
        else: out += p + " "
    out = re.sub(r"\s+", " ", out).strip()
    return out[:1].upper() + out[1:]

def example(word, known, word_py=None):
    ids = by_char.get(word[0], [])
    best, best_score = None, None
    for i in ids:
        sid, text, en = pairs[i]
        if word not in text: continue
        han = [c for c in text if "一" <= c <= "鿿"]
        unknown = sum(1 for c in han if c not in known)
        score = unknown * 3 + len(han)
        if best_score is None or score < best_score:
            best, best_score = (sid, text, en), score
    if not best: return None
    sid, text, en = best
    return {"zh": text, "pinyin": sentence_pinyin(text, word, word_py), "en": en, "src": "tatoeba:" + sid}

# Words CC-CEDICT does not have as one entry
MANUAL = {
    "又…又…": ("yòu…yòu…", ["both... and...", "(pattern) 又A又B: both A and B"]),
    "祝你生日快乐": ("zhù nǐ shēngrì kuàilè", ["happy birthday (to you)"]),
    "打篮球": ("dǎ lánqiú", ["to play basketball"]),
    "系领带": ("jì lǐngdài", ["to tie a necktie"]),
}

def lookup(hanzi, want, numeric):
    if hanzi in MANUAL:
        return {"pinyin": want or MANUAL[hanzi][0], "senses": MANUAL[hanzi][1], "measure": ""}
    info = pick(hanzi, want, numeric)
    if not info and "儿" in hanzi[1:]:          # 面条儿 -> 面条, keep the erhua pinyin
        info = pick(hanzi.replace("儿", ""), None, None)
        if info and want: info = dict(info, pinyin=want)
    return info

def pinyin_for(want, info):
    """Keep my textbook pinyin (tone changes, neutral tones) unless the letters differ."""
    if want and plain(want) == plain(info["pinyin"]): return want
    return info["pinyin"]

# ---------- build levels ----------
def build(level, items, known):
    words, missing = [], []
    for hanzi, want, numeric in items:
        info = lookup(hanzi, want, numeric)
        if not info:
            missing.append(hanzi); continue
        py = pinyin_for(want, info)
        w = {"hanzi": hanzi, "pinyin": py, "short": short_of(info["senses"]),
             "senses": info["senses"]}
        if want and py != want:
            report.append(f"{level}: {hanzi} my pinyin {want} -> {py} (from CC-CEDICT)")
        if info["measure"]: w["measure"] = info["measure"]
        ex = example(hanzi, known, py)
        if ex: w["example"] = ex
        words.append(w)
    data = {"level": level, "source": "CC-CEDICT (CC BY-SA 4.0), Tatoeba (CC BY 2.0 FR)", "words": words}
    (OUT / f"{level}.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n_ex = sum(1 for w in words if "example" in w)
    report.append(f"{level}: {len(words)} words, {n_ex} with example, {len(missing)} not in CC-CEDICT: {' '.join(missing)}")
    return words

mine, seen = [], set()
for line in MYLIST.read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#"): continue
    p = [x.strip() for x in re.split(r"[|\t]", line)]
    if p[0] in seen: continue
    seen.add(p[0]); mine.append((p[0], p[1] if len(p) > 1 else None, None))

known = set("".join(h for h, _, _ in mine))
build("hsk1-2", mine, known)
# HSK3-5 are the full HSK 2.0 levels, even when a word is also in my list.
# The scripts remove duplicates when several levels are on.
level_seen = set()
for n in (3, 4, 5):
    items = []
    for w in json.load(open(SRC / f"old{n}.json", encoding="utf-8")):
        h = w["simplified"]
        if h in level_seen: continue
        level_seen.add(h)
        forms = w["forms"]
        items.append((h, None, forms[0]["transcriptions"]["numeric"] if len(forms) == 1 else None))
    known |= set("".join(h for h, _, _ in items))
    build(f"hsk{n}", items, known)

# ---------- dictionary for Add Word ----------
lines = []
for simp in sorted(entries):
    if len(simp) > 8 or not all("一" <= c <= "鿿" for c in simp): continue
    info = pick(simp)
    if not info: continue
    lines.append("\t".join([simp, info["pinyin"], "; ".join(info["senses"][:3]), info["measure"]]))
(OUT / "dict.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
report.append(f"dict.txt: {len(lines)} entries")
(OUT / "report.txt").write_text("\n".join(report) + "\n", encoding="utf-8")
print("\n".join(r for r in report if "->" not in r))
