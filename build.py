#!/usr/bin/env python3
"""幼貓飼料比價網站產生器。

讀取價格追蹤資料 (prices.json)，產生 docs/ 靜態網站：
  docs/index.html  （內嵌資料，首屏無需額外請求）
  docs/data.json   （同一份資料，方便除錯或其他用途）
  docs/assets/...  （商品圖片、CSS、JS）

用法： python3 build.py [--source <prices.json 所在資料夾>]
只讀取來源資料，不會修改它。
"""
import argparse, datetime as dt, json, re, shutil, sys
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "docs"
TZ = ZoneInfo("Europe/Amsterdam")

BASIS_LABEL = {
    "autoship": "定期配送價",
    "herhaalgemak": "定期配送價",
    "herhaal": "定期訂購價",
    "cart discount (abd)": "購物車折扣",
    "cashback": "含返現",
    "list price": "單次購買",
}
AUTOSHIP_BASES = {"autoship", "herhaalgemak", "herhaal", "subscription"}
# 比價單位：濕食＝每 100g；其他商品依 prices.json 的 products.<id>.unit_basis（g＝每克、kg＝每公斤、L＝每公升）
BASE_FACTOR = {"100g": 100.0, "g": 1.0, "kg": 1.0, "L": 1.0, "capsule": 1.0}
# products.<id>.unit（"€/kg" 等）→ 比價單位；unit_basis 缺漏時的後備
UNIT_TO_BASE = {"€/100g": "100g", "€/g": "g", "€/kg": "kg", "€/l": "L", "€/capsule": "capsule"}
# 網站分區（依 products.<id>.category）：順序＝濕食、乾飼料、貓砂、護理；未知分類依比價單位推定
CATEGORIES = ("wet", "dry", "litter", "care")
BASE_TO_CATEGORY = {"100g": "wet", "kg": "dry", "L": "litter", "g": "care"}


def product_base(pdata):
    """比價單位：unit_basis 優先，其次 unit（€/kg…），都沒有就是濕食的每 100g。"""
    b = (pdata.get("unit_basis") or "").strip()
    if b.lower() == "l":
        b = "L"
    if b in BASE_FACTOR:
        return b
    return UNIT_TO_BASE.get(re.sub(r"\s+", "", pdata.get("unit") or "").lower(), "100g")


def product_category(pdata, meta, base):
    """網站分區：prices.json 的 category 優先，其次 site.config.json 的 category，最後依比價單位推定。"""
    for c in (pdata.get("category"), meta.get("category")):
        c = (c or "").strip().lower()
        if c in CATEGORIES:
            return c
    return BASE_TO_CATEGORY.get(base, "wet")


AGES = ("kitten", "adult", "all")
AGE_WORDS = {"kitten": "kitten", "幼貓": "kitten", "adult": "adult", "成貓": "adult", "senior": "adult",
             "all": "all", "all_life_stages": "all", "all life stages": "all", "全齡": "all"}


def product_age(pdata, meta, category):
    """適用年齡（篩選用）：site.config.json 的 age 優先，其次 prices.json 的 life_stage／age，
    再依商品名稱推定（只限濕食／乾飼料）。推不出來就是 None（篩選時照樣顯示）。"""
    for v in (meta.get("age"), pdata.get("life_stage"), pdata.get("age")):
        v = AGE_WORDS.get(str(v or "").strip().lower())
        if v:
            return v
    if category not in ("wet", "dry"):
        return None
    text = " ".join(str(x or "") for x in (pdata.get("product_name"), meta.get("name"), meta.get("desc"))).lower()
    if re.search(r"all life stages|所有生命階段|全齡|alle levensfasen|cat\s*&\s*kitten", text):
        return "all"
    if re.search(r"kitten|幼貓", text):
        return "kitten"
    if re.search(r"\badult\b|成貓|senior", text):
        return "adult"
    return None


def has_deal(best):
    """目前最低價那筆有折扣（低於原價）、返現或新客優惠。"""
    if not best:
        return False
    if any(t.get("k") in ("cash", "deal") for t in best.get("tags") or []) or best.get("new_customer"):
        return True
    lp, pr = best.get("list_price"), best.get("price")
    return bool(lp and pr and pr < lp - 0.005)


