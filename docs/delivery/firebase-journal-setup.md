# Firebase 交易日誌：啟用與驗收

更新：2026-10-13（Asia/Taipei）

程式採原生 HTML/CSS/JavaScript、Firebase 官方 Web SDK 13.0.0、Google 登入及 Cloud Firestore，網站繼續使用 GitHub Pages。

## 實際專案狀態

- projectId：okx-riskrecord
- Web App：1:90917289756:web:602d4c8b48d17b5adfc4d9
- databaseId：(default)
- 使用者依 Standard 建立流程完成資料庫；地區尚未從總覽核實。SDK 不自行設定地區。
- 使用者最近提供的正式規則為 deny all。
- 開發端無法操作已登入 Firebase Console；Google 提供者、授權網域、核准 UID、新規則及索引，仍須以下後台操作。
- 沒有啟用 Analytics、Cloud Functions、Firebase Hosting、付費備份或 Firestore 持久化離線快取。
- 不連接 OKX 帳戶、不下單。

## 啟用順序

### 1. Google 登入

https://console.firebase.google.com/project/okx-riskrecord/authentication/providers

如果顯示「開始使用」，先啟用 Authentication。選 Google → 啟用，應用程式名稱可填「開單風險試算」，支援 Email 選自己的帳號，保存。

Authentication → 設定 → 授權網域：新增 terryjuang.github.io。
只填網域，不填 https:// 或 /okx-risk-dashboard/，保留 Firebase 原有網域。

### 2. 規則

https://console.firebase.google.com/project/okx-riskrecord/firestore

規則 → 貼入本儲存庫 firestore.rules 全文 → 發布。這一步不需要 Firebase Hosting。

核准名單為空時，沒有任何人可以讀寫交易資料。Google 登入成功不代表自動開通日誌。前端不能自行加入核准名單。

I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for private, owner-scoped records by requiring verified Google sign-in, administrator-approved access, validated fields, and immutable revisions. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.

規則保護資料隔離、欄位結構、原始快照及修訂，不認證實際成交是否發生。日誌為使用者手填資料，不能當成交易所認證的財務稽核。

### 3. 列表索引

Firestore → 索引 → 複合索引 → 新增：

| 項目 | 值 |
|---|---|
| 集合 ID | trades |
| 查詢範圍 | 集合／Collection |
| 欄位一 | trashed：升冪 |
| 欄位二 | createdAt：降冪 |

等索引狀態可用後再使用列表。

建議於單一欄位索引新增四項豁免，停用 map 及其子欄位的索引：
- trades / original
- trades / current
- revisions / record
- revisions / close

完整定義在 firestore.indexes.json。日後若使用 CLI，從儲存庫根目錄執行：
npx firebase-tools@15.33.0 deploy --only firestore:rules,firestore:indexes --project okx-riskrecord

此命令只部署規則／索引，不變更 Hosting、Auth、計費或地區。

### 4. 核准帳號

网站部署後進入 https://terryjuang.github.io/okx-risk-dashboard/journal.html ，按 Google 登入。
登入區會顯示自己的 UID；未核准時顯示尚未開通權限。

Firebase Console → Firestore → 資料：
1. 建立集合 journalAccess。
2. 文件 ID 貼入自己的 UID。
3. 欄位 enabled，型別 boolean，值 true。
4. 保存並重新載入網站。

這是 Console 管理員操作；網站前端無法建立或修改核准名單。允許帳號範圍尚未由使用者確認，程式沒有预先核准任何人。確定只限本人時，只添加自己的 UID；若另核准其他帳號，各帳號仍只能存取自己的紀錄。私人 UID／Email 名單不要放進公開 GitHub 文件。

## 保存與修訂

「輸出記錄」由使用者主動保存，狀態預設 planned，不自動當成已成交。

保存全部原始試算輸入字串、正規化數值、完整原始精度 calculate() 結果、時間週期、最後編輯來源、策略與備註。原始快照保持不變；未成交時可修訂目前試算，實際成交後計畫凍結，改填／修改實際成交資料。

calculator.js、原有公式、精度、輸入連動及風險限制沒有修改。實際交易損益獨立放在 journal-core.js。

未通過 RR／槓桿／強平条件的有效試算，暫時阻擋保存，並明示警告草稿政策待確認；這個安全預設不是使用者已定案的規則。

每次修改以 transaction 原子保存資料與不可覆寫的修訂。多分頁採 revision 檢查，陳舊頁面不能默默覆蓋新資料。

同一操作的識別碼由 sessionStorage 保留，重試沿用同一操作 ID。只存操作 ID、內容雜湊及編輯起始時間，不保存私人交易內容、登入 Token 或離線資料庫。表單不跨重新整理持久化；重填同一操作可以沿用識別碼。若要保存相同條件的新交易，按「新增另一筆」。

