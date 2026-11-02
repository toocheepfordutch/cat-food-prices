# 幼貓飼料比價網站：更新方式

原始碼：`/workspace/cat-food-site`（box）
資料來源（唯讀，由價格追蹤 bot 每 2 天約 09:00 荷蘭時間更新）：
`/cursor/stores/store-07c67034-b23d-4a5a-9f26-e791b261bad1/cat-wetfood/prices.json`

## 結構
- `build.py`：讀 prices.json → 產生 `docs/`（index.html 內嵌資料、data.json、assets/）。不會寫入資料來源。
- `site.config.json`：商品順序、中文名稱、圖片（`target` 欄位已停用，網站不再顯示比價目標）。新商品若未設定會自動加入（使用貓咪佔位圖）。
- `web/`：版型（index.html、style.css、app.js）與多語系文字 `i18n.json`。
- 分類分頁：網站依商品的 `category`（prices.json，`wet`／`dry`／`litter`／`care`）分成濕食、乾飼料、貓砂、保健四個分頁，一次只顯示一類，沒有商品的分類不顯示；目前分頁存在 localStorage（`catfood.tab.v1`）。單價單位依 `unit_basis`／`unit` 自動判斷（濕食 €/100g、乾飼料 €/kg、貓砂 €/L、保健 €/g）；prices.json 沒寫 category 時，可在 config 寫 `"category"`，再不然依單位推斷。config 的 `chip` 是商品勾選清單的短名稱（例如 ORIJEN 各口味只寫 `Kitten`、`Six Fish`），沒寫就用品牌。
- 版面：寬度 ≥ 900px 時左側有固定側欄（約 220px，分類＋數量、排序、篩選、商品勾選清單），右側只放商品；手機上方一排分類分頁，「篩選」按鈕打開底部面板（排序、篩選、商品勾選清單）。
- 篩選與排序：品牌、年齡（幼貓／成貓／全齡）、「只看有折扣或返現」，可以疊加；只顯示目前分類用得到、而且有 2 種以上值的篩選。排序：每單位最便宜（預設）、降價最多（比近 30 天高點低多少 %，沒有更早紀錄算 0）、最近更新。設定存在 `catfood.view.v1`（排序全站共用，篩選每個分類各自記住）。
  - 年齡來源：config 的 `"age"`（`kitten`／`adult`／`all`）優先，其次 prices.json 的 `life_stage`／`age`，再不然從濕食／乾飼料的品名猜；猜不到的商品在篩選時一律顯示，build 會印「提醒」列出來，最好補進 config（ORIJEN 的來源記在 config 的 `_age_sources`）。「全齡」商品在選幼貓或成貓時也會出現。
  - 「有折扣或返現」＝最低價那一家有返現／促銷標籤、新客優惠，或售價低於原價。
- 關注篩選：訪客可在商品勾選清單取消勾選不想看的商品，選擇存在 localStorage（`catfood.hidden.v1`，記錄「隱藏」的商品 id），新商品預設顯示、已移除的 id 自動忽略；會跟上面的篩選一起套用。
- `assets/products/`：商品圖（自行託管，不外連）。新增商品時放一張 480×480 webp 並在 config 指定。
- `shoot.py`：headless Chrome 截圖檢查（390×844、1280×800）。Playwright 互動測試（分頁、篩選、排序、重新整理後保留）見 /workspace/shoot_filters.py（不在 repo 裡，斷言依當天資料寫死）。

## 每次更新（約每 2 天，資料更新後 10:00 以後）
```bash
cd /workspace/cat-food-site
python3 build.py                       # 重新產生 docs/；若輸出有「未翻譯：」請依下方「多語系」補 web/i18n.json
python3 shoot.py /workspace/screenshots   # 選用：截圖檢查
git add -A && git commit -m "更新價格 $(date +%F)" && git push   # GitHub Pages（main /docs）會自動部署
```

## 第一次發佈到 GitHub Pages
1. 在 GitHub 建立空的公開 repo：`yeeee0919/cat-food-prices`（不要勾 README）。
2. ```bash
   cd /workspace/cat-food-site
   gh auth login            # 或設定可推送的 remote 認證
   git remote add origin https://github.com/yeeee0919/cat-food-prices.git
   git push -u origin main
   ```
3. Repo → Settings → Pages → Source: Deploy from a branch → `main` / `/docs`。
4. 網址：https://yeeee0919.github.io/cat-food-prices/

## 備用：ShipStatic（免帳號，匿名部署 3 天後失效，需開 claim 連結保留）
```bash
npx -y @shipstatic/ship ./docs
```

## 意見回饋（Google 表單）
在 `site.config.json` 的 `"feedback_url"` 填入表單網址（例如 `"https://forms.gle/xxxx"`），執行 `python3 build.py` 後推送。空字串時網站不顯示入口。