def price_drop(hist, cur_pb, cur_date, days=30):
    """降價幅度（%）：目前單位價比過去 days 天（不含今天）每日最低價的最高點低多少；沒有更早紀錄就是 0。"""
    if cur_pb is None or not cur_date:
        return 0.0
    start = (dt.date.fromisoformat(cur_date) - dt.timedelta(days=days)).isoformat()
    prev = [h["pb"] for h in hist if start <= h["date"] < cur_date and h.get("pb")]
    if not prev:
        return 0.0
    ref = max(prev)
    return round(max(0.0, (ref - cur_pb) / ref * 100), 1)


def num(v):
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def strip_paren(s):
    return re.sub(r"[（(][^）)]*[）)]", "", s or "").strip(" ；;，,")


def basis_key(b):
    k = (b or "").strip().lower()
    # 「Herhaal（定期訂購 6%）」等括號變體 → 視為 herhaal（Medpets 定期訂購）
    if k.startswith("herhaal") and k != "herhaalgemak":
        return "herhaal"
    # 「autoship（zooplusGemak 首單 15%）」→ autoship；「訂閱首單 -10%（…）」→ 訂閱（需定期配送）
    if k.startswith("autoship"):
        return "autoship"
    if k.startswith("訂閱") or "定期配送" in k or "定期訂購" in k or "subscription" in k:
        return "subscription"
    return k


def basis_label(b):
    k = basis_key(b)
    if k == "autoship" and "首單" in (b or ""):
        return "定期配送首單價"
    if k == "subscription":
        return strip_paren(b) or "訂閱價"
    if k in BASIS_LABEL:
        return BASIS_LABEL[k]
    if k.startswith("含運費"):
        return "含運費"
    return strip_paren(b) or "單次購買"


def clean_shipping(s):
    s = s or ""
    parts = []
    m = re.search(r"免運門檻\s*€\s*([\d.,]+)", s)
    if m:
        parts.append(f"滿 €{m.group(1)} 免運")
    for m in re.finditer(r"(取貨點|宅配)免運\s*€\s*([\d.,]+)", s):
        parts.append(f"{m.group(1)}滿 €{m.group(2)} 免運")
    m = re.search(r"(?<!免)運費\s*€\s*([\d.,]+(?:[–-][\d.,]+)?)", s)
    if m:
        parts.append(f"運費 €{m.group(1)}")
    m = re.search(r"最低訂單\s*€\s*([\d.,]+)", s)
    if m:
        parts.append(f"最低訂單 €{m.group(1)}")
    if not parts:
        t = strip_paren(s)
        if t in ("", "未核實"):
            return "運費未知"
        return t
    return "・".join(parts)


def ship_tags(s):
    """運費字串 → 分類標籤：[{"k": "ship"|"cond", "t": 文字}]。"""
    s = s or ""
    tags = []
    free = re.search(r"免運門檻\s*€\s*([\d.,]+)", s)
    fee = re.search(r"(?<!免)運費\s*€\s*([\d.,]+(?:[–-][\d.,]+)?)", s)
    if free and fee:
        tags.append({"k": "ship", "t": f"滿 €{free.group(1)} 免運／運費 €{fee.group(1)}"})
    elif free:
        tags.append({"k": "ship", "t": f"滿 €{free.group(1)} 免運"})
    elif fee:
        tags.append({"k": "ship", "t": f"運費 €{fee.group(1)}"})
    for m in re.finditer(r"(取貨點|宅配)免運\s*€\s*([\d.,]+)", s):
        tags.append({"k": "ship", "t": f"{m.group(1)}滿 €{m.group(2)} 免運"})
    m = re.search(r"最低訂單\s*€\s*([\d.,]+)", s)
    if m:
        tags.append({"k": "cond", "t": f"最低消費 €{m.group(1)}"})
    if not tags:
        t = clean_shipping(s)
        seg = [x.strip() for x in re.split(r"[；;]", s) if "免運" in x]
        if seg and "；" in t:
            t = seg[-1].replace("（", "（").strip()
        tags.append({"k": "ship", "t": t})
    return tags


