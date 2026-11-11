# 假日骰骰 🎲

假日要帶家人出門，不知道去哪？骰一下就決定！
從新竹縣新豐出發，口袋名單都是事先挑過、適合帶小孩和長輩去的地方。

網址：https://weekend-dice.web.app/ （Firebase Hosting）
舊網址 https://bruce-hsieh.github.io/weekend-dice/ 搬家中，詳見 HANDOFF.md

## 功能
- **骰子**（首頁）：天空、小路和一台叭叭車；骰到幾點就去哪一區，再隨機挑一個地點
  - 1・2 點 → 近郊（≤30 分）
  - 3・4 點 → 小旅行（30–60 分）
  - 5 點 → 遠一點（60–90 分）
  - 6 點 → 出遠門（90 分以上）
  - 點路牌可以直接指定車程，再點一次交回給骰子
- **行前檢查**（條件，可多選）：雨天可去、推車長輩好走、免門票、附近有得吃、避開 30 天內去過
- **結果明信片**：郵票＋郵戳，一鍵 Google 地圖導航；按「就去這！」記到足跡
- **名單**：內建 140 個地點（票根造型），可搜尋、新增、編輯、刪除，或設定「先不要骰到」
- **足跡**：出門次數、去過的地方、時間軸，以及音樂／音效、匯出／匯入資料、還原名單、清除足跡等設定
- 叭叭車可以戳（叭叭叫），連戳會引擎過熱冒煙
- 音效＋背景音樂（口哨＋烏克麗麗），右上角可分別開關

## 風格
公路旅行明信片風：天空藍、草地綠、陽光黃、深藍描邊；字體用粉圓體（Huninn）；所有圖示都是自畫 SVG。

## 使用
用手機瀏覽器（Safari、Chrome 都可以）打開網址 → 分享 → 加入主畫面。
從 LINE 打開的話，先點右上角改用瀏覽器開啟。

## 檔案
- `HANDOFF.md`：交接文件（部署、資料、搬家狀態）
- `index.html`：整個 App（HTML＋CSS＋JS＋自畫 SVG，單一檔案）
- `version.json`：目前版本號，App 用它檢查新版
- `icons/`：主畫面圖示（檔名帶版號）
- `splash/`：iPhone 啟動圖（檔名帶版號）
- `tools/make_assets.py`：重新產生圖示與啟動圖的腳本（`python3 tools/make_assets.py .`）

## 資料說明
- 內建地點寫在 `index.html` 的 `BASE_RAW` 陣列：`[名稱, 地區, 車程分鐘, 標記, 備註]`
- 標記：雨＝雨天可去、走＝推車長輩好走、免＝免門票、吃＝附近有得吃
- 車程是從新豐出發、假日一般路況的估計值；級距依分鐘自動計算
- 使用者自己的修改存在手機瀏覽器（localStorage），內建名單更新時不會被蓋掉

## 部署
push 到 main → GitHub Actions 自動部署到 Firebase Hosting（設定見 `firebase.json`、`.github/workflows/firebase-hosting.yml`，金鑰在 GitHub Secrets `FIREBASE_SERVICE_ACCOUNT`）。

## 改版流程
1. 修改 `index.html`
2. 更新 `index.html` 裡的 `APP_VERSION` 和 `CHANGELOG`（最新放最上面）
3. 把 `version.json` 改成同一個版本號
4. commit 訊息第一行寫「vX.Y.Z：重點」

## 注意事項（踩過的坑）
- iPhone 只在「加入主畫面」時讀圖示和啟動圖；要換圖就**換檔名**（`v1-` → `v2-`），並請使用者刪掉圖示重新加入
- 開機畫面固定淺色：iOS 深色模式啟動會插一格白色（WebKit bug 311569）
- 開機畫面前 0.15 秒跟啟動圖一樣是空白底色；至少停 2.4 秒、最多 4 秒
- 更新說明等開機畫面結束後才跳；「看過的版本」只往前記
- 常駐動畫只用 transform／opacity；背景音樂用 `<audio>` 播預先渲染好的 WAV

Copyright © 2026 大樹

## v2 之後怎麼改（重要）
`index.html` 是用 `tools/v2src/compose.py` 組出來的，**不要直接改 index.html**：
- 邏輯：`tools/v2src/main.js`；版面：`body.html`；樣式：`top.css`、`theme.css`（配色）
- 地點資料：`spots_v3.js`（格式 `[名稱, 地區, 從新豐分鐘, 標記, 說明, 緯度, 經度]`）
- 台灣地圖：`map.json`（由 `build_q.mjs` 產生）；背景音樂：`bgm_pop.js`、`bgm_synth.js`
- 版號與改版紀錄：在 `compose.py` 的 VER 那段
- 改完執行 `python3 tools/v2src/compose.py`，會覆寫根目錄的 `index.html`
