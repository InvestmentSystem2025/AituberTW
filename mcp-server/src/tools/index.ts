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
  },
  {
    name: 'automation_health',
    description: '檢查本機遊戲自動化後端服務狀態與已載入模板。',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'detect_grid',
    description: '擷取踩地雷棋盤，目前回傳 covered/flag/0..8/unknown 的二維陣列。',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'click_cell',
    description: '在踩地雷棋盤指定列行進行左鍵點擊。',
    inputSchema: {
      type: 'object',
      properties: {
        r: {
          type: 'number',
          description: '列索引（0-based）'
        },
        c: {
          type: 'number',
          description: '行索引（0-based）'
        }
      },
      required: ['r', 'c']
    }
  },
  {
    name: 'flag_cell',
    description: '在踩地雷棋盤指定列行進行右鍵插旗。',
    inputSchema: {
      type: 'object',
      properties: {
        r: {
          type: 'number',
          description: '列索引（0-based）'
        },
        c: {
          type: 'number',
          description: '行索引（0-based）'
        }
      },
      required: ['r', 'c']
    }
  },
  {
    name: 'step_solve',
    description: '觸發一次 deterministic 規則求解，會自動開格與插旗。',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'autoplay',
    description: '連續進行 deterministic 求解，可設定最大步數與兩步間延遲毫秒。',
    inputSchema: {
      type: 'object',
      properties: {
        max_steps: {
          type: 'number',
          description: '最大循環步數，預設 50'
        },
        sleep_ms: {
          type: 'number',
          description: '每次操作之間的延遲毫秒數，預設 80'
        }
      }
    }
  }
];