def short_portal(p):
    return strip_paren(p) if p else None


def portal_key(name):
    """返現網站名稱比對用：去括號、空白與大小寫（「CashbackXL」＝「cashback xl」）。"""
    return re.sub(r"\s+", "", strip_paren(name or "")).lower()


def apply_display_names(obj, names):
    """返現網站顯示名稱改寫（prices.json 唯讀，名稱只在輸出時替換）：
    site.config.json "cashback_display_names" {原名: 顯示名}，長的先換；網址欄位（url）不動。"""
    pairs = sorted((names or {}).items(), key=lambda kv: -len(kv[0]))
    if not pairs:
        return obj
    def fix(v, key=None):
        if isinstance(v, str):
            if key == "url":
                return v
            for a, b in pairs:
                v = v.replace(a, b)
            return v
        if isinstance(v, list):
            return [fix(x) for x in v]
        if isinstance(v, dict):
            return {k: fix(x, k) for k, x in v.items()}
        return v
    return fix(obj)


def cashback_invites(cfg, products):
    """只保留目前資料（網站上各商品今日報價）實際用到的返現網站邀請連結。
    比對 offer 的返現標籤（cashback_portal）與新客返現（cashback_new_customer.portal），
    依 site.config.json "cashback_invites" 的順序輸出 [{"name", "url"}]。"""
    used = set()
    for p in products:
        for o in p["offers"]:
            for t in o["tags"]:
                if t.get("k") == "cash" and t.get("p"):
                    used.add(portal_key(t["p"]))
            if o.get("new_customer") and o["new_customer"].get("portal"):
                used.add(portal_key(o["new_customer"]["portal"]))
    out = []
    for name, url in (cfg.get("cashback_invites") or {}).items():
        url = (url or "").strip()
        if url and portal_key(name) in used:
            note = ((cfg.get("cashback_invite_notes") or {}).get(name) or "").strip()
            out.append({"name": name, "url": url, "note": note})
    return out


def eff_unit_price(o):
    """回傳 (每份價, 每100g價, 總價, 計價基礎)：優惠價與返現後取較低者，不疊加。"""
    bu, b100, bp = num(o.get("best_eur_per_unit")), num(o.get("best_eur_per_100g")), num(o.get("best_price_eur"))
    if bu is not None and b100 is not None:
        return bu, b100, bp, o.get("best_basis") or "list price"
    # 舊格式後備：取 effective_* 或標價
    cands = []
    if num(o.get("effective_eur_per_unit")) is not None:
        cands.append((num(o["effective_eur_per_unit"]), num(o.get("effective_eur_per_100g")), num(o.get("effective_price_eur")), o.get("effective_note") or "折扣"))
    if num(o.get("after_cashback_eur_per_unit")) is not None:
        cands.append((num(o["after_cashback_eur_per_unit"]), num(o.get("after_cashback_eur_per_100g")), num(o.get("after_cashback_price_eur")), "cashback"))
    if num(o.get("eur_per_unit")) is not None:
        cands.append((num(o["eur_per_unit"]), num(o.get("eur_per_100g")), num(o.get("price_eur")), "list price"))
    if not cands:
        return None, None, None, None
    u, h, p, b = min(cands, key=lambda c: c[0])
    if h is None and o.get("unit_g"):
        h = u / float(o["unit_g"]) * 100
    return u, h, p, b


def one_time_unit(o):
    """單次購買（不需定期配送）的每份價：標價、購物車折扣或返現後取較低者。"""
    u, _, _, b = eff_unit_price(o)
    if basis_key(b) not in AUTOSHIP_BASES:
        return u
    c = [num(o.get(f)) for f in ("after_cashback_eur_per_unit", "eur_per_unit") if num(o.get(f)) is not None]
    return min(c) if c else None


