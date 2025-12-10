import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const S3_BUCKET = process.env.S3_BUCKET
const S3_REGION = process.env.S3_REGION || 'ap-northeast-1'
const S3_VIDEO_PREFIX = process.env.S3_VIDEO_PREFIX || 'interview-recordings/'

let s3Client: S3Client | null = null

function initS3Client(): S3Client | null {
  if (!S3_BUCKET) {
    return null
  }

  if (!s3Client) {
    s3Client = new S3Client({
      region: S3_REGION,
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined, // 如果沒有設定，會使用預設的 AWS 憑證鏈（IAM 角色、環境變數等）
    })
  }

  return s3Client
}

export async function uploadInterviewVideoToS3(
  fileBuffer: Buffer,
  filename: string,
  filePath?: string
): Promise<{ success: boolean; s3Key?: string; error?: string }> {
  const client = initS3Client()

  if (!client || !S3_BUCKET) {
    return { success: false, error: 'S3_BUCKET 未設定' }
  }

  try {
    const s3Key = `${S3_VIDEO_PREFIX}${filename}`
    const contentType = filename.endsWith('.webm')
      ? 'video/webm'
      : filename.endsWith('.mp4')
        ? 'video/mp4'
        : 'application/octet-stream'

    await client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: contentType,
        Metadata: {
          originalName: filename,
          uploadedAt: new Date().toISOString(),
          fileSize: fileBuffer.length.toString(),
          type: 'interview-recording',
        },
      })
    )

    // 如果設定了上傳後刪除，且提供了檔案路徑，則刪除本地檔案
    if (process.env.S3_DELETE_AFTER_UPLOAD === 'true' && filePath) {
      try {
        const fs = await import('fs/promises')
        await fs.unlink(filePath)
      } catch (error) {
        console.error(`Failed to delete local file: ${filePath}`, error)
      }
    }

    return { success: true, s3Key }
  } catch (error) {
    console.error('Failed to upload interview video to S3:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '上傳失敗',
    }
  }
}

/**
 * 從檔案路徑上傳影片到 S3
 */
export async function uploadInterviewVideoFromPath(
  filePath: string
): Promise<{ success: boolean; s3Key?: string; error?: string }> {
  const client = initS3Client()

  if (!client || !S3_BUCKET) {
    return { success: false, error: 'S3_BUCKET 未設定' }
  }

  try {
    const fs = await import('fs/promises')
    const path = await import('path')

    // 檢查檔案是否存在
    try {
      await fs.access(filePath)
    } catch {
      return { success: false, error: '檔案不存在' }
    }

    // 讀取檔案
    const fileBuffer = await fs.readFile(filePath)
    const filename = path.basename(filePath)

    // 上傳
    const result = await uploadInterviewVideoToS3(
      fileBuffer,
      filename,
      filePath
    )

    return result
  } catch (error) {
    console.error('Failed to upload from file path:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '上傳失敗',
    }
  }
}

