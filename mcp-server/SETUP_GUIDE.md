# MCP Server 設定指南

本指南將協助您在 Windows 環境下設定和啟動 MCP Server，並將其與 aituber-kit 專案整合。

## 📋 前置需求

1. **Node.js 20+** - [下載安裝](https://nodejs.org/)
2. **Docker Desktop** - [下載安裝](https://www.docker.com/products/docker-desktop/) (選用，用於容器化部署)
3. **VSCode** - 建議使用 VSCode 作為開發環境

## 🚀 快速開始

### 步驟 1: 安裝依賴

**執行環境：在 VSCode PowerShell 終端執行**

```powershell
# 切換到 mcp-server 目錄
cd C:\dev\AITUBER\mcp-server

# 安裝 npm 依賴
npm install
```

### 步驟 2: 設定環境變數

環境變數檔案 `.env` 已經建立，內容如下：

```env
PORT=3001
NODE_ENV=development
MAX_FILE_SIZE=50mb
UPLOAD_DIR=./uploads
ALLOWED_FILE_TYPES=.pdf,.doc,.docx,.txt
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
DATA_DIR=./data
```

如需修改，請直接編輯 `.env` 檔案。

### 步驟 3: 啟動伺服器

#### 選項 A: 本地開發模式（推薦用於開發）

**執行環境：在 VSCode PowerShell 終端執行（位於 `C:\dev\AITUBER\mcp-server`）**

```powershell
# 啟動開發伺服器（支援熱重載）
npm run dev
```

啟動成功後，您會看到：
```
🚀 MCP Server running on port 3001
📁 Upload directory: ./uploads
📊 Max file size: 50mb
```

#### 選項 B: 正式環境模式

**執行環境：在 VSCode PowerShell 終端執行（位於 `C:\dev\AITUBER\mcp-server`）**

```powershell
# 編譯 TypeScript
npm run build

# 啟動正式伺服器
npm start
```

#### 選項 C: Docker 容器化部署

**執行環境：在 VSCode PowerShell 終端執行（位於 `C:\dev\AITUBER\mcp-server`）**

```powershell
# 建立 Docker 映像
docker build -t mcp-server .

# 或使用 docker-compose 啟動
docker-compose up -d

# 查看運行狀態
docker ps

# 查看日誌
docker logs mcp-server

# 停止服務
docker-compose down
```

### 步驟 4: 測試伺服器

**執行環境：在 VSCode PowerShell 終端執行（新開一個終端）**

```powershell
# 健康檢查
Invoke-RestMethod -Uri http://localhost:3001/health

# 列出可用的 MCP 工具
Invoke-RestMethod -Uri http://localhost:3001/api/mcp/tools

# 列出已上傳的檔案
Invoke-RestMethod -Uri http://localhost:3001/api/files/list
```

## 🔗 與 aituber-kit 整合

### 在 aituber-kit 專案中建立 MCP 客戶端

在 `aituber-kit/src/lib/mcpClient.ts` 建立以下檔案：

**執行環境：在 aituber-kit 專案的 VSCode 終端**

```typescript
// src/lib/mcpClient.ts
const MCP_SERVER_URL = 'http://localhost:3001';

export class MCPClient {
  /**
   * 上傳檔案到 MCP Server
   */
  async uploadFile(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${MCP_SERVER_URL}/api/files/upload`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error('檔案上傳失敗');
    }

    return await response.json();
  }

  /**
   * 調用 MCP 工具
   */
  async callTool(toolName: string, args: Record<string, any>): Promise<any> {
    const response = await fetch(`${MCP_SERVER_URL}/api/mcp/tool`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tool: toolName,
        arguments: args
      })
    });

    if (!response.ok) {
      throw new Error('工具調用失敗');
    }

    return await response.json();
  }

  /**
   * 讀取 PDF 檔案
   */
  async readPDF(filePath: string): Promise<any> {
    return await this.callTool('read_pdf', { filePath });
  }

  /**
   * 提取履歷資訊
   */
  async extractResumeInfo(filePath: string): Promise<any> {
    return await this.callTool('extract_resume_info', { filePath });
  }

  /**
   * 生成面試問題
   */
  async generateQuestions(resumeInfo: any, questionCount: number = 5): Promise<any> {
    return await this.callTool('generate_interview_questions', {
      resumeInfo,
      questionCount
    });
  }

  /**
   * 儲存面試上下文
   */
  async saveContext(candidateId: string, context: any): Promise<any> {
    return await this.callTool('save_interview_context', {
      candidateId,
      context
    });
  }

  /**
   * 取得面試上下文
   */
  async getContext(candidateId: string): Promise<any> {
    return await this.callTool('get_interview_context', { candidateId });
  }

  /**
   * 列出所有檔案
   */
  async listFiles(): Promise<any> {
    const response = await fetch(`${MCP_SERVER_URL}/api/files/list`);
    if (!response.ok) {
      throw new Error('列出檔案失敗');
    }
    return await response.json();
  }
}

// 匯出單例
export const mcpClient = new MCPClient();
```

### 在面試頁面中使用

修改 `aituber-kit/src/pages/interview.tsx`，添加履歷上傳功能：

```typescript
import { mcpClient } from '@/lib/mcpClient';
import { useState } from 'react';

// 在 Interview 組件中添加
const [resumeFile, setResumeFile] = useState<File | null>(null);
const [resumeInfo, setResumeInfo] = useState<any>(null);
const [customQuestions, setCustomQuestions] = useState<string[]>([]);