def is_main(o):
    # verified_item_price_*：商品價已核實（例如運費未知），仍可排名；*_pending／policy 類不算
    st = o.get("status") or ""
    return o.get("stock") == "in_stock" and (st == "verified" or st.startswith("verified_item_price_nl_shipping"))


def unit_size(o, base):
    """每份的份量（g、kg 或 L），用來換算比價單位。"""
    if base == "L":
        return num(o.get("unit_l"))
    if base == "capsule":
        return num(o.get("unit_capsules"))
    g = num(o.get("unit_g"))
    if base == "kg":
        return g / 1000 if g else None
    return g


def size_label(o, base):
    v = unit_size(o, base)
    if v is None:
        return ""
    if base == "capsule":
        return f"{v:g} caps"
    if base == "kg":
        return f"{v:g}kg" if v >= 1 else f"{v * 1000:g}g"
    return f"{v:g}L" if base == "L" else f"{v:g}g"


def per_base(unit_price, o, base):
    sz = unit_size(o, base)
    if unit_price is None or not sz:
        return None
    return round(unit_price / sz * BASE_FACTOR[base], 4)


def offer_view(o, unit_word, base="100g"):
    u, h, p, b = eff_unit_price(o)
    if base != "100g":
        h = None  # 非濕食不顯示每 100g
    pb = h if base == "100g" else per_base(u, o, base)
    k = basis_key(b)
    conds = []
    conds.append(clean_shipping(o.get("shipping")))
    # 分類標籤（網站依類型上色）：ship 運費、sub 訂閱、cond 其他條件、cash 返現；新客首單與單次價由 app.js 加上
    tags = ship_tags(o.get("shipping"))
    if k in AUTOSHIP_BASES:
        conds.append("需訂閱定期配送")
        tags.insert(0, {"k": "sub", "t": "需定期配送"})
    if k == "cashback" and o.get("cashback_portal"):
        cb = num(o.get("cashback_eur"))
        conds.append(f"經 {short_portal(o['cashback_portal'])} 返現" + (f" €{cb:.2f}" if cb else ""))
        tags.insert(0, {"k": "cash", "p": short_portal(o['cashback_portal']), "t": f"{o['cashback_portal']} 返現" + (f" €{cb:.2f}" if cb else "")})
    nc = o.get("cashback_new_customer")
    new_cust = None
    if isinstance(nc, dict) and num(nc.get("after_cashback_eur_per_unit")) is not None:
        new_cust = {
            "portal": short_portal(nc.get("portal")),
            "rate_pct": num(nc.get("rate_pct")),
            "unit": num(nc.get("after_cashback_eur_per_unit")),
            "price": num(nc.get("after_cashback_price_eur")),
        }
    ot = one_time_unit(o)
    ug = num(o.get("unit_g"))
    per100 = (lambda v: round(v / ug * 100, 3) if (v is not None and ug) else None)
    if new_cust:
        new_cust["per100g"] = per100(new_cust["unit"])
    ot_show = ot if (ot is not None and u is not None and ot > u + 1e-9) else None
    if new_cust:
        new_cust["pb"] = new_cust["per100g"] if base == "100g" else per_base(new_cust["unit"], o, base)
        if base != "100g":
            new_cust["per100g"] = None
    return {
        "shop": o.get("shop"),
        "variant": o.get("variant"),
        "units": o.get("units"),
        "unit_g": o.get("unit_g"),
        "list_price": num(o.get("price_eur")),
        "price": p,
        "unit": u,
        "per100g": h,
        "pb": pb,
        "size": size_label(o, base),
        "basis": basis_label(b),
        "autoship": k in AUTOSHIP_BASES,
        "one_time_unit": ot_show,
        "one_time_per100g": per100(ot_show) if base == "100g" else None,
        "one_time_pb": (per100(ot_show) if base == "100g" else per_base(ot_show, o, base)),
        "conditions": [c for c in conds if c],
        "tags": [t for t in tags if t["t"]],
        "new_customer": new_cust,
        "in_stock": o.get("stock") == "in_stock",
        "verified": (o.get("status") or "") == "verified" or (o.get("status") or "").startswith("verified_item_price_nl_shipping"),
        "status": o.get("status"),
        "url": o.get("url"),
        "detail": "；".join(x for x in (o.get("promo"), o.get("note")) if x),
    }


