#!/usr/bin/env python3
"""追蹤價格（其他）比價網站產生器（架構比照貓品比價站 cat-food-prices）。

讀取價格追蹤資料（Google Sheet，--source sheet），產生本站靜態網站。
本站是貓站的子站，輸出固定在貓站 repo 的 docs/price-tracker/：
  docs/price-tracker/index.html   （內嵌同一份資料，首屏無需額外請求）
  docs/price-tracker/data.json    （同一份資料，方便除錯或其他用途）
  docs/price-tracker/assets/      （style.css、app.js，由 web/ 複製）
  docs/price-tracker/images/      （商品圖，由本目錄 images/ 複製）
  favicon 等圖示（由 web/icons/ 複製到 docs/price-tracker/）

本檔放在貓站 repo 的 price-tracker/ 子目錄，OUT 以此檔位置推算，
不寫貓站 docs/ 根目錄的任何檔案（index.html、data.json、assets/ 皆為貓站所有），
兩站互不影響。GitHub Pages 來源為 main 分支 docs/ 資料夾。

用法： python3 build.py --source sheet   （讀 Google Sheet，見下）
每日流程：排程查價寫入 Sheet → GitHub Actions（.github/workflows/
build-price-tracker.yml）每日兩次跑本檔重建子站。

Google Sheet 模式（--source sheet）：資料家在 Google Sheet
「追蹤價格（其他）資料」（ID 寫在 site.config.json 的 sheet_id），
每商品一個分頁（標題＝slug）＋ platforms 分頁。build 以匿名 gviz CSV
匯出抓取（試算表須設為「知道連結者可檢視」），驗證通過才產生網站；
驗證或抓取失敗會以非零碼結束且不覆寫任何輸出。GitHub Actions 用此模式。
"""
import csv
import datetime as dt
import io
import json
import re
import shutil
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
# 子站輸出：貓站 repo 的 docs/price-tracker/（Pages 來源為 docs/）。
# 只寫這個子目錄，不碰 docs/ 根目錄的貓站檔案。
OUT = ROOT.parent / "docs" / "price-tracker"
TZ = ZoneInfo("Europe/Amsterdam")

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# ── 可買判斷（CSV 沒有庫存欄，庫存／寄送狀態寫在 note 自由文字裡）──────────
# 不寄荷蘭的平台（platforms.json／官網條款已查證）：在 site.config.json 的
# products.<slug>.blocked_platforms 設定，{平台名: 原因}，直接排除於最佳價。
# 其餘以 note 文字判斷：先看負面訊號（缺貨、售罄、僅到貨通知…），
# 若同時有正面訊號（有貨、現貨、可訂…，且不是「無貨」「不可訂」的子字串）
# 則以正面為準（同一列常會提到其他規格缺貨）。
NEG_MARKERS = [
    "缺貨", "無貨", "售罄", "僅到貨通知", "無購物車", "不可訂", "404",
    "下架", "未販售", "無此商品", "搜尋0結果", "搜尋 0 結果", "按鈕停用",
    "uitverkocht", "niet leverbaar", "niet op voorraad", "out of stock",
    "nicht auf lager",
]
POS_PATTERNS = [
    r"(?<!無)有貨(?!時)", r"(?<!無)現貨", r"(?<!不)可訂", r"可加購物車",
    r"(?<!無)有庫存", r"已訂", r"到貨窗", r"預計[^；]*到貨", r"可送荷蘭",
    r"op voorraad", r"in stock",
]


def is_date(v):
    return bool(v and DATE_RE.match(v.strip()))


def is_verified(row):
    return row["verified"].lower().startswith("yes")


def num(v):
    try:
        return None if v is None or str(v).strip() == "" else float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


EXPECTED_HEADER = ["group", "date", "platform", "seller", "variant", "url",
                   "price", "shipping", "threshold", "promo", "cashback_pct",
                   "cashback_eur", "net_total", "verified", "note"]
OLD_KEYS = ["platform", "seller", "date", "variant", "price",
            "shipping", "threshold", "promo", "cashback_pct",
            "cashback_eur", "net_total", "verified", "note"]
ROW_KEYS = ("date", "platform", "seller", "variant", "url", "price",
            "shipping", "threshold", "promo", "cashback_pct",
            "cashback_eur", "net_total", "verified", "note")


