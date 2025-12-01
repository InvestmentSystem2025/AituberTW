import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs/promises';
import path from 'path';
import cron from 'node-cron';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const S3_BUCKET = process.env.S3_BUCKET;
const S3_REGION = process.env.S3_REGION || 'ap-northeast-1';
const S3_PREFIX = process.env.S3_PREFIX || 'resumes/';
const S3_SYNC_SCHEDULE = process.env.S3_SYNC_SCHEDULE || '0 * * * *'; // 默认每小时
const S3_DELETE_AFTER_UPLOAD = process.env.S3_DELETE_AFTER_UPLOAD === 'true';

// 记录已上传文件的路径（用于避免重复上传）
const SYNC_STATE_FILE = path.join(process.cwd(), '.s3-sync-state.json');

interface SyncState {
  lastSyncTime: string;
  uploadedFiles: string[];
}

let s3Client: S3Client | null = null;

/**
 * 初始化 S3 客户端
 */
function initS3Client(): boolean {
  if (!S3_BUCKET) {
    console.log('⚠️  S3_BUCKET 未配置，跳过 S3 同步功能');
    return false;
  }

  try {
    s3Client = new S3Client({
      region: S3_REGION,
      credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined, // 如果没有配置，会使用默认的 AWS 凭证链（IAM 角色、环境变量等）
    });
    console.log(`✅ S3 客户端已初始化 (Bucket: ${S3_BUCKET}, Region: ${S3_REGION})`);
    return true;
  } catch (error) {
    console.error('❌ S3 客户端初始化失败:', error);
    return false;
  }
}

/**
 * 读取同步状态
 */
async function readSyncState(): Promise<SyncState> {
  try {
    const data = await fs.readFile(SYNC_STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      lastSyncTime: new Date(0).toISOString(),
      uploadedFiles: [],
    };
  }
}

/**
 * 保存同步状态
 */
async function saveSyncState(state: SyncState): Promise<void> {
  await fs.writeFile(SYNC_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * 检查文件是否已在 S3 中存在
 */
async function fileExistsInS3(key: string): Promise<boolean> {
  if (!s3Client) return false;

  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: S3_BUCKET!,
        Key: key,
      })
    );
    return true;
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * 上传单个文件到 S3
 */
async function syncFileToS3(filePath: string, fileName: string): Promise<boolean> {
  if (!s3Client) return false;

  const s3Key = `${S3_PREFIX}${fileName}`;

  try {
    // 检查文件是否已存在
    const exists = await fileExistsInS3(s3Key);
    if (exists) {
      console.log(`⏭️  文件 ${fileName} 已存在于 S3，跳过`);
      return true;
    }

    // 读取文件内容
    const fileContent = await fs.readFile(filePath);
    const stats = await fs.stat(filePath);

    // 上传到 S3
    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET!,
        Key: s3Key,
        Body: fileContent,
        ContentType: 'application/pdf',
        Metadata: {
          originalName: fileName,
          uploadedAt: new Date().toISOString(),
          fileSize: stats.size.toString(),
        },
      })
    );

    console.log(`✅ 已上传 ${fileName} 到 S3 (${(stats.size / 1024).toFixed(2)} KB)`);

    // 如果配置了上传后删除，则删除本地文件
    if (S3_DELETE_AFTER_UPLOAD) {
      await fs.unlink(filePath);
      console.log(`🗑️  已删除本地文件 ${fileName}`);
    }

    return true;
  } catch (error) {
    console.error(`❌ 上传 ${fileName} 失败:`, error);
    return false;
  }
}

/**
 * 同步所有文件到 S3
 */
export async function syncAllFilesToS3(): Promise<void> {
  if (!s3Client) {
    console.log('⚠️  S3 客户端未初始化，跳过同步');
    return;
  }

  try {
    console.log('🔄 开始同步文件到 S3...');

    // 确保上传目录存在
    try {
      await fs.access(UPLOAD_DIR);
    } catch {
      console.log(`📁 上传目录不存在: ${UPLOAD_DIR}`);
      return;
    }

    // 读取所有文件
    const files = await fs.readdir(UPLOAD_DIR);
    const pdfFiles = files.filter((f) => f.toLowerCase().endsWith('.pdf'));

    if (pdfFiles.length === 0) {
      console.log('📭 没有找到 PDF 文件');
      return;
    }

    console.log(`📄 找到 ${pdfFiles.length} 个 PDF 文件`);

    // 读取同步状态
    const syncState = await readSyncState();
    const uploadedFiles = new Set(syncState.uploadedFiles);

    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;

    // 上传每个文件
    for (const fileName of pdfFiles) {
      const filePath = path.join(UPLOAD_DIR, fileName);

      // 检查文件是否已上传过
      const fileKey = `${S3_PREFIX}${fileName}`;
      if (uploadedFiles.has(fileKey)) {
        // 即使记录中已存在，也检查 S3 中是否真的存在
        const exists = await fileExistsInS3(fileKey);
        if (exists) {
          skipCount++;
          continue;
        }
      }

      const success = await syncFileToS3(filePath, fileName);
      if (success) {
        successCount++;
        uploadedFiles.add(fileKey);
      } else {
        failCount++;
      }
    }

    // 更新同步状态
    await saveSyncState({
      lastSyncTime: new Date().toISOString(),
      uploadedFiles: Array.from(uploadedFiles),
    });

    console.log(
      `✅ 同步完成: 成功 ${successCount}, 跳过 ${skipCount}, 失败 ${failCount}`
    );
  } catch (error) {
    console.error('❌ 同步文件到 S3 时发生错误:', error);
  }
}

/**
 * 启动 S3 同步定时任务
 */
export function startS3SyncScheduler(): void {
  if (!initS3Client()) {
    return;
  }

  // 启动时立即执行一次
  console.log('🚀 启动 S3 同步服务...');
  syncAllFilesToS3().catch((error) => {
    console.error('❌ 初始同步失败:', error);
  });

  // 设置定时任务
  try {
    cron.schedule(S3_SYNC_SCHEDULE, async () => {
      console.log(`⏰ 定时同步触发 (${S3_SYNC_SCHEDULE})`);
      await syncAllFilesToS3();
    });

    console.log(`⏰ S3 同步定时任务已启动 (${S3_SYNC_SCHEDULE})`);
  } catch (error) {
    console.error('❌ 启动定时任务失败:', error);
  }
}

/**
 * 手动触发同步（用于 API 调用）
 */
export async function manualSync(): Promise<{ success: boolean; message: string }> {
  if (!s3Client) {
    return {
      success: false,
      message: 'S3 客户端未初始化',
    };
  }

  try {
    await syncAllFilesToS3();
    return {
      success: true,
      message: '同步完成',
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : '同步失败',
    };
  }
}