# ── 多語系（web/i18n.json）──────────────────────────────────────────────
# 介面文字由 app.js 依 ui 表顯示；prices.json 的中文自由文字在 build 時依 data 規則翻成 en／nl，
# 以 {中文原文: 譯文} 對照表內嵌到網頁。翻不完整的段落保留中文，並列在 build 記錄中。
LANGS = ("en", "nl")
CJK_RE = re.compile(r"[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]")
HAN_RE = re.compile(r"[\u3400-\u9fff]")
PUNCT = [("（", " ("), ("）", ") "), ("／", "/"), ("＋", " + "), ("：", ": "), ("，", ", "), ("、", ", "),
         ("・", " · "), ("；", "; "), ("～", "~"), ("　", " ")]
QUOTES = {"en": ("“", "”"), "nl": ("‘", "’")}
I18N_SKIP_KEYS = {"url", "updated_zh", "next_zh", "generated_zh", "conditions", "location", "ui", "i18n"}


class Translator:
    def __init__(self, cfg):
        d = cfg.get("data", {})
        self.exact = d.get("exact", {})
        self.phrases = sorted(d.get("phrases", {}).items(), key=lambda kv: -len(kv[0]))
        self.patterns = [(re.compile(p), en, nl) for p, en, nl in d.get("patterns", [])]
        self.missing = {}   # 未翻譯段落 → 出現次數

    @staticmethod
    def _repl(s):
        return re.sub(r"\$(\d)", r"\\g<\1>", s)

    def _tidy(self, s, lang):
        q = QUOTES[lang]
        s = s.replace("「", " " + q[0]).replace("」", q[1])
        for a, b in PUNCT:
            s = s.replace(a, b)
        s = re.sub(r"\s+", " ", s)
        s = re.sub(r"\(\s+", "(", s)
        s = re.sub(r"\s+([),:;])", r"\1", s)
        s = re.sub(r"\)\s+/", ")/", s)
        return s.strip()

    @staticmethod
    def euro(s, lang):
        """荷蘭文：€1.16 → €1,16（含 €0–8.25 這類區間）。"""
        if lang != "nl":
            return s
        return re.sub(r"€\s?\d[\d.,]*(?:[–-]\d[\d.]*)?", lambda m: m.group(0).replace(".", ","), s)

    def segment(self, seg, lang):
        i = 0 if lang == "en" else 1
        if seg in self.exact:
            return self.exact[seg][i]
        t = seg
        for rx, en, nl in self.patterns:
            t = rx.sub(self._repl(en if lang == "en" else nl), t)
        for zh, tr in self.phrases:
            if zh in t:
                t = t.replace(zh, tr[i])
        if HAN_RE.search(t):
            return None
        return self._tidy(t, lang)

    def translate(self, s, lang):
        """回傳譯文；無中文時只處理標點與歐元格式；翻不完整的段落保留中文原文。"""
        i = 0 if lang == "en" else 1
        if s in self.exact:
            return self.euro(self.exact[s][i], lang)
        out = []
        for seg in [x.strip() for x in s.split("；")]:
            if not seg:
                continue
            t = self.segment(seg, lang)
            if t is None:
                self.missing[seg] = self.missing.get(seg, 0) + 1
                t = seg
            out.append(t)
        return self.euro("; ".join(out), lang)


def collect_strings(obj, key=None, acc=None):
    acc = set() if acc is None else acc
    if key in I18N_SKIP_KEYS:
        return acc
    if isinstance(obj, str):
        if CJK_RE.search(obj) or "€" in obj:
            acc.add(obj)
    elif isinstance(obj, list):
        for x in obj:
            collect_strings(x, key, acc)
    elif isinstance(obj, dict):
        for k, v in obj.items():
            collect_strings(v, k, acc)
    return acc


