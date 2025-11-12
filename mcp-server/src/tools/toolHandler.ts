import { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { readPDF } from './pdfTools.js';
import { listFiles, saveContext, getContext } from './fileTools.js';
import { extractResumeInfo, generateQuestions } from './resumeTools.js';
import {
  automationHealth,
  autoplay,
  clickCell,
  detectGrid,
  flagCell,
  stepSolve,
} from './gameTools.js';

export async function handleToolCall(request: CallToolRequest): Promise<CallToolResult> {
  const { name, arguments: args } = request.params;

  try {
    if (!args) {
      return {
        content: [
          {
            type: 'text',
            text: `Missing arguments for tool: ${name}`
          }
        ],
        isError: true
      };
    }

    switch (name) {
      case 'read_pdf':
        return await readPDF(args.filePath as string);

      case 'list_files':
        return await listFiles(
          args.directory as string | undefined,
          args.fileType as string | undefined
        );

      case 'save_interview_context':
        return await saveContext(
          args.candidateId as string,
          args.context as Record<string, any>
        );

      case 'get_interview_context':
        return await getContext(args.candidateId as string);

      case 'extract_resume_info':
        return await extractResumeInfo(args.filePath as string);

      case 'generate_interview_questions':
        return await generateQuestions(
          args.resumeInfo as Record<string, any>,
          args.questionCount as number | undefined
        );

      case 'automation_health':
        return await automationHealth();

      case 'detect_grid':
        return await detectGrid();

      case 'click_cell':
        return await clickCell(args.r as number, args.c as number);

      case 'flag_cell':
        return await flagCell(args.r as number, args.c as number);

      case 'step_solve':
        return await stepSolve();

      case 'autoplay':
        return await autoplay(
          args.max_steps as number | undefined,
          args.sleep_ms as number | undefined
        );

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`
            }
          ],
          isError: true
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    };
  }
}

