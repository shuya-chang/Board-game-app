# 雲端串接進度與設定

這一版包含可建置的 Netlify 部署檔、Google OAuth 客戶端、Supabase migrations 與回報後端。**現有收藏、團體、時間表畫面仍使用本機記憶體；尚未全面切換到雲端資料，不能當成正式多人版。** 本機示範資料不會自動上傳到任何帳號。

## 已寫入並可在本機驗證

- `npm test`：原型規則、租借流程、通知刪除、資料快照、PostgreSQL migrations／RLS、後端設定及靜態檔案保護。
- `npm run build`：產生 `dist/`；只發布 HTML、圖片和 Google 登入元件，不發布環境檔、後端原始碼或測試資料。
- `netlify/functions/public-config.cjs`：只提供 Supabase URL 與 publishable／anon 金鑰，拒絕誤填的 secret／service-role 金鑰。
- `features/cloud-client.js`：Google 登入、私人備註、收藏及租借的資料存取邊界；完整既有畫面資料來源切換尚待完成。
- `netlify/functions/feedback.cjs`：驗證登入、三種回報分類、資料庫限流、回報編號；不接受使用者偽造提交者或處理狀態。
- `report-delivery`：每五分鐘領取待送回報，只送分類、標題和編號到 Discord，不送電話、金額或私人備註。失敗稍後重試；服務在發送後、確認前中斷時可能重複通知，可依同一回報編號辨識。
- BGG 後端入口固定回覆「尚未連結」，即使填入 Token 也不會擅自啟用。

## 仍待完成／驗證

1. 連接使用者指定的 Supabase 專案，套用 migrations，核對正式角色權限。
2. 把收藏、團體、時間表、通知畫面逐一改用真實帳號與雲端資料；目前仍是預覽資料。團體／時間表的雲端寫入流程尚未完成。
3. Google Cloud 與 Supabase provider 設定，實際登入、登出、跨帳號與跨裝置測試。
4. Netlify 專案與正式網域設定、實際部署及端到端測試。
5. Discord Webhook 設定與真正投遞測試。

## Supabase

按檔名順序套用 `supabase/migrations/`。測試使用的 `auth.users` 與角色模擬只存在於測試檔，**不要在 Supabase 執行測試的初始化 SQL**。

使用者已在新建的桌遊專案執行 `supabase/setup.sql`，並提供成功結果與資料表清單截圖。這份檔案為七份 migrations 的一次性、單一 transaction 版本，不可在已完成初始化的專案重跑。已透過公開金鑰確認 Auth 設定可連線且 Google provider 啟用；尚未把真實帳號登入及雲端資料操作視為完成。

目前資料表分開保存共用資料、個人公開收藏資訊、私人備註、私密借出預設金額、雙方租借資料、不可由使用者修改的事件紀錄與問題回報。其他團員只能取得有限的持有人投影，不能讀取租借金額或聯絡方式。共用資料後台修改要在同一個 transaction 先設定原因：

```sql
begin;
select set_config('app.change_reason', '依回報核對後更正名稱', true);
-- 在這裡以明確的 id 更新共用欄位。
commit;
```

修改會留下前後內容，並把資料重新標記為待確認。確認無誤時可在同樣有原因的 transaction 設 `review_status='verified'`。回報與 BGG 連結狀態各自獨立，不因已確認就自動忽略新回報。借用歷史快照不跟著共用資料更正而改寫。

## Google 登入

在 Google Cloud 建立 Web OAuth 用戶端；redirect URI 使用該 Supabase 專案提供的 Auth callback URL。Client ID 與 Client secret 填在 Supabase 的 Google provider 設定，**不填進前端或 GitHub**。

Supabase Auth 的 Site URL 使用 Netlify 正式網址；允許的 Redirect URLs 只加入實際使用的本機及正式網址。前端採 PKCE，登入後回到同來源首頁。本機伺服器會從 Git 忽略的 `.env.local` 讀取專案 URL 與公開金鑰，並載入建置好的登入元件；先執行 `npm run build` 再啟動本機服務即可。本機環境檔不發布到 Netlify。

官方設定參考：[Supabase Google 登入](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)、[PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)。

## Netlify 與秘密設定

連接既有 `shuya-chang/Board-game-app`，使用儲存庫內 `netlify.toml`。建置需 Node 24，輸出資料夾為 `dist`。

環境變數名稱見 `.env.example`。Supabase service-role、Discord Webhook、BGG Token 只放在 Functions 可讀的環境設定，不能提供給瀏覽器。Google Client secret 只放 Supabase provider 設定。Webhook 由你建立指定 Discord 頻道後設定，不需要另建 Bot。

回報會先保存在 `feedback`，Discord 是提醒管道；待送情形可在 `report_delivery` 私人後台檢查。未設定 Webhook 時不會送出，也不會把回報內容清掉。排程只在 Netlify 已發布部署執行，預覽部署需在 Netlify Functions 使用 Run now 手動驗證。

官方參考：[Netlify Functions 設定](https://docs.netlify.com/build/functions/configuration/)、[Scheduled Functions](https://docs.netlify.com/build/functions/scheduled-functions/)。