def normalize_rows(raw_rows):
    """把 csv.reader 的輸出（含表頭列）正規化為 build 用的列 dict。

    兩種版式：
    標準：group,date,platform,seller,variant,url,price,shipping,threshold,
          promo,cashback_pct,cashback_eur,net_total,verified,note
    舊版（2026-11-10 列，無 group／url）：
          platform,seller,date,variant,price,shipping,threshold,promo,
          cashback_pct,cashback_eur,net_total,verified,note
    """
    if not raw_rows:
        return []
    header = raw_rows[0]
    rows = []
    for raw in raw_rows[1:]:
        if not raw or all(not c.strip() for c in raw):
            continue
        if len(raw) >= 3 and is_date(raw[2]) and not is_date(raw[1]):
            row = dict(zip(OLD_KEYS, raw))
            row.setdefault("url", "")
            row.setdefault("group", "")
        else:
            row = dict(zip(header, raw))
        rows.append({k: (row.get(k) or "").strip() for k in ROW_KEYS})
    return rows


def read_rows(slug, src_dir):
    """讀本機 prices.csv 並正規化欄位（版式說明見 normalize_rows）。"""
    path = src_dir / slug / "prices.csv"
    with path.open(encoding="utf-8-sig", newline="") as fh:
        return normalize_rows(list(csv.reader(fh)))


# ── Google Sheet 來源（--source sheet）────────────────────────────────────
class SheetError(RuntimeError):
    """Sheet 抓取或驗證失敗：呼叫端應以非零碼結束，不覆寫任何輸出。"""


def fetch_sheet_tab(sheet_id, tab):
    url = ("https://docs.google.com/spreadsheets/d/" + sheet_id +
           "/gviz/tq?tqx=out:csv&sheet=" + urllib.parse.quote(tab))
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (price-tracker build)"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8-sig")
    except urllib.error.HTTPError as e:
        raise SheetError(
            f"抓取分頁「{tab}」失敗：HTTP {e.code}。"
            "若為 401/403，表示試算表尚未開放「知道連結的使用者可檢視」，"
            "請先在 Google Sheets 介面設定分享後再重跑。")
    except urllib.error.URLError as e:
        raise SheetError(f"抓取分頁「{tab}」失敗：{e}")
    if body.lstrip()[:200].lower().startswith(("<!doctype", "<html")):
        raise SheetError(
            f"抓取分頁「{tab}」回傳的不是 CSV（疑似登入頁）："
            "試算表尚未開放「知道連結的使用者可檢視」，請先在 Google Sheets 介面設定分享。")
    return body


def validate_sheet_rows(slug, raw_rows, local_count):
    """Sheet 模式的資料驗證。任何一項不過就 raise SheetError。

    - 表頭前 15 欄須與 EXPECTED_HEADER 完全一致（多出的尾欄須為空）。
    - 資料列數（非空列）不得少於本機 CSV（本機檔存在時）。
    - 每列 date 須為合法 ISO 日期。
    - price 非空時須可解析為數字；net_total 非空時須可解析為數字，
      或為歷史欄位錯位的 verified 字串（yes/no 開頭，既有資料共 20 列，
      本機模式亦同樣被 num() 判為無報價，屬已知遺留、只警告不擋）。
    """
    if not raw_rows:
        raise SheetError(f"{slug}：分頁是空的")
    header = [c.strip() for c in raw_rows[0]]
    if header[:15] != EXPECTED_HEADER or any(c for c in header[15:]):
        raise SheetError(f"{slug}：表頭不符。預期 {EXPECTED_HEADER}，實際 {header}")
    data = [r for r in raw_rows[1:] if r and any(c.strip() for c in r)]
    if local_count is not None and len(data) < local_count:
        raise SheetError(f"{slug}：Sheet 列數 {len(data)} 少於本機 CSV {local_count} 列")
    rows = normalize_rows(raw_rows)
    legacy = 0
    for i, row in enumerate(rows, 1):
        v = row["date"]
        if not is_date(v):
            raise SheetError(f"{slug}：第 {i} 列 date 不是 ISO 日期：{v!r}")
        try:
            dt.date.fromisoformat(v)
        except ValueError:
            raise SheetError(f"{slug}：第 {i} 列 date 無法解析：{v!r}")
        if row["price"] and num(row["price"]) is None:
            raise SheetError(f"{slug}：第 {i} 列 price 無法解析為數字：{row['price']!r}")
        nt = row["net_total"]
        if nt and num(nt) is None:
            if re.match(r"^(yes|no)(\(|$)", nt):
                legacy += 1
            else:
                raise SheetError(f"{slug}：第 {i} 列 net_total 無法解析為數字：{nt!r}")
    if legacy:
        print(f"警告：{slug} 有 {legacy} 列 net_total 為歷史錯位的 verified 字串"
              f"（與本機資料一致，照舊判為無報價）", file=sys.stderr)
    return rows


