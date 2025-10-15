import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const mcpTools: Tool[] = [
  {
    name: 'read_pdf',
    description: '讀取並解析 PDF 檔案內容，返回文字內容。適用於讀取面試者的履歷、證書等文件。',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'PDF 檔案的路徑或檔案 ID'
        }
      },
      required: ['filePath']
    }
  },
  {
    name: 'list_files',
    description: '列出指定目錄中的所有檔案，可以篩選檔案類型。',
    inputSchema: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: '要列出的目錄路徑，預設為 uploads 目錄'
        },
        fileType: {
          type: 'string',
          description: '檔案類型篩選，例如 .pdf, .doc'
        }
      }
    }
  },
  {
    name: 'save_interview_context',
    description: '儲存面試相關的上下文資訊，包括面試者資料、問題列表等。',
    inputSchema: {
      type: 'object',
      properties: {
        candidateId: {
          type: 'string',
          description: '面試者 ID'
        },
        context: {
          type: 'object',
          description: '要儲存的上下文資訊'
        }
      },
      required: ['candidateId', 'context']
    }
  },
  {
    name: 'get_interview_context',
    description: '取得指定面試者的上下文資訊。',
    inputSchema: {
      type: 'object',
      properties: {
        candidateId: {
          type: 'string',
          description: '面試者 ID'
        }
      },
      required: ['candidateId']
    }
  },
  {
    name: 'extract_resume_info',
    description: '從履歷 PDF 中提取結構化資訊，包括教育背景、工作經歷、技能等。',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'PDF 檔案的路徑或檔案 ID'
        }
      },
      required: ['filePath']
    }
  },
  {
    name: 'generate_interview_questions',
    description: '根據履歷內容生成個性化的面試問題。',
    inputSchema: {
      type: 'object',
      properties: {
        resumeInfo: {
          type: 'object',
          description: '從履歷中提取的資訊'
        },
        questionCount: {
          type: 'number',
          description: '要生成的問題數量，預設為 5'
        }
      },
      required: ['resumeInfo']
    }
  }
];

