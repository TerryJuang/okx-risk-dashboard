# Firebase 交易日誌驗證與交付

更新：2026-10-13（Asia/Taipei）

## 原有計算保持不變

原 calculator.js blob：3af02609a77de9a905442bea2189cb2303d4b491。
原 app.js blob：817013c5da5e3e80243fc50cd8d16a6c3fc5d796。

財務公式、精度、取整、輸入連動及原 optional browser-agent 介面未修改。日誌由獨立 bridge 讀取原始計算狀態。

## 修改範圍

| 檔案 | 原因 |
|---|---|
| dist/index.html | 增加登入區、日誌資料欄位、輸出記錄與管理入口 |
| dist/journal.html、journal.css、journal-ui.js | 獨立管理頁、表單、分批平倉、垃圾桶、績效、匯出及響應式介面 |
| dist/firebase-config.js | 使用者提供的 Web App 設定，沒有管理員憑證 |
| dist/journal-api.js | 官方 SDK、Google 登入、私人讀写、分頁、交易式保存、重試及修訂 |
| dist/journal-core.js | 獨立實際損益、數量、週期、快照、績效與 CSV 驗證 |
| dist/journal-bridge.js | 接入既有試算狀態，保留原有財務檔案 |
| firestore.rules、firestore.indexes.json、firebase.json | 權限、資料驗證、索引與獨立 demo Emulator 設定 |
| tests/journal.test.cjs、tests/firebase/ | 日誌單元、規則攻擊、實際 SDK 保存流程及瀏覽器驗證 |
| .github/workflows/journal.yml | 開發分支／PR 的驗證流程，不部署正式 Firebase |
| README.md、docs/ | 啟用、欄位設計、結果、限制及復原說明 |

既有 .github/workflows/pages.yml、Sites 部署設定、calculator.js 與 app.js 都沒有修改。

## 自動測試範圍

Node.js：
原試算及 UI 測試、36 組固定基準、時間週期與 tooltip，加上 11 個交易日誌案例，共 65 項。已在 GitHub Actions 實際執行。

Firestore Emulator：
驗證合法保存與列表、未登入／未核准／跨帳號／非 Google／未驗證身份拒絕、欄位白名單、型別及長度、伺服器時間、原始快照保留、修訂原子性、分批平倉數量／費用／損益一致、垃圾桶及還原、單獨竄改平倉與永久刪除拒絕。
另直接呼叫正式日誌 API 的保存程式，僅替換 Authentication 與連線目標為隔離的 demo Emulator，測試重試防重複、實際 SDK transaction、原始計算結果完整精度讀回、分批平倉及還原。

Chromium：
1440×1000、768×1024、390×844，涵蓋保存、獨立管理頁、補登成交、分批平倉、超額平倉拒絕、修改備註、平倉移除／還原、整筆垃圾桶／還原、登出清畫面及無水平溢出。另驗證日誌模組載入失敗時原試算仍可操作。
瀏覽器使用標明的 API mock，不以假資料宣稱正式 Firebase 功能已上線；Security Rules 與寫入程式另由 Emulator 驗證。

## 結果

已實際執行，共 85 項通過、0 項失敗：

| 測試 | 通過 |
|---|---:|
| 原試算、固定基準、輸入行為及日誌單元 | 65 |
| Firestore Rules／實際保存程式的 Emulator 測試 | 16 |
| 桌面、平板、手機及模組失敗容錯 | 4 |

[成功工作流程](https://github.com/TerryJuang/okx-risk-dashboard/actions/runs/38323659090)，測試 commit 37c2ea6cd2519f92cfaeea78b710a8454edf2cc2。

完整欄位驗證採先保存只讀 plans 快照，再原子保存紀錄／修訂，分批平倉與總數驗證在子紀錄寫入時執行一次，避免重複執行超過 Firestore 規則上限。所有輸入與完整計算精度仍保留。正式 Firebase 後台設定與真實 Google 登入尚未驗收。

## 尚未完成的正式環境步驟

Firebase Console 的 Google 提供者、授權網域、核准 UID、正式規則與索引部署，尚未由開發端完成或驗證。無法操作已登入的 Console，需依 [啟用文件](firebase-journal-setup.md) 完成。

實際 Google 登入及正式 Firebase 的桌面／手機保存驗收尚待執行；模擬測試不能取代這一步。允許帳號範圍與警告草稿政策仍待使用者決定，未核准帳號預設沒有日誌存取權。

沒有多次加倉成本撮合、JSON 批次匯入、交易所 API、下單、年化或完整帳戶回撤。這些不是本次功能的宣稱。

## 截圖與來源

瀏覽器驗證截圖及診斷會保存於成功的 GitHub Actions 執行頁 journal-verification artifact。
部署、欄位及復原操作見 [啟用文件](firebase-journal-setup.md) 與 [欄位設計](firebase-journal-schema.md)。
