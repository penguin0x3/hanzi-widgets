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

SHORT_MAX = 30   # the Lock Screen widget fits 2 lines of about 20 characters
SHORT = {        # hand-written short meanings, used before the rule below
    "吗": "yes/no question particle", "呢": "and you? / what about?", "吧": "suggestion: let's..., right?", "了": "done / change (particle)",
    "得": "verb + 得 + how well", "的": "of; 's (particle)", "地": "-ly (adverb particle)", "着": "-ing (ongoing state)",
    "过": "have done before; to pass", "把": "把 + object + verb", "被": "by (passive)", "啊": "ah; oh",
    "呀": "ah; oh (after a vowel)", "唉": "sigh; yes", "之": "of (literary 的)", "们": "plural (我们, 你们)",
    "起来": "start to; get up", "分之": "fraction (三分之一 = 1/3)", "一下儿": "a bit; once (一下)", "个": "general measure word",
    "些": "some; a few", "辆": "MW for cars", "份": "MW for copies, portions", "棵": "MW for trees",
    "颗": "MW for small round things", "张": "MW for flat things; to open", "条": "MW for long things; strip", "件": "MW for clothes, matters",
    "位": "MW for people (polite)", "本": "MW for books; origin", "块": "piece; yuan (spoken)", "层": "floor, layer",
    "次": "time (how many times)", "片": "slice, piece", "段": "section, part", "篇": "MW for articles",
    "座": "MW for buildings, mountains", "号": "number; date", "点": "o'clock; a little; dot", "刻": "quarter hour",
    "节": "MW for classes; festival", "遍": "time (once through)", "双": "pair", "只": "only; MW for animals",
    "太": "too; very", "跟": "with; to follow", "才": "only then; just", "便": "convenient; then",
    "所": "place; (所以 so)", "角": "angle; 0.1 yuan", "离": "away from", "往": "toward",
    "着急": "worried", "老": "old", "对": "right; to, toward", "给": "to give; for",
    "种": "kind, type", "门": "door", "韩文": "Korean (language)", "人民币": "RMB, Chinese yuan",
    "太极拳": "tai chi", "气功": "qigong", "北京": "Beijing", "球": "ball",
    "不得不": "have to", "场": "place; MW for games", "出差": "business trip", "究竟": "after all; exactly",
    "招聘": "to recruit", "只好": "have to (no choice)", "丙": "third (C)", "甲": "first (A)",
    "乙": "second (B)", "成语": "idiom (4 characters)", "打工": "part-time job", "担任": "to hold a post",
    "革命": "revolution", "纪录": "record", "录取": "to admit (school, job)", "名胜": "famous sight",
    "所谓": "so-called", "发烧": "to have a fever", "关心": "to care about", "叔叔": "uncle",
    "请假": "to ask for leave", "打针": "to get an injection", "失眠": "insomnia", "打电话": "to make a phone call",
    "正在": "in the middle of", "最": "most", "负责": "responsible for", "合格": "qualified",
    "看法": "opinion", "来不及": "too late", "无论": "no matter", "重视": "to value",
    "主动": "to take the initiative", "班主任": "head teacher", "背": "back; to memorize", "放暑假": "summer holiday",
    "日用品": "daily goods", "中药": "Chinese medicine", "留学生": "foreign student", "同学": "classmate",
    "楼": "building; floor", "课间": "break between classes", "房租": "rent", "办公": "to work (in an office)",
    "贵姓": "your surname? (polite)", "请问": "excuse me, may I ask", "觉得": "to think, feel", "字典": "dictionary",
    "游戏": "game", "河": "river", "鱼": "fish", "猫": "cat",
    "路": "road", "好处": "benefit", "乱": "messy", "上海": "Shanghai",
    "长江": "Yangtze River", "沙发": "sofa", "梦": "dream", "难道": "don't tell me...?",
    "请客": "to treat (pay for others)", "提前": "in advance", "填空": "fill in the blank", "朝": "toward; dynasty",
    "采取": "to adopt", "打交道": "to deal with", "打招呼": "to say hello", "钓": "to fish",
    "否认": "to deny", "扶": "to support with hand", "付款": "to pay", "乖": "well-behaved",
    "光临": "to visit (polite)", "规矩": "rule; well-behaved", "怀念": "to miss (the past)", "及格": "to pass (a test)",
    "讲究": "to be particular about", "尽力": "to do one's best", "近代": "modern times", "可见": "so we can see",
    "口味": "taste", "临时": "temporary; at the last minute", "摸": "to touch", "年代": "decade; era",
    "披": "to drape on", "使劲儿": "to use force", "始终": "from start to end", "丝毫": "the slightest",
    "体会": "to learn from experience", "体验": "to experience", "退步": "to fall behind", "问候": "to send regards",
    "无奈": "helpless", "武术": "martial arts", "腰": "waist", "应聘": "to apply for a job",
    "与其": "rather than", "阵": "a burst; a while", "中介": "agent; agency", "中旬": "middle of a month",
    "抓紧": "to hurry; hold tight", "专心": "to focus", "自信": "confident", "又…又…": "both... and...",
    "喂": "hello (phone); hey", "元": "yuan", "毛": "0.1 yuan; hair", "家": "home; family",
}

def clean_sense(s):
    s = re.sub(r"^(\([^)]*\)\s*)+", "", s)          # drop leading "(bound form)" etc.
    s = re.sub(r"\s*\([^)]*\)", "", s).strip()       # drop other notes
    s = re.sub(r"\s*[\u3400-\u9fff].*$", "", s).strip()  # drop Chinese text and what follows
    return s.split(";")[0].split(":")[0].strip(" ,.")

def short_of(senses, hanzi=""):
    """One simple meaning for the widget. The full meanings stay in senses."""
    if hanzi in SHORT: return SHORT[hanzi]
    cands = [clean_sense(x) for x in senses[:3]]
    if not any(cands) and senses:                    # "(completed action marker)" -> keep the note
        cands = [re.sub(r"[()]", "", senses[0]).split(";")[0].strip()]
    first = cands[0] if cands else ""
    for c in (first, first.split(",")[0].strip()):   # first meaning, else its first comma part
        if c and len(c) <= SHORT_MAX: return c
    c = first.split(",")[0]
    out = ""                                         # last: cut at a word break
    for word in c.split():
        if len((out + " " + word).strip()) > SHORT_MAX: break
        out = (out + " " + word).strip()
    return out.rstrip(" ,.-") or c[:SHORT_MAX]

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
        w = {"hanzi": hanzi, "pinyin": py, "short": short_of(info["senses"], hanzi),
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
