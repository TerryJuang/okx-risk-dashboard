# Firebase 交易日誌：已確認範圍與接續事項

更新：2026-10-12（Asia/Taipei）

## 使用者已確認

- 使用既有專案 Okx-riskrecord，Console 網址確認 projectId 為 `okx-riskrecord`。
- 2026-10-12 已註冊 Web App，設定由使用者提供；保存在 `dist/firebase-config.js`。
- 採 Google 登入；允許帳號的範圍尚待確認。
- 交易幣種由使用者手動填寫，仍限原試算適用的 USDT 本位線性永續逐倉。
- 支援分批平倉，每次記錄實際成交時間、價格、數量及費用，追蹤剩餘持倉。
- 由實際成交價格、數量與實際費用計算損益；資金費另行記錄收入或支出，不套用試算費率。
- 刪除採可復原垃圾桶。
- EXIT MAP 的「輸出記錄」由使用者主動保存；新增「紀錄管理」導向獨立頁面，提供列表、新增、修改、刪除、還原及平倉明細。
- 保留原始試算快照與修訂歷程，區分試算、實際成交、分批平倉及完全平倉。
- 原 calculator.js 與既有公式、精度、驗證、雙向連動、安全限制不變。
- 網站沿用 GitHub Pages。Firebase Hosting 安裝精靈不是資料庫建立流程，不需執行 Hosting 部署。
- 不串接交易帳戶、不下單、不自行啟用計費。

最新使用者已授權開始開發，取代 firebase-journal-prompt.md 中最初的「僅規劃」階段限制；其餘要求仍適用。最新要求的分批平倉也取代最初提示詞將分批平倉列為後續擴充的安排。

## 本次實際完成

開發分支：`feat/firebase-journal`。
修改前基準：`3a70135c7514f6eefdaf1766e566b81dcd09ff79`。

僅新增前端設定模組及本文件；尚未在 HTML 載入設定、初始化 Firebase、加入 SDK 相依套件、啟用 Analytics、建立資料庫或部署規則。原有公開網站與計算檔案沒有修改。設定檔中的 measurementId 由使用者提供，保留設定不代表啟用 Analytics。

這次沒有執行 Firebase 連線、登入或資料庫測試；不能將登錄 Web App 或保存 config 宣稱為串接完成。

## Firebase 現況與待確認

最近的 Firestore 截圖顯示「建立資料庫」起始畫面；尚無已建立實例的證據。使用者後續截圖為 Web App 註冊後的 Firebase Hosting CLI 精靈，不是資料庫精靈。

接續需取得：
1. Firestore 建立精靈的版別、模式與地區選項；如已完成建立，需實際 databaseId、edition、mode、location 及規則。不得猜測或逕行選用。
2. Google 登入提供者是否啟用；Auth 授權網域需包含 `terryjuang.github.io`。
3. 僅本人使用或多帳戶各自私人資料；個人版需核准 UID，避免將私人帳號資訊寫入公開文件。
4. 未通過 RR／槓桿／強平安全條件的有效數值試算，禁止保存或保存為警告草稿。尚未決定，不得當成已成交紀錄。
5. 垃圾桶保留／清理方式；尚未授權自動永久刪除。

在資料庫版別確認前，不定案 Firestore 資料模型、SDK 存取方式與 Security Rules。分批平倉的費用分攤、修改後重算、超額平倉拒絕及績效納入條件，需在實作時明訂並用多空案例驗證；不能用單一平倉價假裝支援分批。

## 接續驗證

- 沿用既有全部試算回歸測試。
- Firebase Emulator 驗證未登入、未核准帳號、跨帳戶與欄位竄改拒絕。
- 驗證伺服器時間、原始快照保留、修訂、重試防重複、垃圾桶與還原。
- 多空分批成交核對、手續費與資金費不重複扣除、剩餘數量與完全平倉判定。
- 績效只計完整的已平倉紀錄；部分平倉另列已實現損益，不列為完成交易。
- 桌面與手機真實登入及表單操作驗證。

## 官方依據

- Firebase Web SDK 設定：https://firebase.google.com/docs/web/setup
- Google 登入：https://firebase.google.com/docs/auth/web/google-signin
- Firebase 前端 API key：https://firebase.google.com/docs/projects/api-keys
- Firestore：https://firebase.google.com/docs/firestore

Firebase Web config 是前端專案識別設定，資料權限仍需由 Auth 及資料庫規則約束；不可把 service account JSON、私鑰或登入權杖加入儲存庫。
