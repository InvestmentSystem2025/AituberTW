import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import { Dirent } from 'fs';
import path from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const DATA_DIR = process.env.DATA_DIR || './data';

export async function listFiles(
  directory?: string,
  fileType?: string
): Promise<CallToolResult> {
  try {
    const targetDir = directory ? path.join(UPLOAD_DIR, directory) : UPLOAD_DIR;

    // 確保目錄存在
    try {
      await fs.access(targetDir);
    } catch {
      await fs.mkdir(targetDir, { recursive: true });
    }

    // 讀取目錄內容
    const files = await fs.readdir(targetDir, { withFileTypes: true });

    // 篩選檔案
    let filteredFiles = files
      .filter((file: Dirent) => file.isFile())
      .map((file: Dirent) => ({
        name: file.name,
        path: path.join(targetDir, file.name)
      }));

    // 如果指定了檔案類型，進行篩選
    if (fileType) {
      filteredFiles = filteredFiles.filter(file => 
        file.name.toLowerCase().endsWith(fileType.toLowerCase())
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            directory: targetDir,
            fileCount: filteredFiles.length,
            files: filteredFiles
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `列出檔案失敗: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    };
  }
}

export async function saveContext(
  candidateId: string,
  context: Record<string, any>
): Promise<CallToolResult> {
  try {
    // 確保資料目錄存在
    await fs.mkdir(DATA_DIR, { recursive: true });

    const filePath = path.join(DATA_DIR, `${candidateId}.json`);
    const data = {
      candidateId,
      context,
      updatedAt: new Date().toISOString()
    };

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: '上下文已儲存',
            candidateId,
            filePath
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `儲存上下文失敗: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    };
  }
}

export async function getContext(candidateId: string): Promise<CallToolResult> {
  try {
    const filePath = path.join(DATA_DIR, `${candidateId}.json`);

    try {
      await fs.access(filePath);
    } catch {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              message: '找不到該面試者的上下文資訊',
              candidateId
            }, null, 2)
          }
        ]
      };
    }

    const data = await fs.readFile(filePath, 'utf-8');
    const context = JSON.parse(data);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            ...context
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `讀取上下文失敗: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    };
  }
}

