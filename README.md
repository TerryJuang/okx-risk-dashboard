# 開單風險試算 · OKX 逐倉

原生 HTML／CSS／JavaScript 的 USDT 本位線性永續逐倉試算工具。
以虧損預算與停損距離推算名目倉位，調整槓桿查看保證金與估算強平價。
不連接交易所帳戶、不抓即時行情、不執行交易。交易日誌使用 Google 登入，由使用者主動保存至私人 Firebase 資料庫。

**正式網站：[開單風險試算](https://terryjuang.github.io/okx-risk-dashboard/)**

2026-10-12 已發布；[首次部署紀錄](https://github.com/TerryJuang/okx-risk-dashboard/actions/runs/38207975318) 的 51 項測試及部署皆成功。

## 開啟與測試

網站無需前端建置。試算可直接開啟；Firebase 模組需以 HTTP／HTTPS 提供，例如在專案根目錄執行 `python3 -m http.server 4173 --directory dist`。
計算及事件測試使用 Node.js 24：

```bash
node --test tests/*.test.cjs
```

`dist/` 是本專案的前端原始碼，並非可任意刪除的建置快取。

## 檔案

- `dist/calculator.js`：財務計算與驗證，本次 Dashboard 升級保持原樣。
- `dist/app.js`：輸入連動、即時計算呈現、EXIT MAP 與資金圖。
- `dist/index.html`、`dist/style.css`：繁體中文介面及響應式樣式。
- `dist/tooltips.js`：滑鼠移入／鍵盤聚焦即顯示的問號說明。
- `tests/fixtures/v5-calculation-baseline.json`：改版前 36 組完整輸入與輸出基準，請勿為使測試通過而重建此檔。
- `docs/audit/`：原始盤點、舊版桌面截圖與修改前測試。
- `docs/delivery/`：修改及驗證紀錄。

## GitHub Pages

Settings → Pages → Build and deployment 已選擇 **GitHub Actions**，HTTPS 已啟用。
`.github/workflows/pages.yml` 會在 main 更新時先測試，再發布 `dist/`；PR 只跑測試，不部署。
日後更新程式後，在 Actions 查看綠色成功狀態，再確認正式網站。

原 Sites 部署設定 `.openai/hosting.json` 保留供舊站復原；GitHub Pages 不讀取這個檔案。

## 業務規則

做多價格 RR > 2、做空 ≥ 1；費用後 RR 另列警告。槓桿 1–100 倍，不自動降低。
資金建議至少切 10 份，每筆保證金最多 3 份；開倉費另計。
輸入停損百分比或價格、風險百分比或虧損金額時，都以最後編輯欄位為準。
計算定義、費率／滑價假設、估算限制與官方來源完整保留在頁面。

## 舊版與復原

舊站：https://okx-swap.juangyt15.chatgpt.site/

原始 v5 commit：`f8a41e56c1a1c3ec1fa8e30dee201224b0672bd8`。
本地回復標記：`backup/v5-before-dashboard-20261012`。
GitHub 舊版備份分支：[`backup/v5-before-dashboard-20261012`](https://github.com/TerryJuang/okx-risk-dashboard/tree/backup/v5-before-dashboard-20261012)。備份的完整 Git tree 與原始 v5 完全一致。

如需復原，在最新 main 上建立復原分支，還原舊版 `dist/` 與對應 UI 測試；保留 36 項固定計算基準及 Pages workflow。以下步驟需在乾淨工作目錄執行：

```bash
git fetch origin
git switch -c restore-v5 origin/main
git restore --source=origin/backup/v5-before-dashboard-20261012 -- dist tests/risk.test.cjs
git rm tests/tooltips.test.cjs tests/timeframe.test.cjs tests/journal.test.cjs
git rm -r tests/firebase .github/workflows/journal.yml
git rm firebase.json firestore.rules firestore.indexes.json
node --test tests/*.test.cjs
git add dist tests/risk.test.cjs
git commit -m "Restore v5 UI with original calculation rules"
git push -u origin restore-v5
```

接著在 GitHub 建立 Pull Request 合併至 main，通過測試後自動發布。復原組合已實際驗證 48 項測試通過（原版 12 項＋固定基準 36 項）；不要 hard reset 或強制覆蓋他人的修改。

## 相依與授權

前端維持原生架構，交易日誌使用官方 CDN 的 Firebase Web SDK 13.0.0（Apache-2.0）；測試工具及授權見 [Firebase 啟用文件](docs/delivery/firebase-journal-setup.md)。
GitHub Actions 使用 GitHub 官方維護的 checkout、setup-node、configure-pages、upload-pages-artifact、deploy-pages，皆為 MIT 授權。
本專案沒有另行指定開源授權；公開可見不等於授予任意使用授權。

## 時間週期與交易日誌

時間週期選單提供 3、5、15、30 分鐘、1 小時、4 小時、1 天及其他正整數分鐘，預設請選擇。選擇週期不改變財務計算。交易日誌提供「輸出記錄」、獨立紀錄管理頁、實際成交、分批平倉、垃圾桶還原及績效。Firebase Console 必須完成登入、規則、索引與核准 UID 才可存取資料。

[Firebase 啟用／復原步驟](docs/delivery/firebase-journal-setup.md) · [最初規劃提示詞](docs/planning/firebase-journal-prompt.md)。最新使用者已授權開發，原提示詞的「僅規劃」階段限制已被後續授權取代。
