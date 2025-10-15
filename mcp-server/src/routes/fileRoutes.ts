import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { Dirent } from 'fs';

const router = express.Router();
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

// 確保上傳目錄存在
async function ensureUploadDir() {
  try {
    await fs.access(UPLOAD_DIR);
  } catch {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  }
}

ensureUploadDir();

// Multer 配置
const storage = multer.diskStorage({
  destination: async (
    req: express.Request,
    file: Express.Multer.File,
    cb: (error: Error | null, destination: string) => void
  ) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (
    req: express.Request,
    file: Express.Multer.File,
    cb: (error: Error | null, filename: string) => void
  ) => {
    // 修正中文檔名編碼問題
    const originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(originalname);
    const name = path.basename(originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (
    req: express.Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
  ) => {
    const allowedTypes = process.env.ALLOWED_FILE_TYPES?.split(',') || ['.pdf', '.doc', '.docx', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支援的檔案類型: ${ext}. 允許的類型: ${allowedTypes.join(', ')}`));
    }
  }
});

// 上傳檔案
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '沒有上傳檔案'
      });
    }

    // 修正回傳的原始檔名編碼
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    
    res.json({
      success: true,
      message: '檔案上傳成功',
      file: {
        originalName: originalName,
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '檔案上傳失敗',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 列出所有檔案
router.get('/list', async (req: Request, res: Response) => {
  try {
    const files = await fs.readdir(UPLOAD_DIR, { withFileTypes: true });
    const fileList = await Promise.all(
      files
        .filter((file: Dirent) => file.isFile())
        .map(async (file: Dirent) => {
          const filePath = path.join(UPLOAD_DIR, file.name);
          const stats = await fs.stat(filePath);
          return {
            name: file.name,
            path: filePath,
            size: stats.size,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime
          };
        })
    );

    res.json({
      success: true,
      count: fileList.length,
      files: fileList
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '列出檔案失敗',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 刪除檔案
router.delete('/:filename', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(UPLOAD_DIR, filename);

    // 檢查檔案是否存在
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        success: false,
        message: '檔案不存在'
      });
    }

    await fs.unlink(filePath);

    res.json({
      success: true,
      message: '檔案刪除成功',
      filename
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '檔案刪除失敗',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 下載檔案
router.get('/download/:filename', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(UPLOAD_DIR, filename);

    // 檢查檔案是否存在
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        success: false,
        message: '檔案不存在'
      });
    }

    res.download(filePath);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '檔案下載失敗',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

export { router as fileRouter };