def build_i18n(site):
    path = ROOT / "web" / "i18n.json"
    cfg = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    tr = Translator(cfg)
    strings = sorted(collect_strings(site))
    maps = {lang: {} for lang in LANGS}
    for s in strings:
        for lang in LANGS:
            t = tr.translate(s, lang)
            if t != s:
                maps[lang][s] = t
    if tr.missing:
        print(f"多語系：{len(tr.missing)} 段中文沒有翻譯（網站會顯示中文原文），請在 web/i18n.json 的 data 補上：", file=sys.stderr)
        for seg in sorted(tr.missing):
            print(f"  未翻譯：{seg}", file=sys.stderr)
    else:
        print(f"多語系：{len(strings)} 段資料文字全部有英文／荷蘭文翻譯")
    return cfg.get("ui", {}), maps


LEVEL_MIN_POINTS = 7      # 少於這麼多天的歷史就不顯示價格水準（避免誤導）
LEVEL_WINDOW_DAYS = 90    # 只看最近 90 天


def percentile(vals, q):
    """線性內插百分位數（同 numpy 預設）。"""
    v = sorted(vals)
    if not v:
        return None
    i = (len(v) - 1) * q
    lo, hi = int(i), min(int(i) + 1, len(v) - 1)
    return v[lo] + (v[hi] - v[lo]) * (i - lo)


def price_level(hist, cur_pb, cur_date):
    """依該商品自己的「每日最低有效單價」歷史，判斷今日最低價偏低／一般／偏高。
    低＝≤ 第 25 百分位，高＝≥ 第 75 百分位；資料不足時只回報累積天數。"""
    if cur_pb is None:
        return None
    start = (dt.date.fromisoformat(cur_date) - dt.timedelta(days=LEVEL_WINDOW_DAYS)).isoformat()
    vals = [h["pb"] for h in hist if h.get("pb") is not None and start < h["date"] <= cur_date]
    n = len(vals)
    if n < LEVEL_MIN_POINTS:
        return {"status": "collecting", "n": n, "need": LEVEL_MIN_POINTS}
    p25, p75 = percentile(vals, .25), percentile(vals, .75)
    lo, hi = min(vals), max(vals)
    eps = 1e-6
    tol = max(eps, lo * 0.005)
    if hi - lo <= tol:                        # 整段期間價格幾乎沒變動
        level = "typical"
    elif cur_pb <= lo + tol:                  # 等於期間最低價 → 偏低（即使 p25＝p75）
        level = "low"
    elif cur_pb >= hi - tol:                  # 等於期間最高價 → 偏高
        level = "high"
    elif p75 - p25 <= max(eps, p25 * 0.005):  # 中間價格集中，不在兩端 → 一般
        level = "typical"
    elif cur_pb <= p25 + eps:
        level = "low"
    elif cur_pb >= p75 - eps:
        level = "high"
    else:
        level = "typical"
    r = lambda x: round(x, 4)
    return {"status": "ok", "n": n, "level": level, "cur": r(cur_pb),
            "min": r(lo), "p25": r(p25), "p75": r(p75), "max": r(hi),
            "since": min(h["date"] for h in hist if start < h["date"] <= cur_date)}


def fmt_date_zh(d):
    return f"{d.year}年{d.month}月{d.day}日"