def read_rows_sheet(slug, sheet_id, src_dir):
    body = fetch_sheet_tab(sheet_id, slug)
    raw_rows = list(csv.reader(io.StringIO(body)))
    local_count = None
    local_path = src_dir / slug / "prices.csv"
    if local_path.exists():
        with local_path.open(encoding="utf-8-sig", newline="") as fh:
            local_count = sum(1 for r in csv.reader(fh)
                                if r and any(c.strip() for c in r)) - 1
    return validate_sheet_rows(slug, raw_rows, local_count)


def read_platforms_sheet(sheet_id):
    """從 platforms 分頁重建 build 需要的 platforms 資料：
    {slug: {"unverified": [{site, reason}], "product": <(meta) 列的 product>}}。
    build 只用到 unverified 與 product（且 product 僅為 config 缺名時的備援）。"""
    body = fetch_sheet_tab(sheet_id, "platforms")
    raw_rows = list(csv.reader(io.StringIO(body)))
    if not raw_rows or [c.strip() for c in raw_rows[0]] != \
            ["product", "platform", "seller", "url", "status", "note"]:
        raise SheetError("platforms：表頭不符，預期 product,platform,seller,url,status,note")
    out = {}
    for raw in raw_rows[1:]:
        if not raw or all(not c.strip() for c in raw):
            continue
        slug, platform, _seller, _url, status, note = \
            [(c or "").strip() for c in (list(raw) + [""] * 6)[:6]]
        entry = out.setdefault(slug, {"unverified": [], "product": ""})
        if status == "unverified":
            entry["unverified"].append({"site": platform, "reason": note})
        elif platform == "(meta)":
            try:
                entry["product"] = json.loads(note).get("product", "") or entry["product"]
            except (ValueError, AttributeError):
                pass
    return out


def read_platforms(slug, src_dir):
    path = src_dir / slug / "platforms.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def blocked_reason(row, blocked):
    for name, reason in (blocked or {}).items():
        if name and (name == row["platform"] or name in row["platform"] or row["platform"] in name):
            return reason
    return None


def assess(row, blocked):
    """回傳 (purchasable, blocked_reason)。
    purchasable＝已核實、有淨價、未被平台封鎖、且 note 未顯示缺貨
    （或同時有正面有貨訊號）。比照貓站 best 只計 in_stock+verified 的邏輯。"""
    reason = blocked_reason(row, blocked)
    if reason:
        return False, reason
    if not is_verified(row) or num(row["net_total"]) is None:
        return False, None
    text = row["note"]
    low = text.lower()
    neg = any(m in low for m in NEG_MARKERS)
    if not neg:
        return True, None
    pos = any(re.search(p, text) for p in POS_PATTERNS)
    return pos, None


def shipping_label(shipping):
    s = (shipping or "").strip()
    if not s:
        return ""
    if s == "0":
        return "免運"
    v = num(s)
    if v is not None:
        return "免運" if v == 0 else f"運費 €{v:.2f}"
    return s


def offer_tags(row, aliases):
    tags = []
    sl = shipping_label(row["shipping"])
    if sl:
        tags.append({"k": "ship", "t": sl})
    th = (row["threshold"] or "").strip()
    if th and th != sl and th != (row["shipping"] or "").strip():
        tags.append({"k": "cond", "t": th})
    promo = (row["promo"] or "").strip()
    if promo and promo != "無":
        tags.append({"k": "deal", "t": promo})
    cb_eur = num(row["cashback_eur"])
    m = re.search(r"([\d.]+)\s*%\s*([^（(]*)", row["cashback_pct"] or "")
    if m and cb_eur:
        portal = m.group(2).strip()
        portal = aliases.get(portal, portal)
        tag = {"k": "cash", "t": (f"{portal} 返現約 €{cb_eur:.2f}" if portal else f"返現約 €{cb_eur:.2f}")}
        if portal:
            tag["p"] = portal
        tags.append(tag)
    return tags


