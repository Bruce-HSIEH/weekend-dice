# HANDOFF：假日骰骰

給下一個接手的人（或下一次的 Claude）看的交接文件。

## 現況（2026-11-08）
- 版本：v1.1.0（點骰子本體、小露營車照點數前進、資料匯出／匯入、搬到 Firebase）
- 正在從 GitHub Pages 搬到 Firebase Hosting
  - 舊網址：https://bruce-hsieh.github.io/weekend-dice/ （GitHub Pages，main 分支 / root）
    - repo 名稱要維持全小寫 `weekend-dice`，改成 `Weekend-dice` 時舊的小寫網址會 404
  - 新網址：https://weekend-dice.web.app/ （Firebase Hosting，已上線）
- repo 之後會改成私人（由擁有者自己改）

## 架構
- 單一 `index.html`：HTML＋CSS＋JS＋自畫 SVG 全部內嵌，沒有建置步驟（build）
- `version.json`：目前版號，App 開啟／從背景叫回時用它檢查新版（只在 github.io、web.app、firebaseapp.com 網域檢查）
- `icons/`、`splash/`：主畫面圖示與 iPhone 啟動圖，檔名帶版號（`v1-`），換圖要換檔名
- 沒有 service worker、沒有 manifest、沒有後端
- `tools/make_assets.py`：重新產生圖示與啟動圖

## 部署（Firebase Hosting）
- push 到 `main` → GitHub Actions `.github/workflows/firebase-hosting.yml` → `FirebaseExtended/action-hosting-deploy` → 部署到正式網址
- 金鑰：GitHub repo → Settings → Secrets and variables → Actions → `FIREBASE_SERVICE_ACCOUNT`（Firebase 服務帳號 JSON），**絕對不要 commit 進 repo**
- Firebase 專案 ID 寫在 `.firebaserc` 和 workflow 的 `projectId`
- `firebase.json`：上傳 repo 根目錄，但排除 `tools/`、`README.md`、`HANDOFF.md`、隱藏檔；`index.html`、`version.json` 不快取，圖片長快取
- 方案：Firebase 免費 Spark，不綁信用卡；一個 App 一個 Firebase 專案
- 手動重新部署：GitHub → Actions → Deploy to Firebase Hosting → Run workflow
- 服務帳號 `firebase-adminsdk-fbsvc@weekend-dice.iam.gserviceaccount.com` 除了預設角色，還要在 Google Cloud IAM 加這三個，不然部署會 403（`serviceusage.services.get` permission denied）：
  - Firebase 託管管理員（Firebase Hosting Admin）
  - 服務使用情形消費者（Service Usage Consumer）
  - API 金鑰檢視者（API Keys Viewer）
  - 設定位置：https://console.cloud.google.com/iam-admin/iam?project=weekend-dice → 該帳號的鉛筆 → 新增其他角色

## 使用者資料（localStorage，依網址分開存）
| key | 內容 | 匯出 |
|---|---|---|
| `wd_data` | 自訂名單：`{edits, added, deleted}` | ✓ |
| `wd_hist` | 足跡：`[{id, t, name, min}]` | ✓（匯入時合併） |
| `wd_mode` | 指定車程（0＝骰子決定） | ✓ |
| `wd_flt` | 條件勾選 | ✓ |
| `wd_sfx`、`wd_bgm` | 音效、音樂開關 | ✓ |
| `wd_seen_ver` | 看過的版本（更新說明只跳一次） | ✗ |
| `wd_bgm_owner` | 多開時誰播音樂 | ✗ |

- 匯出格式：`WD1:` + base64(JSON `{app:"weekend-dice", v:1, at, data:{...}}`)
- 匯出／匯入在「足跡」頁設定區
- iPhone 主畫面 App 與 Safari 的 localStorage 不互通，搬資料要用代碼

## 搬家流程與狀態
1. [x] Firebase 專案建好、Hosting 開始使用、服務帳號金鑰放進 GitHub Secrets
2. [x] 專案 ID：`weekend-dice`（已填進 `.firebaserc` 和 workflow）
3. [x] push 到 main，Actions 部署成功（2026-11-08，v1.1.0）
4. [ ] 新網址驗收（見下方）
5. [x] `moved-page` 分支的搬家頁已填好新網址 https://weekend-dice.web.app/（push 後才在 GitHub 上）
6. [ ] GitHub → Settings → Pages → Branch 從 `main` 改成 `moved-page` → Save（舊網址變成搬家頁；已安裝的舊 App 會因為 version.json 9.0.0 自動換成搬家頁）
7. [ ] 家人都搬好資料後，擁有者自己把 repo 改成私人
   - 注意：免費版 GitHub 的私人 repo 不能用 Pages，改私人後舊網址（含搬家頁）就打不開了

## 驗收清單
- [ ] 新網址打得開：手機 Safari 開新網址，開機動畫、骰子、車子都正常
- [ ] 加到主畫面正常：圖示是骰子笑臉，從主畫面開沒有網址列、啟動不閃白
- [ ] 改版後手機會更新：推小改版 → 1～2 分鐘後把 App 從背景滑掉再開 → 自動換新版、跳更新說明
- [ ] 資料匯入成功：舊 App 匯出 → 新 App 匯入，自訂地點與足跡筆數一致
- [ ] GitHub Actions 最新一次部署是綠勾勾

## 改版規則
- 每次改完先給預覽，問：①要不要進版 ②要不要正式推上 GitHub；兩個都確認才動
- 進版要同時改 `APP_VERSION`、`CHANGELOG`（index.html 內）、`version.json`
- commit 第一行「vX.Y.Z：重點」

Copyright © 2026 大樹