// 處理履歷上傳
const handleResumeUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    // 1. 上傳檔案
    const uploadResult = await mcpClient.uploadFile(file);
    const filename = uploadResult.file.filename;

    // 2. 提取履歷資訊
    const extractResult = await mcpClient.extractResumeInfo(filename);
    const info = extractResult.result.resumeInfo;
    setResumeInfo(info);

    // 3. 生成個性化問題
    const questionsResult = await mcpClient.generateQuestions(info, 5);
    setCustomQuestions(questionsResult.result.questions);

    // 4. 更新系統提示詞，結合履歷資訊
    const enhancedPrompt = `
你是一位專業的 AI 面試官。以下是面試者的背景資訊：

【教育背景】
${info.education.join('\n')}

【工作經歷】
${info.workExperience.join('\n')}

【專業技能】
${info.skills.join('\n')}

${info.projects.length > 0 ? `【專案經驗】\n${info.projects.join('\n')}` : ''}

請根據以上資訊，用專業且友善的態度進行面試。
針對面試者的背景提出有深度的問題，並評估其專業能力和個人特質。
`;

    // 更新系統提示詞
    settingsStore.setState({
      systemPrompt: enhancedPrompt
    });

    toastStore.getState().addToast({
      message: '履歷上傳成功！已生成個性化面試問題',
      type: 'success'
    });
  } catch (error) {
    console.error('履歷處理失敗:', error);
    toastStore.getState().addToast({
      message: '履歷處理失敗',
      type: 'error'
    });
  }
};
```

在 JSX 中添加上傳按鈕：

```tsx
{/* 履歷上傳區 */}
<div className="absolute top-20 left-4 bg-white p-4 rounded shadow-lg z-50">
  <h3 className="text-lg font-bold mb-2">上傳面試者履歷</h3>
  <input
    type="file"
    accept=".pdf"
    onChange={handleResumeUpload}
    className="block w-full text-sm text-gray-900 border border-gray-300 rounded cursor-pointer bg-gray-50 focus:outline-none"
  />
  {resumeInfo && (
    <div className="mt-2 text-sm">
      <p className="text-green-600">✓ 履歷已分析</p>
      <p>生成了 {customQuestions.length} 個個性化問題</p>
    </div>
  )}
</div>
```

## 📊 完整使用流程

1. **啟動 MCP Server**
   ```powershell
   # 在 C:\dev\AITUBER\mcp-server 目錄執行
   npm run dev
   ```

2. **啟動 aituber-kit**
   ```powershell
   # 在 C:\dev\AITUBER\aituber-kit 目錄執行
   npm run dev
   ```

3. **開始面試流程**
   - 在瀏覽器開啟 `http://localhost:3000/interview`
   - 上傳面試者的履歷 PDF
   - 系統自動分析履歷並生成個性化問題
   - AI 面試官會根據履歷內容提問
   - 例如：「您在 XX 大學有製作過相關的專案嗎？」
   - 例如：「您上一份 XX 工作讓您有什麼樣的成長呢？」

## 🔧 API 文件

### 檔案管理 API

#### POST `/api/files/upload`
上傳檔案

**Request:**
```
Content-Type: multipart/form-data
Body: file (binary)
```

**Response:**
```json
{
  "success": true,
  "file": {
    "originalName": "resume.pdf",
    "filename": "resume-1234567890.pdf",
    "path": "./uploads/resume-1234567890.pdf",
    "size": 123456,
    "mimetype": "application/pdf"
  }
}
```

#### GET `/api/files/list`
列出所有檔案

**Response:**
```json
{
  "success": true,
  "count": 2,
  "files": [
    {
      "name": "resume-1234567890.pdf",
      "path": "./uploads/resume-1234567890.pdf",
      "size": 123456,
      "createdAt": "2025-10-08T10:00:00.000Z",
      "modifiedAt": "2025-10-08T10:00:00.000Z"
    }
  ]
}
```

### MCP 工具 API

#### POST `/api/mcp/tool`
調用 MCP 工具

**Request:**
```json
{
  "tool": "extract_resume_info",
  "arguments": {
    "filePath": "resume-1234567890.pdf"
  }
}
```

**Response:**
```json
{
  "success": true,
  "tool": "extract_resume_info",
  "result": {
    "resumeInfo": {
      "education": ["國立台灣大學 資訊工程學系"],
      "workExperience": ["軟體工程師 at XX公司"],
      "skills": ["Python", "JavaScript", "React"],
      "projects": ["電商平台開發"],
      "certifications": []
    }
  }
}
```

#### GET `/api/mcp/tools`
取得所有可用工具

**Response:**
```json
{
  "success": true,
  "tools": [...]
}
```

## ❓ 常見問題

### Q1: 端口 3001 被佔用怎麼辦？

**在 VSCode PowerShell 終端執行：**
```powershell
# 查看佔用端口的程序
Get-NetTCPConnection -LocalPort 3001

# 修改 .env 檔案，更換端口
# PORT=3002
```

### Q2: CORS 錯誤

確保 `.env` 中的 `ALLOWED_ORIGINS` 包含 aituber-kit 的網址：
```env
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

### Q3: 上傳檔案失敗

檢查檔案大小是否超過限制（預設 50MB），並確保檔案類型正確（.pdf, .doc, .docx, .txt）。

### Q4: Docker 容器無法啟動

**在 VSCode PowerShell 終端執行：**
```powershell
# 查看詳細錯誤
docker logs mcp-server

# 重新建立
docker-compose down
docker-compose up --build
```

## 📞 支援

如有問題，請查看：
- [README.md](./README.md) - 專案概述
- [GitHub Issues](https://github.com/your-repo/issues) - 回報問題

## 🎉 完成！

現在您的 MCP Server 已經準備就緒，可以開始在 aituber-kit 專案中使用了！