def offer_view(row, blocked, aliases):
    purchasable, breason = assess(row, blocked)
    if breason:
        status = breason
    elif not is_verified(row):
        status = "未核實"
    elif num(row["net_total"]) is None:
        status = "無報價"
    elif not purchasable:
        status = "缺貨／不可訂"
    else:
        status = ""
    return {
        "shop": row["platform"],
        "seller": row["seller"],
        "variant": row["variant"],
        "date": row["date"],
        "url": row["url"] if row["url"].startswith(("http://", "https://")) else "",
        "price": num(row["price"]),
        "shipping": row["shipping"],
        "shipping_label": shipping_label(row["shipping"]),
        "net": num(row["net_total"]),
        "verified": is_verified(row),
        "verified_text": row["verified"],
        "note": row["note"],
        "tags": offer_tags(row, aliases),
        "purchasable": purchasable,
        "blocked_reason": breason or "",
        "status_text": status,
        "carried": False,
    }


# ── 價格水準／徽章（移植自貓站 build.py 的 price_level／price_drop）────────
LEVEL_MIN_POINTS = 7
LEVEL_WINDOW_DAYS = 90


def percentile(vals, q):
    v = sorted(vals)
    if not v:
        return None
    i = (len(v) - 1) * q
    lo, hi = int(i), min(int(i) + 1, len(v) - 1)
    return v[lo] + (v[hi] - v[lo]) * (i - lo)


def price_level(hist, cur, cur_date):
    """依該商品自己的「每日最低可買淨價」歷史判斷今日偏低／一般／偏高。"""
    if cur is None or not cur_date:
        return None
    start = (dt.date.fromisoformat(cur_date) - dt.timedelta(days=LEVEL_WINDOW_DAYS)).isoformat()
    vals = [h["net"] for h in hist if h.get("net") is not None and start < h["date"] <= cur_date]
    n = len(vals)
    if n < LEVEL_MIN_POINTS:
        return {"status": "collecting", "n": n, "need": LEVEL_MIN_POINTS}
    p25, p75 = percentile(vals, .25), percentile(vals, .75)
    lo, hi = min(vals), max(vals)
    tol = max(1e-6, lo * 0.005)
    if hi - lo <= tol:
        level = "typical"
    elif cur <= lo + tol:
        level = "low"
    elif cur >= hi - tol:
        level = "high"
    elif p75 - p25 <= max(1e-6, p25 * 0.005):
        level = "typical"
    elif cur <= p25 + 1e-6:
        level = "low"
    elif cur >= p75 - 1e-6:
        level = "high"
    else:
        level = "typical"
    r = lambda x: round(x, 2)
    return {"status": "ok", "n": n, "level": level, "cur": r(cur),
            "min": r(lo), "p25": r(p25), "p75": r(p75), "max": r(hi)}


def price_drop(hist, cur, cur_date, days=30):
    """降價幅度（%）：目前價比過去 days 天（不含今天）每日最低價的最高點低多少。"""
    if cur is None or not cur_date:
        return 0.0
    start = (dt.date.fromisoformat(cur_date) - dt.timedelta(days=days)).isoformat()
    prev = [h["net"] for h in hist if start <= h["date"] < cur_date and h.get("net")]
    if not prev:
        return 0.0
    ref = max(prev)
    return round(max(0.0, (ref - cur) / ref * 100), 1)


def fmt_date_zh(d):
    return f"{d.year}年{d.month}月{d.day}日"


