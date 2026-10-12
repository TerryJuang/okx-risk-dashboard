# 交易日誌欄位與存取設計

適用：okx-riskrecord / Cloud Firestore Standard / (default)。

| 路徑 | 用途 | 權限 |
|---|---|---|
| journalAccess/{uid} | enabled 帳號核准旗標 | 管理端維護；網站只可讀自己的核准資料 |
| users/{uid}/plans/{planId} | 先驗證全部欄位的只讀快照，供交易紀錄參照 | 核准帳號僅可建立／讀自己的快照，不可修改／刪除 |
| users/{uid}/trades/{id} | 原始試算、目前計畫、實際開倉、分批平倉總數及垃圾桶狀態 | 核准的 Google 登入者僅可存取自己的路徑 |
| trades/{id}/closes/{closeId} | 每次平倉資料 | 連同父紀錄與修訂原子更新，需有父紀錄；僅軟刪除 |
| trades/{id}/revisions/{operationId} | 不可覆寫的修改後快照與當次平倉變更 | 僅新增、讀取，不可修改／刪除 |

前端不可自助核准，不保存 Email、密碼、ID token、refresh token 或管理員憑證。

## 交易紀錄

| 欄位 | 型別 | 定義 |
|---|---|---|
| schemaVersion、revision | 整數 | 結構版本及遞增修訂編號 |
| appVersion | 字串 | journal-v1 |
| ownerUid | 字串 | 與已登入 UID 及路徑一致，不可修改 |
| createdAt、updatedAt | Timestamp | 伺服器建立及最近修改時間 |
| authTime | 整數秒 | 首次保存時 auth_time，與 Token 比對 |
| clientSavedAt、editStartedAt、clientEditedAt | Timestamp | 裝置提供的點擊保存／開始／最後編輯時間，非可信稽核 |
| timeZone | 字串 | 裝置時區，顯示另採 Asia/Taipei |
| original | map | 不可覆寫的原始試算 |
| current | map | 未成交時可修訂的計畫；實際成交後凍結 |
| strategy、notes | 字串 | 最多 120／4,000 字 |
| actual | null 或 map | 實際開倉資料；null 表示未確認成交 |
| totals | map | 有效平倉幣數、價差損益、平倉費及筆數 |
| status | 字串 | planned、open、partial、closed、cancelled |
| trashed、deletedAt | bool、Timestamp/null | 可復原垃圾桶，沒有自動永久刪除 |
| mutationId | 字串 | 當次操作 ID；與不可覆寫的修訂相符 |

## 試算快照

inputs 以 map 保存 14 個計算引數：
entry、capital、risk、stop、rr、splitCount、mmr、maxLeverage、openFee、closeFee、slippage、buffer、leverage、side。

另有 stopPriceInput、lossBudgetInput，合計保留全部 16 個原始輸入。
百分比仍以百分點儲存；金額為 USDT，槓桿为倍數，數量為幣數。

raw 保存原始輸入字串，result 保存原 calculate() 的全部 46 個輸出欄位。兩者採固定欄位順序 JSON 字串，以避免完整地圖驗證超過 Firestore 規則執行上限。規則驗證欄位、基本型別及長度，前端讀取時還原物件，數值保留原 double 精度，不從四捨五入畫面反解析。

快照也包含 stopDriver、budgetDriver、symbol、timeframeMinutes、timeframeOption、calculatorVersion。
calculatorVersion 固定為保留的 calculator.js SHA256；不能用新版公式覆蓋原始快照。

symbol 正規化為幣種-USDT-SWAP。時間週期為正整數分鐘，1 天為 1440 分鐘。

## 實際開倉及平倉

actual：
price、quantity、openingFee、funding、margin、leverage、openedAt。

closes：
price、quantity、fee、executedAt、reason、note、deleted、createdAt、updatedAt、mutationId。

交易費正數為支出、負數為返佣；資金費正數為收入、負數為支出。
qty 單位為幣數。多次加倉成本變化尚未建模。

每次平倉必須連同父紀錄總數、狀態及修訂原子寫入；單獨寫入子紀錄或變更總數均會被拒絕。修改、移除及還原均更新總數；平倉紀錄不會實體刪除。

原始及修訂資料可回顧；此為使用者手填日誌，不認證交易所成交，也不提供下單功能。
