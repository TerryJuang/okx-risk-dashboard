# 開單風險試算 · OKX 逐倉

原生 HTML／CSS／JavaScript 的 USDT 本位線性永續逐倉試算工具。
以虧損預算與停損距離推算名目倉位，調整槓桿查看保證金與估算強平價。
不連接帳戶、不抓即時行情、不執行交易。

## 開啟與測試

直接以瀏覽器開啟 `dist/index.html` 即可使用，不需要 npm install 或建置。
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

完成儲存庫初始化後，在 Settings → Pages → Build and deployment 選擇 **GitHub Actions**。
`.github/workflows/pages.yml` 會在 main 更新時先測試，再發布 `dist/`；PR 只跑測試，不部署。
尚未完成 Pages 設定或 workflow 成功之前，不能將預計網址視為已上線。

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

如需復原，從備份建立復原分支，恢復 `dist/` 後跑測試並以新 commit 發布；不要 hard reset 或強制覆蓋他人的修改。

## 相依與授權

前端沒有第三方套件、CDN、字型下載或新增框架，故無新增前端套件授權。
GitHub Actions 使用 GitHub 官方維護的 checkout、setup-node、configure-pages、upload-pages-artifact、deploy-pages，皆為 MIT 授權。
本專案沒有另行指定開源授權；公開可見不等於授予任意使用授權。
