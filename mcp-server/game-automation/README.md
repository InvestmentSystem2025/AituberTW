# 遊戲自動化 (Minesweeper) 模組

本資料夾提供讓 MCP Server 能夠透過本機 Python 服務操作踩地雷遊戲的必要程式與設定。架構分為兩部分：

- **Python `backend.py`**：在 Windows 主機上執行，負責螢幕擷取、模板比對與滑鼠自動化。
- **Node.js MCP 工具**：透過 `MSW_AUTOMATION_BASE_URL` 呼叫 Python 服務，並將 `detect_grid`、`click_cell` 等工具暴露給模型。

## 快速啟動

1. 建立並啟動虛擬環境：
   ```powershell
   cd mcp-server/game-automation/python
   python -m venv .venv
   . .venv/Scripts/activate
   pip install -r requirements.txt
   python backend.py
   ```
   服務預設跑在 `http://127.0.0.1:5001`。

2. 開啟校準頁 `http://127.0.0.1:5001/calibrate`，依指示記錄棋盤左上、右下角座標，設定行列數並儲存設定到 `config.json`。

3. 使用 `/snapshot_cell` API 建立模板影像檔（存放於 `python/templates`），至少需準備：
   - `covered.png`
   - `flag.png`
   - `n0.png` ~ `n8.png`

4. 在 `mcp-server/.env` 或 Docker 環境變數中設定：
   ```
   MSW_AUTOMATION_BASE_URL=http://host.docker.internal:5001
   ```
   若 MCP Server 直接在主機上執行，可保留預設 `http://127.0.0.1:5001`。

5. 重新啟動 MCP Server，並確認以下工具可用：
   - `automation_health`
   - `detect_grid`
   - `click_cell`
   - `flag_cell`
   - `step_solve`
   - `autoplay`

## 常見問題

- **模板辨識不穩定**：確認螢幕縮放為 100%，補齊所有數字模板並重新啟動 Python 服務。
- **滑鼠點擊失敗**：`backend.py` 會檢查點擊座標是否落在校準後棋盤範圍內，若座標不合法會回傳錯誤，請重新校準。
- **Docker 容器存取問題**：確保容器環境變數使用 `http://host.docker.internal:5001`，並確認宿主服務已開啟。

未來若要擴增其他遊戲，可比照目前結構建立新後端模組，再於 MCP 工具層新增對應端點與工具。