## 價格水準膠囊
`build.py` 的 `price_level()`：取該商品最近 90 天「每日最低有效單價」（與走勢圖相同），≥ 7 天才顯示；今日 ≤ 第 25 百分位＝偏低、≥ 第 75 百分位＝偏高、其餘＝一般。不足 7 天顯示「資料累積中」。

## 返現網站邀請連結（`cashback_invites`）
`site.config.json` 的 `"cashback_invites"`：`{ "返現網站名稱": "站長邀請連結" }`（目前存了 Woolsocks、CashbackXL、TopCashback UK／US、iGraal (DE)、ShopBack、Social Deal 共 7 個）。
- `build.py` 的 `cashback_invites()` 只輸出「今日資料實際用到」的網站：比對網站上各商品今日報價的返現標籤（`cashback_portal`，去掉括號內文字）與新客返現（`cashback_new_customer.portal`）。名稱比對忽略大小寫與空白，需與 prices.json 的 portal 名稱一致（例如 `ShopBuddies（Woolsocks All-in-One 禮品卡）` 視為 ShopBuddies，不算 Woolsocks）。
- 符合的網站會出現在頁尾上方「先註冊返現網站，買罐罐再拿回一點錢」區塊（每站一顆按鈕），同時報價上的「XXX 返現 €x.xx」標籤也會連到該邀請連結；連結皆 `target="_blank" rel="noopener sponsored"`。
- 資料裡出現新的返現網站時會自動顯示；沒有對應邀請連結的網站（例如 ShopBuddies）不會列出，要加就在設定檔補一筆，名稱與 portal 相同即可。沒有任何符合的網站時整個區塊不顯示。
- 不要寫註冊獎金金額（未核實）。

### 返現網站顯示名稱（`cashback_display_names`）與註冊備註（`cashback_invite_notes`）
- `"cashback_display_names"`：`{ 原名: 顯示名 }`，`build.py` 的 `apply_display_names()` 在輸出前把網站資料中所有文字（不含 url 欄位）替換，長的先換。目前：`ShopBuddies（Woolsocks All-in-One 禮品卡）` → `Woolsocks（All-in-One 禮品卡）`、`ShopBuddies` → `Woolsocks`。prices.json 仍寫 ShopBuddies，網站上一律顯示 Woolsocks。
- 邀請連結的比對用「改名後」的名稱，所以 ShopBuddies 的報價會對到 `cashback_invites` 的 Woolsocks。
- `"cashback_invite_notes"`：`{ 顯示名: 備註 }`，顯示在註冊按鈕下方的灰色小字（目前 Woolsocks：「返現確認可能要等幾個月」）。

## 多語系（中文／English／Nederlands，`web/i18n.json`）

- 右上角語言選單：預設依裝置語言（`navigator.languages` 第一個 zh→中文、nl→荷蘭文、en 或其他→英文），手動選擇存在瀏覽器 localStorage `catfood.lang.v1`（與關注商品 `catfood.hidden.v1` 分開）。`<html lang>`、標題、頁首、按鈕、FAB、頁尾都會跟著切換；荷蘭文金額用逗號（€1,16）。
- **介面文字**：`web/i18n.json` 的 `ui`，每個 key 是 `[中文, English, Nederlands]`，`{0}`、`{1}` 是代入值。改字只改這裡，`app.js` 不用動。
- **資料文字**（prices.json 裡的中文：規格、標籤、優惠、備註…）在 `python3 build.py` 時翻譯，結果內嵌到網頁。商品名稱的品牌／英文部分與商店名稱維持原文，只翻中文描述。規則在 `data`：
  1. `exact`：整句對照（最優先）。
  2. 其餘句子以「；」切段，每段依序套用 `patterns`（正規式，`$1` 代入，**順序有意義，較具體的放前面**），再套用 `phrases`（片語，長的先換），最後把全形標點轉半形。
  3. 某一段換完仍有中文 → 該段在英／荷文版**保留中文原文**（網站不會壞），並在 build 輸出列出：
     `多語系：N 段中文沒有翻譯… 未翻譯：<原文>`
- **補翻譯**：每次 build 後看有沒有「未翻譯：」。有的話：
  - 常見詞（新口味、新單位）→ 加到 `phrases`，例如 `"鴨肉": ["duck", "eend"]`。
  - 有數字的固定句型 → 加到 `patterns`，例如 `["(\\d+) 罐起每罐 (€[\\d.,]+)", "$2 per can from $1 cans", "$2 per blik vanaf $1 blikken"]`（放在會搶先吃掉同一段文字的較通用規則之前）。
  - 一次性的長句 → 加到 `exact` 或當成整段片語加到 `phrases`。
  - 再跑 `python3 build.py`，直到顯示「全部有英文／荷蘭文翻譯」，再 commit。
