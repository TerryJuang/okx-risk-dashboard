# Firebase 交易日誌：確認範圍與接續事項

更新：2026-10-13（Asia/Taipei）

使用者已授權在原專案開發資料庫連動，取代最初提示詞的「僅規劃」階段限制。

已確認：
- projectId 為 okx-riskrecord，Web App 為 1:90917289756:web:602d4c8b48d17b5adfc4d9。
- 已依 Standard 建立流程建立 (default) Firestore；最近截圖的規則是 deny all，地區未從總覽核實。
- Google 登入，手填不同 USDT 合約幣種。
- 支援分批平倉，由實際成交價、幣數及費用計算損益。
- 可復原垃圾桶。
- EXIT MAP 手動輸出記錄；獨立紀錄管理頁，新增、修改、刪除／還原及補登平倉。
- calculator.js 與既有計算、精度、驗證、RR／切分／槓桿限制、最後編輯欄位優先行為保留。
- 原始快照保留，修改另存修訂。
- 網站維持 GitHub Pages，舊 Sites 是備份。

程式位於 feat/firebase-journal；實作已完成，GitHub Actions 的 85 項驗證全部通過；正式 Firebase 啟用仍待下列後台步驟。測試結果與正式部署狀態以 docs/delivery/firebase-journal-verification.md 為準，不把模擬測試當成正式 Firebase 已連接。

接續仍需確認：
1. 允許 Google 帳號的範圍；預設沒有任何核准 UID，需由 Console 管理者新增 journalAccess/{uid} enabled=true。前端不能自助授權。
2. 未通過風險條件的有效試算，要禁止保存還是保存為警告草稿。未定案時程式暫時阻擋保存，不標成已成交。
3. Google 提供者、授權網域、正式規則與索引是否已完成；目前開發端無可操作已登入 Firebase Console 的工具。
4. 實際 Firebase 專案的地區及真實桌面／手機登入驗收。

不自動永久清除垃圾桶，不啟用計費、付費備份、Analytics 或離線持久化。實際交易資料不進公開 GitHub。

參考：[Firebase 啟用與復原步驟](../delivery/firebase-journal-setup.md)。