def build(source="local"):
    cfg = json.loads((ROOT / "site.config.json").read_text(encoding="utf-8"))
    src_dir = Path(cfg.get("source_dir") or ROOT.parent / "price-tracker-handoff")
    aliases = cfg.get("cashback_portal_aliases") or {}
    sheet_id = cfg.get("sheet_id")
    if source == "sheet" and not sheet_id:
        raise SheetError("site.config.json 未設定 sheet_id，無法使用 --source sheet")
    # Sheet 模式：先一次抓完 platforms 分頁（抓取/驗證失敗在此即中止，
    # 後續任何輸出都還沒寫入，符合「失敗不覆寫」的約定）
    sheet_platforms = read_platforms_sheet(sheet_id) if source == "sheet" else {}

    # 商品清單：設定檔順序優先，handoff 有而設定沒寫的自動附加
    # （exclude_products 與 *-archived 資料夾除外，例如已停追的 newtral-chair）
    excluded = set(cfg.get("exclude_products") or [])
    pids = [p for p in cfg.get("product_order", []) if p not in excluded]
    if src_dir.exists():
        for d in sorted(src_dir.iterdir()):
            if (d / "prices.csv").exists() and d.name not in pids \
                    and d.name not in excluded and not d.name.endswith("archived"):
                pids.append(d.name)

    products = []
    unverified_all = []
    total_rows = 0
    latest_all = ""
    for pid in pids:
        meta = (cfg.get("products") or {}).get(pid, {})
        if source == "sheet":
            rows = read_rows_sheet(pid, sheet_id, src_dir)
            pdata = sheet_platforms.get(pid, {})
        else:
            rows = read_rows(pid, src_dir)
            pdata = read_platforms(pid, src_dir)
        total_rows += len(rows)
        blocked = meta.get("blocked_platforms") or {}
        views = [offer_view(r, blocked, aliases) for r in rows]
        dated = [v for v in views if is_date(v["date"])]
        if not dated:
            continue
        dates = sorted({v["date"] for v in dated})
        cur_date = dates[-1]
        latest_all = max(latest_all, cur_date)

        # 目前報價：最新查價日的列 + 補回（carried）先前查過、今天未重查的
        # （平台，賣家）最近一筆，標 carried、不參與最佳價（比照貓站規則）。
        cur = [v for v in dated if v["date"] == cur_date]
        cur_keys = {(v["shop"], v["seller"]) for v in cur}
        latest_by_key = {}
        for v in dated:
            if v["date"] == cur_date:
                continue
            k = (v["shop"], v["seller"])
            if k in cur_keys:
                continue
            if k not in latest_by_key or v["date"] >= latest_by_key[k]["date"]:
                latest_by_key[k] = v
        for v in latest_by_key.values():
            v = dict(v)
            v["carried"] = True
            cur.append(v)
        main = [v for v in cur if v["purchasable"] and not v["carried"]]
        main.sort(key=lambda v: v["net"])
        others = [v for v in cur if not (v["purchasable"] and not v["carried"])]
        others.sort(key=lambda v: v["net"] if v["net"] is not None else float("inf"))
        others.sort(key=lambda v: v["date"], reverse=True)  # 穩定排序：日期新到舊，同日淨價低到高
        offers = main + others
        best = main[0] if main else None

        # 價格歷史：每日最低可買淨價
        hist = []
        for d in dates:
            day = [v for v in dated if v["date"] == d and v["purchasable"]]
            if day:
                hist.append({"date": d, "net": round(min(v["net"] for v in day), 2)})

        # 新低價徽章（比照貓站）
        badge = None
        if best:
            prev = [h["net"] for h in hist if h["date"] < cur_date]
            prev_min = min(prev) if prev else None
            if prev_min is None:
                badge = {"kind": "first", "text": "首次紀錄"}
            elif best["net"] < prev_min - 1e-6:
                badge = {"kind": "new_low", "text": "新低價", "prev": prev_min}
            elif abs(best["net"] - prev_min) <= 1e-6:
                badge = {"kind": "at_low", "text": "持平歷史低價"}
            else:
                pct = (best["net"] / prev_min - 1) * 100
                badge = {"kind": "above", "text": f"比歷史低價高 {pct:.0f}%", "prev": prev_min}

        img = meta.get("image") or f"images/{pid}.jpg"
        if not (ROOT / img).exists():
            print(f"警告：{pid} 沒有商品圖片（{img}）", file=sys.stderr)
            img = None

        # 全部紀錄表：日期新到舊，同日維持檔案順序
        all_rows = sorted(enumerate(views),
                          key=lambda t: (t[1]["date"] or "", -t[0]), reverse=True)
        all_rows = [v for _, v in all_rows]

        for u in pdata.get("unverified") or []:
            unverified_all.append({
                "product": meta.get("name") or pid,
                "site": u.get("site", ""),
                "reason": u.get("reason", ""),
            })

        products.append({
            "id": pid,
            "brand": meta.get("brand", ""),
            "name": meta.get("name") or pdata.get("product") or pid,
            "desc": meta.get("desc") or pdata.get("product") or "",
            "image": img,
            "date": cur_date,
            "best": best,
            "badge": badge,
            "level": price_level(hist, best["net"] if best else None, cur_date),
            "drop": price_drop(hist, best["net"] if best else None, cur_date),
            "history": hist,
            "offers": offers,
            "rows": all_rows,
            "record_count": len(rows),
            "shop_count": len({v["shop"] for v in main}),
            "main_count": len(main),
        })

    # 返現邀請：只列目前報價實際用到的返現網站（比照貓站 cashback_invites）
    used = set()
    for p in products:
        for o in p["offers"]:
            for t in o["tags"]:
                if t.get("k") == "cash" and t.get("p"):
                    used.add(t["p"])
    invites = []
    for name, url in (cfg.get("cashback_invites") or {}).items():
        if name in used and (url or "").strip():
            invites.append({"name": name, "url": url.strip(),
                            "note": ((cfg.get("cashback_invite_notes") or {}).get(name) or "").strip()})

    now = dt.datetime.now(TZ)
    upd = dt.date.fromisoformat(latest_all) if latest_all else now.date()
    nxt = upd + dt.timedelta(days=cfg.get("update_interval_days", 1))
    site = {
        "title": cfg.get("site_title", "追蹤價格（其他）"),
        "site_sub": cfg.get("site_sub", ""),
        "updated": latest_all,
        "updated_zh": fmt_date_zh(upd),
        "next": nxt.isoformat(),
        "next_zh": f"{nxt.month}月{nxt.day}日",
        "generated_zh": now.strftime("%Y-%m-%d %H:%M"),
        "location": "鹿特丹",
        "products": products,
        "cashback_invites": invites,
        "details": {
            "assumptions": cfg.get("assumptions", ""),
            "unverified": unverified_all,
        },
    }
    js = json.dumps(site, ensure_ascii=False, separators=(",", ":"))
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "data.json").write_text(json.dumps(site, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "assets").mkdir(exist_ok=True)
    for f in ("style.css", "app.js"):
        shutil.copy2(WEB / f, OUT / "assets" / f)
    for f in (WEB / "icons").iterdir():
        shutil.copy2(f, OUT / f.name)
    # 商品圖：由 price-tracker/images/ 複製到子站 images/（頁面用相對路徑引用）
    (OUT / "images").mkdir(exist_ok=True)
    for f in (ROOT / "images").glob("*.jpg"):
        shutil.copy2(f, OUT / "images" / f.name)
    ver = now.strftime("%Y%m%d%H%M")
    html = (WEB / "index.html").read_text(encoding="utf-8")
    html = html.replace("__DATA__", js.replace("</", "<\\/")).replace("__VER__", ver)
    html = html.replace("__TITLE__", site["title"]).replace("__UPDATED__", site["updated_zh"])
    (OUT / "index.html").write_text(html, encoding="utf-8")
    (OUT / ".nojekyll").write_text("")
    # 舊版每商品一頁的產出已被單頁版取代，清掉避免誤傳舊頁
    for p in products:
        stale = OUT / f"{p['id']}.html"
        if stale.exists():
            stale.unlink()
            print(f"刪除舊版商品頁：{stale.name}")
    print(f"完成：{len(products)} 項商品、共 {total_rows} 筆紀錄，資料日期 {latest_all}，輸出 {OUT}")
    for p in products:
        b = p["best"]
        print(f"  {p['id']}: {p['record_count']} 筆，最佳價 " +
              (f"€{b['net']:.2f} @{b['shop']}" if b else "（無已核實可買價）"))


if __name__ == "__main__":
    source = "local"
    if "--source" in sys.argv:
        i = sys.argv.index("--source")
        if i + 1 >= len(sys.argv) or sys.argv[i + 1] not in ("local", "sheet"):
            print("用法：python3 build.py [--source local|sheet]", file=sys.stderr)
            sys.exit(2)
        source = sys.argv[i + 1]
    try:
        build(source=source)
    except SheetError as e:
        print(f"Sheet 模式中止（未覆寫任何輸出）：{e}", file=sys.stderr)
        sys.exit(1)
