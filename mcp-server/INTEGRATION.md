# 與 aituber-kit 整合指南

本文件說明如何將 MCP Server 整合到 aituber-kit 專案中，實現基於履歷的個性化面試功能。

## 🎯 整合目標

實現以下功能：
1. 面試官可以上傳面試者的履歷 PDF
2. 系統自動分析履歷內容（教育背景、工作經歷、技能等）
3. 根據履歷內容生成個性化的面試問題
4. AI 面試官結合履歷資訊和系統提示詞進行面試
5. 提問範例：
   - "您在 XX 大學有製作過相關的專案嗎？"
   - "您上一份 XX 工作讓您有什麼樣的成長呢？"

## 📋 前置作業

確保兩個伺服器都在運行：

### 選項 A：MCP Server 使用 Docker（推薦）

**執行環境 1：MCP Server（在 VSCode PowerShell 終端，位於 `C:\dev\AITUBER\mcp-server`）**
```powershell
cd C:\dev\AITUBER\mcp-server

# 使用腳本快速啟動
.\scripts\docker-start.ps1

# 或手動啟動
docker-compose up -d --build

# 查看日誌確認運行
docker logs -f mcp-server
# 應在 http://localhost:3001 運行
```

**執行環境 2：aituber-kit（在 VSCode PowerShell 終端，位於 `C:\dev\AITUBER\aituber-kit`）**
```powershell
cd C:\dev\AITUBER\aituber-kit
npm run dev
# 應在 http://localhost:3000 運行
```

### 選項 B：MCP Server 使用本地開發模式

**執行環境 1：MCP Server（在 VSCode PowerShell 終端，位於 `C:\dev\AITUBER\mcp-server`）**
```powershell
cd C:\dev\AITUBER\mcp-server
npm install
npm run dev
# 應在 http://localhost:3001 運行
```

**執行環境 2：aituber-kit（在 VSCode PowerShell 終端，位於 `C:\dev\AITUBER\aituber-kit`）**
```powershell
cd C:\dev\AITUBER\aituber-kit
npm run dev
# 應在 http://localhost:3000 運行
```

## 🔧 步驟 1: 建立 MCP 客戶端

在 aituber-kit 專案中建立 `src/lib/mcpClient.ts`：

**執行環境：aituber-kit 專案**