def build(src: Path):
    cfg = json.loads((ROOT / "site.config.json").read_text(encoding="utf-8"))
    data = json.loads((src / "prices.json").read_text(encoding="utf-8"))
    obs = [o for o in data.get("observations", []) if o.get("product") and o.get("date")]
    dates = sorted({o["date"] for o in obs})
    latest = data.get("last_updated") or (dates[-1] if dates else None)
    latest_obs_date = dates[-1] if dates else latest

    # 商品清單：設定檔順序優先，新商品自動附加
    pids = [p for p in cfg.get("product_order", []) if p in {o["product"] for o in obs} or p in data.get("products", {})]
    for p in list(data.get("products", {}).keys()) + [o["product"] for o in obs]:
        if p not in pids:
            pids.append(p)

    OUT.mkdir(exist_ok=True)
    (OUT / "assets" / "products").mkdir(parents=True, exist_ok=True)

    products = []
    for pid in pids:
        meta = cfg.get("products", {}).get(pid, {})
        pdata = data.get("products", {}).get(pid, {})
        unit_word = meta.get("unit_word", "份")
        base = product_base(pdata)
        category = product_category(pdata, meta, base)
        pobs = [o for o in obs if o["product"] == pid]
        if not pobs:
            continue
        pdates = sorted({o["date"] for o in pobs})
        cur_date = pdates[-1]
        cur = [offer_view(o, unit_word, base) for o in pobs if o["date"] == cur_date]
        cur = [c for c in cur if c["unit"] is not None]
        cur.sort(key=lambda c: (not (c["in_stock"] and c["verified"]), c["pb"] if c["pb"] is not None else 9e9))
        main = [c for c in cur if c["in_stock"] and c["verified"]]
        best = main[0] if main else None

        # 價格歷史：每日 in_stock+verified 最低有效單價
        hist = []
        for d in pdates:
            day = [o for o in pobs if o["date"] == d and is_main(o)]
            vals = [offer_view(o, unit_word, base) for o in day]
            vals = [v for v in vals if v["unit"] is not None]
            if not vals:
                continue
            bv = min(vals, key=lambda v: v["pb"] if v["pb"] is not None else 9e9)
            ot = [one_time_unit(o) for o in day]
            ot = [x for x in ot if x is not None]
            hist.append({"date": d, "unit": round(bv["unit"], 3),
                         "per100g": round(bv["per100g"], 3) if bv["per100g"] else None,
                         "pb": round(bv["pb"], 4) if bv["pb"] is not None else None,
                         "one_time_unit": round(min(ot), 3) if ot else None})

        # 新低價徽章
        badge = None
        if best:
            prev = [h["pb"] for h in hist if h["date"] < cur_date and h["pb"]]
            ever_key = {"100g": "eur_per_100g", "g": "eur_per_g", "kg": "eur_per_kg", "L": "eur_per_l", "capsule": "eur_per_capsule"}[base]
            ever = num((pdata.get("lowest_unit_price_ever") or {}).get(ever_key))
            prev_min = min(prev) if prev else None
            if prev_min is None:
                badge = {"kind": "first", "text": "首次紀錄"}
            elif best["pb"] < prev_min - 1e-6:
                badge = {"kind": "new_low", "text": "新低價", "prev": prev_min}
            elif abs(best["pb"] - prev_min) <= 1e-6:
                badge = {"kind": "at_low", "text": "持平歷史低價"}
            else:
                pct = (best["pb"] / prev_min - 1) * 100
                badge = {"kind": "above", "text": f"比歷史低價高 {pct:.0f}%", "prev": prev_min}
            if ever and badge["kind"] in ("above",) and best["pb"] <= ever + 1e-6:
                badge = {"kind": "at_low", "text": "持平歷史低價"}

        # 單次購買最低（不需訂閱）
        ot_best = None
        for c in main:
            v = c["unit"] if not c["autoship"] else c["one_time_unit"]
            vpb = c["pb"] if not c["autoship"] else c["one_time_pb"]
            if v is not None and vpb is not None and (ot_best is None or vpb < ot_best["pb"]):
                ot_best = {"shop": c["shop"], "variant": c["variant"], "unit": v, "unit_g": c["unit_g"], "url": c["url"],
                           "per100g": vpb if base == "100g" else None, "pb": vpb}

        # 註：設定檔中的 "target"（比價目標）已不再使用，也不輸出到網站。

        img = meta.get("image")
        img_out = None
        if img and (ROOT / img).exists():
            shutil.copy2(ROOT / img, OUT / img)
            img_out = img
        else:
            print(f"警告：{pid} 沒有商品圖片，使用預設圖", file=sys.stderr)

        name = meta.get("name") or pdata.get("product_name") or pid
        products.append({
            "id": pid,
            "brand": meta.get("brand", ""),
            "chip": meta.get("chip", ""),
            "name": name,
            "desc": meta.get("desc", ""),
            "pack": meta.get("pack", ""),
            "unit_word": unit_word,
            "base": base,
            "category": category,
            "age": product_age(pdata, meta, category),
            "deal": has_deal(best),
            "drop": price_drop(hist, best["pb"] if best else None, cur_date),
            "image": img_out,
            "date": cur_date,
            "best": best,
            "one_time_best": ot_best if (ot_best and best and ot_best["unit"] > best["unit"] + 1e-9) else None,
            "badge": badge,
            "level": price_level(hist, best["pb"] if best else None, cur_date),
            "history": hist,
            "offers": cur,
            "main_count": len(main),
            "shop_count": len({c["shop"] for c in main}),
            "mixed_sizes": len({c["size"] for c in cur}) > 1,
        })

    promos_all = [p for p in data.get("sitewide_promos", []) if p.get("date") == max((x.get("date", "") for x in data.get("sitewide_promos", [])), default="")]
    promos = [{"shop": p["shop"], "text": strip_paren(p.get("promo"))} for p in promos_all if p.get("status") == "verified"]
    promos_other = [{"shop": p["shop"], "text": p.get("promo"), "status": p.get("status")} for p in promos_all if p.get("status") != "verified"]

    now = dt.datetime.now(TZ)
    upd = dt.date.fromisoformat(latest) if latest else now.date()
    nxt = upd + dt.timedelta(days=cfg.get("update_interval_days", 2))
    site = {
        "title": cfg.get("site_title", "幼貓飼料比價"),
        "updated": latest,
        "updated_zh": fmt_date_zh(upd),
        "next_zh": f"{nxt.month}月{nxt.day}日",
        "next": nxt.isoformat(),
        "generated_zh": now.strftime("%Y-%m-%d %H:%M"),
        "location": "鹿特丹",
        # 意見回饋 Google 表單網址：填在 site.config.json 的 "feedback_url"；空字串時網站不顯示入口
        "feedback_url": (cfg.get("feedback_url") or "").strip(),
        "products": products,
        "promos": promos,
        "details": {
            "promos_other": promos_other,
            "unverified": data.get("unverified", []),
            "assumptions": (data.get("cashback") or {}).get("assumptions"),
        },
    }
    site = apply_display_names(site, cfg.get("cashback_display_names"))
    # 返現網站邀請連結：只列出今日資料實際用到的（見 cashback_invites()；比對改名後的顯示名稱）
    site["cashback_invites"] = cashback_invites(cfg, site["products"])
    site["ui"], site["i18n"] = build_i18n(site)
    js = json.dumps(site, ensure_ascii=False, separators=(",", ":"))
    (OUT / "data.json").write_text(json.dumps(site, ensure_ascii=False, indent=1), encoding="utf-8")
    for f in ("style.css", "app.js"):
        shutil.copy2(ROOT / "web" / f, OUT / "assets" / f)
    for f in (ROOT / "web" / "icons").iterdir():
        shutil.copy2(f, OUT / f.name)
    ver = now.strftime("%Y%m%d%H%M")
    html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    html = html.replace("__DATA__", js.replace("</", "<\\/")).replace("__VER__", ver)
    html = html.replace("__TITLE__", site["title"]).replace("__UPDATED__", site["updated_zh"])
    (OUT / "index.html").write_text(html, encoding="utf-8")
    (OUT / ".nojekyll").write_text("")
    cats = {c: sum(p["category"] == c for p in products) for c in CATEGORIES}
    unknown_age = [p["id"] for p in products if p["category"] in ("wet", "dry") and not p["age"]]
    if unknown_age:
        print("提醒：這些商品無法判斷適用年齡（篩選時照樣顯示），可在 site.config.json 加 \"age\"：" + "、".join(unknown_age))
    print(f"完成：{len(products)} 項商品（" + "、".join(f"{c} {n}" for c, n in cats.items() if n) + f"），資料日期 {latest}，輸出 {OUT}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", help="prices.json 所在資料夾")
    a = ap.parse_args()
    cfg = json.loads((ROOT / "site.config.json").read_text(encoding="utf-8"))
    build(Path(a.source or cfg["source_dir"]))
