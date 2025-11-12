import express, { Request, Response } from 'express';
import { handleToolCall } from '../tools/toolHandler.js';

const router = express.Router();

// 調用 MCP 工具的統一入口
router.post('/tool', async (req: Request, res: Response) => {
  try {
    const { tool, arguments: args } = req.body;

    if (!tool) {
      return res.status(400).json({
        success: false,
        message: '缺少 tool 參數'
      });
    }

    // 構造 MCP 請求格式
    const mcpRequest = {
      method: 'tools/call',
      params: {
        name: tool,
        arguments: args || {}
      }
    };

    // 調用工具處理器
    const result = await handleToolCall(mcpRequest as any);

    // 解析結果
    if (result.isError) {
      const errorContent = result.content[0] as { type: string; text: string };
      return res.status(500).json({
        success: false,
        message: '工具執行失敗',
        error: errorContent.text
      });
    }

    // 嘗試解析 JSON 結果
    let data;
    const textContent = result.content[0] as { type: string; text: string };
    try {
      data = JSON.parse(textContent.text);
    } catch {
      data = textContent.text;
    }

    res.json({
      success: true,
      tool,
      result: data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '工具調用失敗',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 取得所有可用的工具列表
router.get('/tools', (req: Request, res: Response) => {
  res.json({
    success: true,
    tools: [
      {
        name: 'read_pdf',
        description: '讀取並解析 PDF 檔案內容',
        parameters: {
          filePath: 'string (required) - PDF 檔案的路徑或檔案名'
        }
      },
      {
        name: 'list_files',
        description: '列出指定目錄中的所有檔案',
        parameters: {
          directory: 'string (optional) - 目錄路徑',
          fileType: 'string (optional) - 檔案類型篩選，例如 .pdf'
        }
      },
      {
        name: 'save_interview_context',
        description: '儲存面試相關的上下文資訊',
        parameters: {
          candidateId: 'string (required) - 面試者 ID',
          context: 'object (required) - 上下文資訊'
        }
      },
      {
        name: 'get_interview_context',
        description: '取得指定面試者的上下文資訊',
        parameters: {
          candidateId: 'string (required) - 面試者 ID'
        }
      },
      {
        name: 'extract_resume_info',
        description: '從履歷 PDF 中提取結構化資訊',
        parameters: {
          filePath: 'string (required) - PDF 檔案的路徑或檔案名'
        }
      },
      {
        name: 'generate_interview_questions',
        description: '根據履歷內容生成個性化的面試問題',
        parameters: {
          resumeInfo: 'object (required) - 從履歷中提取的資訊',
          questionCount: 'number (optional) - 要生成的問題數量，預設為 5'
        }
      },
      {
        name: 'automation_health',
        description: '檢查遊戲自動化後端狀態與模板清單',
        parameters: {}
      },
      {
        name: 'detect_grid',
        description: '擷取踩地雷棋盤狀態 (covered/flag/0..8/unknown)',
        parameters: {}
      },
      {
        name: 'click_cell',
        description: '在指定列行左鍵點擊以開啟格子',
        parameters: {
          r: 'number (required) - 列索引 (0-based)',
          c: 'number (required) - 行索引 (0-based)'
        }
      },
      {
        name: 'flag_cell',
        description: '在指定列行右鍵插旗',
        parameters: {
          r: 'number (required) - 列索引 (0-based)',
          c: 'number (required) - 行索引 (0-based)'
        }
      },
      {
        name: 'step_solve',
        description: '執行一次 deterministic 採地雷求解並同步操作棋盤',
        parameters: {}
      },
      {
        name: 'autoplay',
        description: '連續 deterministic 求解，可設定最大步數與延遲',
        parameters: {
          max_steps: 'number (optional) - 最大步數，預設 50',
          sleep_ms: 'number (optional) - 每步延遲毫秒數，預設 80'
        }
      }
    ]
  });
});

export { router as mcpRouter };