```typescript
// src/lib/mcpClient.ts
const MCP_SERVER_URL = process.env.NEXT_PUBLIC_MCP_SERVER_URL || 'http://localhost:3001';

export interface ResumeInfo {
  education: string[];
  workExperience: string[];
  skills: string[];
  projects: string[];
  certifications: string[];
}

export interface UploadResult {
  success: boolean;
  file: {
    originalName: string;
    filename: string;
    path: string;
    size: number;
    mimetype: string;
  };
}

export interface ExtractResult {
  success: boolean;
  resumeInfo: ResumeInfo;
  rawText: string;
}

export interface QuestionsResult {
  success: boolean;
  questionCount: number;
  questions: string[];
  basedOn: string[];
}

export class MCPClient {
  /**
   * 上傳檔案到 MCP Server
   */
  async uploadFile(file: File): Promise<UploadResult> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${MCP_SERVER_URL}/api/files/upload`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '檔案上傳失敗');
    }

    return await response.json();
  }

  /**
   * 調用 MCP 工具
   */
  private async callTool(toolName: string, args: Record<string, any>): Promise<any> {
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
      const error = await response.json();
      throw new Error(error.message || '工具調用失敗');
    }

    const result = await response.json();
    return result.result;
  }

  /**
   * 提取履歷資訊
   */
  async extractResumeInfo(filePath: string): Promise<ExtractResult> {
    return await this.callTool('extract_resume_info', { filePath });
  }

  /**
   * 生成面試問題
   */
  async generateQuestions(resumeInfo: ResumeInfo, questionCount: number = 5): Promise<QuestionsResult> {
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

## 🔧 步驟 2: 建立履歷上傳組件

建立 `src/components/interview/ResumeUpload.tsx`：

```typescript
import React, { useState } from 'react';
import { mcpClient, ResumeInfo, QuestionsResult } from '@/lib/mcpClient';
import toastStore from '@/features/stores/toast';
import settingsStore from '@/features/stores/settings';

interface ResumeUploadProps {
  onResumeProcessed?: (resumeInfo: ResumeInfo, questions: string[]) => void;
}

export const ResumeUpload: React.FC<ResumeUploadProps> = ({ onResumeProcessed }) => {
  const [uploading, setUploading] = useState(false);
  const [resumeInfo, setResumeInfo] = useState<ResumeInfo | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 檢查檔案類型
    if (!file.name.endsWith('.pdf')) {
      toastStore.getState().addToast({
        message: '請上傳 PDF 格式的履歷',
        type: 'error'
      });
      return;
    }

    setUploading(true);

    try {
      // 1. 上傳檔案
      toastStore.getState().addToast({
        message: '正在上傳履歷...',
        type: 'info'
      });

      const uploadResult = await mcpClient.uploadFile(file);
      const filename = uploadResult.file.filename;

      // 2. 提取履歷資訊
      toastStore.getState().addToast({
        message: '正在分析履歷內容...',
        type: 'info'
      });

      const extractResult = await mcpClient.extractResumeInfo(filename);
      const info = extractResult.resumeInfo;
      setResumeInfo(info);

      // 3. 生成個性化問題
      toastStore.getState().addToast({
        message: '正在生成面試問題...',
        type: 'info'
      });

      const questionsResult = await mcpClient.generateQuestions(info, 5);
      setQuestions(questionsResult.questions);

      // 4. 更新系統提示詞
      const enhancedPrompt = generateEnhancedPrompt(info, questionsResult.questions);
      settingsStore.setState({
        systemPrompt: enhancedPrompt
      });

      // 5. 通知父組件
      if (onResumeProcessed) {
        onResumeProcessed(info, questionsResult.questions);
      }

      toastStore.getState().addToast({
        message: '✓ 履歷分析完成！已生成個性化面試問題',
        type: 'success'
      });

    } catch (error) {
      console.error('履歷處理失敗:', error);
      toastStore.getState().addToast({
        message: `履歷處理失敗: ${error instanceof Error ? error.message : '未知錯誤'}`,
        type: 'error'
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-lg">
      <h3 className="text-lg font-bold mb-3 text-gray-800">📄 上傳面試者履歷</h3>
      
      <div className="mb-3">
        <label className="block">
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            disabled={uploading}
            className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed p-2"
          />
        </label>
      </div>

      {uploading && (
        <div className="mb-3 flex items-center text-blue-600">
          <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm">處理中...</span>
        </div>
      )}

      {resumeInfo && (
        <div className="mt-3 text-sm space-y-2">
          <div className="flex items-start">
            <span className="text-green-600 mr-2">✓</span>
            <div className="flex-1">
              <p className="font-semibold text-gray-800">履歷分析完成</p>
              <p className="text-gray-600 mt-1">生成了 {questions.length} 個個性化問題</p>
            </div>
          </div>

          <div className="bg-gray-50 p-3 rounded space-y-2">
            {resumeInfo.education.length > 0 && (
              <div>
                <span className="font-semibold text-gray-700">教育背景：</span>
                <span className="text-gray-600 ml-1">{resumeInfo.education.length} 項</span>
              </div>
            )}
            {resumeInfo.workExperience.length > 0 && (
              <div>
                <span className="font-semibold text-gray-700">工作經歷：</span>
                <span className="text-gray-600 ml-1">{resumeInfo.workExperience.length} 項</span>
              </div>
            )}
            {resumeInfo.skills.length > 0 && (
              <div>
                <span className="font-semibold text-gray-700">專業技能：</span>
                <span className="text-gray-600 ml-1">{resumeInfo.skills.length} 項</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function generateEnhancedPrompt(resumeInfo: ResumeInfo, questions: string[]): string {
  return `你是一位專業的 AI 面試官。以下是面試者的背景資訊：

【教育背景】
${resumeInfo.education.length > 0 ? resumeInfo.education.join('\n') : '未提供'}

【工作經歷】
${resumeInfo.workExperience.length > 0 ? resumeInfo.workExperience.join('\n') : '未提供'}

【專業技能】
${resumeInfo.skills.length > 0 ? resumeInfo.skills.join('\n') : '未提供'}

${resumeInfo.projects.length > 0 ? `【專案經驗】\n${resumeInfo.projects.join('\n')}\n` : ''}
${resumeInfo.certifications.length > 0 ? `【證照認證】\n${resumeInfo.certifications.join('\n')}\n` : ''}

【建議問題方向】
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

請根據以上資訊，用專業且友善的態度進行面試。
針對面試者的背景提出有深度的問題，例如：
- "您在 XX 大學有製作過相關的專案嗎？請分享一下經驗。"
- "您上一份 XX 工作讓您獲得了什麼樣的成長？"
- "關於您提到的 XX 技能，能否舉個實際運用的例子？"

評估面試者的專業能力、問題解決能力和個人特質。
`;
}
```

## 🔧 步驟 3: 整合到面試頁面

修改 `src/pages/interview.tsx`，添加履歷上傳功能：

```typescript
// 在 import 區塊添加
import { ResumeUpload } from '@/components/interview/ResumeUpload';
import { ResumeInfo } from '@/lib/mcpClient';

// 在 Interview 組件中添加狀態
const [resumeData, setResumeData] = useState<{
  info: ResumeInfo | null;
  questions: string[];
}>({
  info: null,
  questions: []
});

// 添加處理函數
const handleResumeProcessed = (resumeInfo: ResumeInfo, questions: string[]) => {
  setResumeData({
    info: resumeInfo,
    questions
  });
  
  console.log('履歷資訊:', resumeInfo);
  console.log('生成問題:', questions);
};

// 在 JSX 中添加（在面試開始前顯示）
{interviewFlow.interviewStatus === 'waiting' && (
  <div className="absolute top-4 left-4 z-50" style={{ maxWidth: '400px' }}>
    <ResumeUpload onResumeProcessed={handleResumeProcessed} />
  </div>
)}
```

## 🔧 步驟 4: 更新環境變數

在 aituber-kit 專案的 `.env.local` 添加：

```env
NEXT_PUBLIC_MCP_SERVER_URL=http://localhost:3001
```

## 🧪 測試整合

### 測試步驟：

1. **啟動 MCP Server**
   ```powershell
   # 在 C:\dev\AITUBER\mcp-server 執行
   npm run dev
   ```

2. **啟動 aituber-kit**
   ```powershell
   # 在 C:\dev\AITUBER\aituber-kit 執行
   npm run dev
   ```

3. **開啟瀏覽器**
   - 訪問 `http://localhost:3000/interview`

4. **上傳履歷**
   - 點擊「上傳面試者履歷」
   - 選擇 PDF 檔案
   - 等待系統分析

5. **開始面試**
   - 系統會根據履歷內容生成個性化問題
   - AI 面試官會提出相關問題
   - 例如："您在台灣大學有製作過相關的專案嗎？"

## 📊 預期效果

上傳履歷後，系統會：

1. ✅ 自動提取教育背景、工作經歷、技能等資訊
2. ✅ 生成 5 個基於履歷的個性化問題
3. ✅ 更新 AI 面試官的系統提示詞
4. ✅ AI 面試官會針對履歷內容提問
5. ✅ 問題更加具體和相關

### 範例對話

**未上傳履歷時：**
- AI: "請介紹一下您自己。"
- AI: "您有什麼工作經驗？"

**上傳履歷後：**
- AI: "我看到您在國立台灣大學資訊工程學系就讀，能否分享一下在學期間最有成就感的專案或經驗？"
- AI: "關於您在 XX 公司擔任軟體工程師的經驗，這段經歷讓您獲得了什麼樣的成長？"
- AI: "您提到具備 React 和 TypeScript 的技能，能否舉個實際運用這些技能解決問題的例子？"

## 🔍 除錯技巧

### 檢查 MCP Server 狀態

**執行環境：在 VSCode PowerShell 終端執行**

```powershell
# 測試連接
Invoke-RestMethod -Uri http://localhost:3001/health

# 查看可用工具
Invoke-RestMethod -Uri http://localhost:3001/api/mcp/tools
```

### 檢查瀏覽器控制台

按 F12 開啟開發者工具，查看：
- Network 標籤：檢查 API 請求
- Console 標籤：查看錯誤訊息

### 常見問題

1. **CORS 錯誤**
   - 確認 MCP Server 的 `.env` 包含 `ALLOWED_ORIGINS=http://localhost:3000`

2. **上傳失敗**
   - 檢查檔案大小是否超過 50MB
   - 確認檔案格式為 PDF

3. **提取失敗**
   - 確認 PDF 為文字型（非掃描圖片）
   - 檢查 MCP Server 日誌

## 🎉 完成

恭喜！您已成功整合 MCP Server 到 aituber-kit 專案。

現在 AI 面試官可以：
- 📄 讀取面試者履歷
- 🧠 理解背景資訊
- 💬 提出個性化問題
- 🎯 進行更專業的面試

