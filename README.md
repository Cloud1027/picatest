# picatest

這是一個完全獨立於 `Cloud-Chess-Note` 的測試 repo。

目的只有一個：

驗證 Pikafish WebAssembly binary 在嚴格隔離環境下，是否能完成最基本的：

1. 載入 `pikafish.js`
2. 呼叫 `Pikafish(...)`
3. resolve promise
4. 接收 UCI 回應

## 檔案結構

- `index.html`: 最小測試頁
- `app.js`: 初始化流程、雙模式測試與記錄輸出
- `styles.css`: 純本地樣式
- `vercel.json`: COOP/COEP 隔離標頭
- `engine/`: 直接從主專案複製的 Pikafish 資產

## 測試模式

- `初始化（帶設定）`: 使用 `locateFile / mainScriptUrlOrBlob / onReceiveStdout`
- `初始化（原始）`: 只呼叫 `Pikafish()`，更貼近最原始工廠呼叫

## Vercel

這個 repo 可直接部署在 Vercel：

- Framework Preset: `Other`
- Build Command: 留空
- Output Directory: 留空
- Install Command: 留空
