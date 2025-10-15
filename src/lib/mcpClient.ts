// MCP Server 客戶端
// 用於與 MCP Server 通訊，處理履歷上傳、PDF 讀取等功能

const MCP_SERVER_URL = process.env.NEXT_PUBLIC_MCP_SERVER_URL;

export interface ResumeInfo {
  education: string[];
  workExperience: string[];
  skills: string[];
  projects: string[];
  certifications: string[];
}

export interface UploadResult {
  success: boolean;
  message?: string;
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
  filePath: string;
  resumeInfo: ResumeInfo;
  rawText: string;
}

export interface QuestionsResult {
  success: boolean;
  questionCount: number;
  questions: string[];
  basedOn: string[];
}

export interface MCPToolResult {
  success: boolean;
  tool?: string;
  result?: any;
  message?: string;
  error?: string;
}

export class MCPClient {
  private baseUrl: string;

  constructor(baseUrl: string = MCP_SERVER_URL ?? '') {
    this.baseUrl = baseUrl;
  }

  /**
   * 檢查 MCP Server 健康狀態
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
      });
      const data = await response.json();
      return data.status === 'ok';
    } catch (error) {
      console.error('MCP Server 健康檢查失敗:', error);
      return false;
    }
  }

  /**
   * 上傳檔案到 MCP Server
   */
  async uploadFile(file: File): Promise<UploadResult> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${this.baseUrl}/api/files/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || '檔案上傳失敗');
      }

      return await response.json();
    } catch (error) {
      console.error('上傳檔案失敗:', error);
      throw error;
    }
  }

  /**
   * 調用 MCP 工具
   */
  private async callTool(toolName: string, args: Record<string, any>): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/api/mcp/tool`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tool: toolName,
          arguments: args,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || '工具調用失敗');
      }

      const result: MCPToolResult = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || result.message || '工具執行失敗');
      }

      return result.result;
    } catch (error) {
      console.error(`調用工具 ${toolName} 失敗:`, error);
      throw error;
    }
  }

  /**
   * 讀取 PDF 檔案內容
   */
  async readPDF(filePath: string): Promise<any> {
    return await this.callTool('read_pdf', { filePath });
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
  async generateQuestions(
    resumeInfo: ResumeInfo,
    questionCount: number = 5
  ): Promise<QuestionsResult> {
    return await this.callTool('generate_interview_questions', {
      resumeInfo,
      questionCount,
    });
  }

  /**
   * 儲存面試上下文
   */
  async saveContext(candidateId: string, context: any): Promise<any> {
    return await this.callTool('save_interview_context', {
      candidateId,
      context,
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
    try {
      const response = await fetch(`${this.baseUrl}/api/files/list`);
      
      if (!response.ok) {
        throw new Error('列出檔案失敗');
      }

      return await response.json();
    } catch (error) {
      console.error('列出檔案失敗:', error);
      throw error;
    }
  }

  /**
   * 完整的履歷處理流程
   * 上傳 -> 提取資訊 -> 生成問題
   */
  async processResume(file: File, questionCount: number = 5): Promise<{
    uploadResult: UploadResult;
    extractResult: ExtractResult;
    questionsResult: QuestionsResult;
  }> {
    // 1. 上傳檔案
    const uploadResult = await this.uploadFile(file);

    // 2. 提取履歷資訊
    const extractResult = await this.extractResumeInfo(uploadResult.file.filename);

    // 3. 生成面試問題
    const questionsResult = await this.generateQuestions(
      extractResult.resumeInfo,
      questionCount
    );

    return {
      uploadResult,
      extractResult,
      questionsResult,
    };
  }
}

// 匯出單例
export const mcpClient = new MCPClient();


