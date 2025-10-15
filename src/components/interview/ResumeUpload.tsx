import React, { useState, useRef } from 'react';
import { mcpClient, ResumeInfo, QuestionsResult } from '@/lib/mcpClient';
import toastStore from '@/features/stores/toast';
import settingsStore from '@/features/stores/settings';
import { getVercelAIChatResponse } from '@/features/chat/vercelAIChat';
import { Message } from '@/features/messages/messages';

interface ResumeUploadProps {
  onResumeProcessed?: (resumeInfo: ResumeInfo, questions: string[], aiGreeting: string) => void;
  onError?: (error: string) => void;
}

export const ResumeUpload: React.FC<ResumeUploadProps> = ({
  onResumeProcessed,
  onError,
}) => {
  const [uploading, setUploading] = useState(false);
  const [resumeInfo, setResumeInfo] = useState<ResumeInfo | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 檢查檔案類型
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      const errorMsg = '請上傳 PDF 格式的履歷';
      toastStore.getState().addToast({
        message: errorMsg,
        type: 'error',
        tag: 'resume-upload',
      });
      if (onError) onError(errorMsg);
      return;
    }

    // 檢查檔案大小（限制 10MB）
    if (file.size > 10 * 1024 * 1024) {
      const errorMsg = '檔案大小不能超過 10MB';
      toastStore.getState().addToast({
        message: errorMsg,
        type: 'error',
        tag: 'resume-upload',
      });
      if (onError) onError(errorMsg);
      return;
    }

    setUploading(true);
    setFileName(file.name);

    try {
      // 先檢查 MCP Server 是否運行
      toastStore.getState().addToast({
        message: '正在連接 MCP Server...',
        type: 'info',
        tag: 'resume-upload',
      });

      const isHealthy = await mcpClient.healthCheck();
      if (!isHealthy) {
        throw new Error('MCP Server 未運行，請先啟動 MCP Server');
      }

      // 1. 上傳檔案
      toastStore.getState().addToast({
        message: '正在上傳履歷...',
        type: 'info',
        tag: 'resume-upload',
      });

      const result = await mcpClient.processResume(file, 5);

      const info = result.extractResult.resumeInfo;
      setResumeInfo(info);
      setQuestions(result.questionsResult.questions);

      // 4. 更新系統提示詞
      const enhancedPrompt = generateEnhancedPrompt(
        info,
        result.questionsResult.questions
      );
      settingsStore.setState({
        systemPrompt: enhancedPrompt,
      });

      // 5. 預先生成 AI 問候語
      toastStore.getState().addToast({
        message: '正在準備 AI 面試官的歡迎詞...',
        type: 'info',
        tag: 'resume-upload',
      });

      const aiGreeting = await generateAIGreeting(
        info,
        result.questionsResult.questions
      );

      // 6. 通知父組件
      if (onResumeProcessed) {
        onResumeProcessed(info, result.questionsResult.questions, aiGreeting);
      }

      toastStore.getState().addToast({
        message: '✓ 履歷分析完成！AI 面試官已準備好歡迎您',
        type: 'success',
        tag: 'resume-upload',
      });
    } catch (error) {
      console.error('履歷處理失敗:', error);
      const errorMsg =
        error instanceof Error ? error.message : '履歷處理失敗，請確認 MCP Server 是否運行';
      
      toastStore.getState().addToast({
        message: errorMsg,
        type: 'error',
        tag: 'resume-upload',
      });

      if (onError) onError(errorMsg);

      // 重置狀態
      setResumeInfo(null);
      setQuestions([]);
      setFileName('');
    } finally {
      setUploading(false);
      // 重置檔案輸入
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleReset = () => {
    setResumeInfo(null);
    setQuestions([]);
    setFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-white/95 backdrop-blur-sm p-4 rounded-lg shadow-lg border border-gray-200">
      <h3 className="text-lg font-bold mb-3 text-gray-800 flex items-center">
        <span className="mr-2">📄</span>
        上傳面試者履歷
      </h3>

      {!resumeInfo ? (
        <div className="mb-3">
          <label className="block">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              disabled={uploading}
              className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed p-2 transition-colors"
            />
          </label>
          <p className="mt-2 text-xs text-gray-500">
            支援 PDF 格式，檔案大小限制 10MB
          </p>
        </div>
      ) : (
        <div className="mb-3 flex items-center justify-between bg-green-50 p-3 rounded-lg border border-green-200">
          <div className="flex items-center">
            <span className="text-green-600 mr-2 text-xl">✓</span>
            <div>
              <p className="text-sm font-semibold text-green-800">履歷已上傳</p>
              <p className="text-xs text-green-600">{fileName}</p>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="text-sm text-gray-600 hover:text-gray-800 underline"
          >
            重新上傳
          </button>
        </div>
      )}

      {uploading && (
        <div className="mb-3 flex items-center text-blue-600 bg-blue-50 p-3 rounded-lg border border-blue-200">
          <svg
            className="animate-spin h-5 w-5 mr-2"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="text-sm font-medium">處理中，請稍候...</span>
        </div>
      )}

      {resumeInfo && (
        <div className="mt-3 text-sm space-y-3">
          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-800">📊 履歷分析結果</span>
              <span className="text-xs text-gray-500">
                生成了 {questions.length} 個問題
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              {resumeInfo.education.length > 0 && (
                <div className="flex items-start">
                  <span className="text-gray-600 mr-2">🎓</span>
                  <div>
                    <span className="font-semibold text-gray-700">教育背景：</span>
                    <span className="text-gray-600 ml-1">
                      {resumeInfo.education.length} 項
                    </span>
                  </div>
                </div>
              )}
              {resumeInfo.workExperience.length > 0 && (
                <div className="flex items-start">
                  <span className="text-gray-600 mr-2">💼</span>
                  <div>
                    <span className="font-semibold text-gray-700">工作經歷：</span>
                    <span className="text-gray-600 ml-1">
                      {resumeInfo.workExperience.length} 項
                    </span>
                  </div>
                </div>
              )}
              {resumeInfo.skills.length > 0 && (
                <div className="flex items-start">
                  <span className="text-gray-600 mr-2">⚡</span>
                  <div>
                    <span className="font-semibold text-gray-700">專業技能：</span>
                    <span className="text-gray-600 ml-1">
                      {resumeInfo.skills.length} 項
                    </span>
                  </div>
                </div>
              )}
              {resumeInfo.projects.length > 0 && (
                <div className="flex items-start">
                  <span className="text-gray-600 mr-2">🚀</span>
                  <div>
                    <span className="font-semibold text-gray-700">專案經驗：</span>
                    <span className="text-gray-600 ml-1">
                      {resumeInfo.projects.length} 項
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {questions.length > 0 && (
            <details className="bg-blue-50 p-3 rounded-lg border border-blue-200">
              <summary className="cursor-pointer font-semibold text-blue-800 text-sm hover:text-blue-900">
                💡 查看生成的問題 ({questions.length})
              </summary>
              <ul className="mt-2 space-y-1.5 text-xs">
                {questions.map((q, i) => (
                  <li key={i} className="text-gray-700 pl-4">
                    {i + 1}. {q}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
};

function generateEnhancedPrompt(
  resumeInfo: ResumeInfo,
  questions: string[]
): string {
  const educationText =
    resumeInfo.education.length > 0
      ? resumeInfo.education.join('\n')
      : '未提供';
  const workText =
    resumeInfo.workExperience.length > 0
      ? resumeInfo.workExperience.join('\n')
      : '未提供';
  const skillsText =
    resumeInfo.skills.length > 0 ? resumeInfo.skills.join('\n') : '未提供';
  const projectsText =
    resumeInfo.projects.length > 0
      ? `\n【專案經驗】\n${resumeInfo.projects.join('\n')}\n`
      : '';
  const certsText =
    resumeInfo.certifications.length > 0
      ? `\n【證照認證】\n${resumeInfo.certifications.join('\n')}\n`
      : '';

  return `你是一位專業且友善的 AI 面試官。以下是面試者的背景資訊：

【教育背景】
${educationText}

【工作經歷】
${workText}

【專業技能】
${skillsText}
${projectsText}${certsText}
【建議問題方向】
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

請根據以上資訊，用專業且友善的態度進行面試。
針對面試者的背景提出有深度的問題，例如：
- "您在 XX 大學有製作過相關的專案嗎？請分享一下經驗。"
- "您上一份 XX 工作讓您獲得了什麼樣的成長？"
- "關於您提到的 XX 技能，能否舉個實際運用的例子？"

評估面試者的專業能力、問題解決能力和個人特質。
保持對話自然流暢，適時給予鼓勵和回饋。`;
}

/**
 * 預先生成 AI 問候語
 */
async function generateAIGreeting(
  resumeInfo: ResumeInfo,
  questions: string[]
): Promise<string> {
  try {
    const enhancedPrompt = generateEnhancedPrompt(resumeInfo, questions);
    
    const messages: Message[] = [
      {
        role: 'system',
        content: enhancedPrompt,
      },
      {
        role: 'user',
        content: '（面試者剛進入面試間）請用親切且專業的方式歡迎面試者，簡短介紹今天的面試流程，然後直接請他開始自我介紹。不要說任何祝福或期望的話語，直接進入面試。請保持在 80 字以內。',
      },
    ];

    const response = await getVercelAIChatResponse(messages);
    return response.text || '歡迎來到面試！今天我將針對您的背景進行一些提問，請放輕鬆回答。';
  } catch (error) {
    console.error('生成 AI 問候語失敗:', error);
    return '歡迎來到面試！今天我將針對您的背景進行一些提問，請放輕鬆回答。';
  }
}


