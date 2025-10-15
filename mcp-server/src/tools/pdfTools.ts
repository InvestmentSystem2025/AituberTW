import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import FormData from 'form-data';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://ocr-service:5000';

interface OCRPage {
  page: number;
  text: string;
}

interface OCRResult {
  success: boolean;
  error?: string;
  ocr: {
    total_pages: number;
    total_chars: number;
    full_text: string;
    pages: OCRPage[];
  };
  conversion?: any;
}

export async function readPDF(filePath: string): Promise<CallToolResult> {
  try {
    // 如果是相對路徑，轉換為絕對路徑
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(UPLOAD_DIR, filePath);

    // 檢查檔案是否存在
    try {
      await fs.access(absolutePath);
    } catch {
      return {
        content: [
          {
            type: 'text',
            text: `檔案不存在: ${filePath}`
          }
        ],
        isError: true
      };
    }

    console.log(`========== 開始 OCR 處理 ==========`);
    console.log(`檔案路徑: ${absolutePath}`);
    console.log(`OCR 服務: ${OCR_SERVICE_URL}`);

    // 呼叫 OCR 服務（使用檔案路徑方式，避免 FormData 問題）
    console.log('正在呼叫 OCR 服務...');
    const response = await fetch(`${OCR_SERVICE_URL}/ocr/pdf-file`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filePath: path.basename(filePath),  // 只傳檔名，OCR 服務會自動加上 /app/uploads
        lang: 'chi_tra+eng+jpn',
        dpi: '300',
        crop_top: '350',  // 裁切頂部 350 像素（去除 banner）
        enhance: false  // 停用圖像增強
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OCR 服務回應錯誤 (${response.status}): ${errorText}`);
    }

    const ocrResult = await response.json() as OCRResult;

    if (!ocrResult.success) {
      throw new Error(`OCR 處理失敗: ${ocrResult.error || '未知錯誤'}`);
    }

    console.log(`========== OCR 完成 ==========`);
    console.log(`總頁數: ${ocrResult.ocr.total_pages}`);
    console.log(`總字符數: ${ocrResult.ocr.total_chars}`);
    console.log(`文字預覽 (前500字): ${ocrResult.ocr.full_text.substring(0, 500)}`);
    console.log('================================');

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            filePath,
            method: 'OCR',
            pageCount: ocrResult.ocr.total_pages,
            text: ocrResult.ocr.full_text,
            pages: ocrResult.ocr.pages.map((p: OCRPage) => ({
              pageNumber: p.page,
              text: p.text
            })),
            conversion: ocrResult.conversion
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    console.error('PDF OCR 錯誤:', error);
    return {
      content: [
        {
          type: 'text',
          text: `讀取 PDF 失敗 (OCR): ${error instanceof Error ? error.message : String(error)}\n堆疊: ${error instanceof Error ? error.stack : ''}`
        }
      ],
      isError: true
    };
  }
}

