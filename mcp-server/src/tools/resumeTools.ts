import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { readPDF } from './pdfTools.js';

interface ResumeInfo {
  education: string[];
  workExperience: string[];
  skills: string[];
  projects: string[];
  certifications: string[];
}

export async function extractResumeInfo(filePath: string): Promise<CallToolResult> {
  try {
    // 先讀取 PDF 內容
    const pdfResult = await readPDF(filePath);
    
    if (pdfResult.isError) {
      return pdfResult;
    }

    // 解析 PDF 結果
    const textContent = pdfResult.content[0] as { type: string; text: string };
    const pdfData = JSON.parse(textContent.text);
    let text = pdfData.text;

    // 清理文本：移除 null 字符和多餘空白
    text = text
      .replace(/\u0000/g, '') // 移除 null 字符
      .replace(/\s+/g, ' ')    // 合併多個空白
      .trim();

      console.log('========== PDF 解析結果 ==========');
      console.log('清理後的文本長度:', text.length);
      console.log('文本預覽 (前500字):', text.substring(0, 500));
      console.log('=====================================');

    // 使用簡單的關鍵字匹配來提取資訊
    const resumeInfo: ResumeInfo = {
      education: extractSection(text, ['教育', '學歷', 'Education', 'EDUCATION', '大學', '學校']),
      workExperience: extractSection(text, ['工作經歷', '經歷', 'Experience', 'EXPERIENCE', 'Work Experience', '工作', '公司']),
      skills: extractSection(text, ['技能', '專長', 'Skills', 'SKILLS', 'Technical Skills', '程式', '語言']),
      projects: extractSection(text, ['專案', '項目', 'Projects', 'PROJECTS', '專案成就']),
      certifications: extractSection(text, ['證照', '認證', 'Certifications', 'CERTIFICATIONS', 'JLPT', 'N1', 'N2'])
    };

    console.log('========== 提取結果 ==========');
    console.log('教育背景:', resumeInfo.education);
    console.log('工作經歷:', resumeInfo.workExperience);
    console.log('專業技能:', resumeInfo.skills);
    console.log('專案經驗:', resumeInfo.projects);
    console.log('證照認證:', resumeInfo.certifications);
    console.log('================================');

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            filePath,
            resumeInfo,
            rawText: text
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `提取履歷資訊失敗: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    };
  }
}

function extractSection(text: string, keywords: string[]): string[] {
  const results: string[] = [];
  
  console.log(`\n嘗試提取關鍵字: ${keywords.join(', ')}`);
  
  // 智能提取策略：從實際文本中找出有意義的資訊
  
  // 特殊處理：直接從文本中提取特定模式
  if (keywords.includes('大學') || keywords.includes('學校')) {
    // 提取大學名稱（包含"大學"、"學"、"大"等）
    const eduPatterns = [
      /([^\s]{2,10}大學[^\s]{0,20})/g,
      /([^\s]{2,10}學[^\s]{0,10})/g,
      /(桜[^\s]{1,10}大[^\s]{0,10})/g,
      /(\d{4}\/\d+~\d{4}\/\d+)/g  // 學習期間
    ];
    
    for (const pattern of eduPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        results.push(...matches);
      }
    }
  }
  
  if (keywords.includes('工作') || keywords.includes('公司')) {
    // 提取工作相關（公司名、職位）
    const workPatterns = [
      /([^\s]{2,15}(科技|公司|企業|集團)[^\s]{0,20})/g,
      /(工師|工程師|開發|設計師|分析師)[^\s]{0,20}/g,
      /(\d{4}\/\d+~[\d在]{0,10})/g  // 工作期間
    ];
    
    for (const pattern of workPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        results.push(...matches);
      }
    }
  }
  
  if (keywords.includes('技能') || keywords.includes('程式')) {
    // 提取程式語言和技能
    const skillPatterns = [
      /\b(python|javascript|java|c\+\+|c#|php|ruby|go|rust|typescript|react|nextjs|vue|angular|django|flask|node\.?js)\b/gi,
      /#([A-Z][a-zA-Z]+)/g,  // Hashtags
      /•([^\s•]{3,30})/g  // 項目符號後的內容
    ];
    
    for (const pattern of skillPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        results.push(...matches.map(m => m.replace(/^[•#]/, '').trim()));
      }
    }
  }
  
  if (keywords.includes('專案')) {
    // 提取專案名稱
    const projectPatterns = [
      /([A-Z][a-z]+ [A-Z][a-z]+)/g,  // 英文專案名
      /(https?:\/\/[^\s]+)/g,  // GitHub 連結
      /專案[^\s]{0,20}/g
    ];
    
    for (const pattern of projectPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        results.push(...matches);
      }
    }
  }
  
  if (keywords.includes('JLPT') || keywords.includes('證照')) {
    // 提取證照
    const certPatterns = [
      /(JLPT\s*N[1-5]\s*\d*)/gi,
      /(駕照|證照)[^\s]{0,20}/g
    ];
    
    for (const pattern of certPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        results.push(...matches);
      }
    }
  }
  
  console.log(`提取結果數量: ${results.length}`);
  
  // 清理結果
  return results
    .map(item => item.trim())
    .filter(item => item.length > 2)  // 至少2個字符
    .filter((item, index, self) => self.indexOf(item) === index) // 去重
    .slice(0, 10); // 最多保留10項
}

export async function generateQuestions(
  resumeInfo: Record<string, any>,
  questionCount: number = 5
): Promise<CallToolResult> {
  try {
    const questions: string[] = [];

    // 根據教育背景生成問題
    if (resumeInfo.education && resumeInfo.education.length > 0) {
      questions.push(
        `我看到您在履歷中提到${resumeInfo.education[0]}，能否分享一下在學期間最有成就感的專案或經驗？`
      );
    }

    // 根據工作經歷生成問題
    if (resumeInfo.workExperience && resumeInfo.workExperience.length > 0) {
      questions.push(
        `關於您的${resumeInfo.workExperience[0]}，這段經驗讓您獲得了什麼樣的成長？`
      );
      if (resumeInfo.workExperience.length > 1) {
        questions.push(
          `您從前一份工作轉換到現在這個領域的動機是什麼？`
        );
      }
    }

    // 根據技能生成問題
    if (resumeInfo.skills && resumeInfo.skills.length > 0) {
      questions.push(
        `您提到具備${resumeInfo.skills[0]}的技能，能否舉個實際運用這項技能解決問題的例子？`
      );
    }

    // 根據專案經驗生成問題
    if (resumeInfo.projects && resumeInfo.projects.length > 0) {
      questions.push(
        `在您的專案經驗中，遇到最大的挑戰是什麼？您是如何克服的？`
      );
    }

    // 如果問題不足，添加通用問題
    const genericQuestions = [
      '您認為自己最大的優勢是什麼？',
      '未來三到五年，您對自己的職業發展有什麼規劃？',
      '請分享一個您在團隊合作中展現領導力或協作能力的例子。',
      '您如何保持自己的專業技能與時俱進？',
      '為什麼您對我們公司/這個職位感興趣？'
    ];

    while (questions.length < questionCount && genericQuestions.length > 0) {
      questions.push(genericQuestions.shift()!);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            questionCount: questions.length,
            questions: questions.slice(0, questionCount),
            basedOn: Object.keys(resumeInfo).filter(key => 
              resumeInfo[key] && Array.isArray(resumeInfo[key]) && resumeInfo[key].length > 0
            )
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `生成問題失敗: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    };
  }
}