成功訊息只在伺服器確認後顯示；離線／失敗保留當前表單。登入採 session persistence，登出清空列表、明細與績效畫面。

## 實際成交與分批平倉

實際開倉輸入：均價、幣數、時間、實際槓桿、保證金、開倉費、累計資金費。

數量單位為幣數，非合約張數；若由 OKX 張數抄錄，需先用該合約面值換算。

每次平倉獨立保存：成交時間、均價、幣數、實際平倉費、原因、備註。可修改、移除、還原並保留修訂。累計平倉量不可超過實際開倉量；平倉時間不可早於開倉。修正已成交均價會重算價差損益，修正開倉量不可少於已平倉量。

- 手續費：支出正、返佣負。
- 累計資金費：收入正、支出負。
- 多單價差損益＝(平倉價－實際入場均價)×本次平倉幣數；空單方向相反。
- 已實現淨損益＝已平倉價差損益總和－全額開倉費－有效平倉費總和＋累計資金費。
- 開倉費全額扣一次，不在每次平倉重複扣除；部分平倉顯示的淨損益不含剩餘持倉的浮動損益。
- 部分平倉不列入完成交易勝率；全部平倉後才統計。
- 目前為單一實際入場均價／數量搭配多次平倉，未建模多次加倉造成的動態成本變化。

垃圾桶保存完整紀錄並可還原，沒有自動清除或永久刪除入口。

## 時間

伺服器 createdAt／updatedAt／修訂時間用 serverTimestamp；列表按伺服器保存時間排序。

保存時 authTime 取自 Firebase 已驗證 Token 的 auth_time，規則比對该值。每次修訂另記當時 auth_time。

開始編輯、最後輸入及點擊保存時間由裝置提供，供回顧，不當作可信稽核。實際成交時間以台北時間手填並保存為 Timestamp；顯示統一 Asia/Taipei。另保存裝置時區。

## 列表、績效與匯出

列表每次 25 筆，提供載入更多／載入全部以統計，不全量即時監聽。

方向、幣種、週期、狀態及日期篩選套用在已載入資料，畫面標明範圍。

績效僅計目前篩選內、未在垃圾桶且完整平倉的紀錄：
- 勝率＝獲利筆數÷全部完成筆數，打平算一筆、不算獲利。
- 平均獲利／虧損分開計算；無對應樣本顯示「—」。
- Profit Factor＝獲利總額÷虧損絕對總額，無虧損顯示「—（無虧損）」。
- 實際 R＝淨損益÷原始 plannedLoss；分母不大於零不計入。
- 不宣稱完整帳戶收益率、年化、未平倉權益或帳戶最大回撤。

CSV 包含全部計畫輸入 JSON，防止公式注入。JSON 另包含平倉與全部修訂。下載範圍為已載入且符合篩選的資料；完整備份須先清除篩選、載入全部，再匯出；垃圾桶另外匯出。未提供批次 JSON 匯入 UI，垃圾桶還原可正常操作。

## 版本與相依套件

執行時以官方 CDN 使用 Firebase SDK 13.0.0（Apache-2.0）。沒有重建框架或建立後端。

僅供測試、不会放進网站：
- @firebase/rules-unit-testing 6.0.0（Apache-2.0）
- firebase-tools 15.33.0（MIT）
- @playwright/test 1.64.0（Apache-2.0）

## 驗收範圍與待完成項目

程式測試與結果另見 firebase-journal-verification.md：
- 試算回歸與日誌單元測試。
- 獨立 demo Emulator 的規則編譯與存取攻擊測試。
- Chromium 的桌面、平板及手機尺寸操作，使用明確的 API mock，不寫入正式 Firebase。

正式環境還須：
1. 確認允許帳號及警告草稿政策。
2. 完成 Google 提供者、授權網域、核准 UID、正式規則與索引。
3. 以真實帳號在桌面／手機執行登入、保存、讀取、修改、分批平倉及垃圾桶還原。

## 暫停與復原

修改前 main：3a70135c7514f6eefdaf1766e566b81dcd09ff79，舊 Sites 備份不變。

可將 journalAccess/{uid} 的 enabled 改為 false 暫停該帳號存取；或將 Firestore 規則回復原 deny-all。兩者都保留資料。

網站用 Git revert 撤回功能提交，再由既有 GitHub Pages 工作流程發布；不要刪除資料庫或用 reset --hard 覆蓋其他工作。

## 官方依據

- https://firebase.google.com/docs/web/setup
- https://firebase.google.com/docs/auth/web/google-signin
- https://firebase.google.com/docs/firestore/manage-data/transactions
- https://firebase.google.com/docs/rules/unit-tests
- https://firebase.google.com/docs/projects/api-keys
