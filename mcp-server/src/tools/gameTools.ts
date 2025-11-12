import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { fetch } from 'undici';

const DEFAULT_BASE_URL = 'http://127.0.0.1:5001';
const BASE_URL = process.env.MSW_AUTOMATION_BASE_URL || DEFAULT_BASE_URL;

interface GridResponse {
  grid: string[][];
}

interface ActionResponse {
  ok: boolean;
  x?: number;
  y?: number;
  message?: string;
  opens?: Array<[number, number]>;
  flags?: Array<[number, number]>;
  steps?: number;
  ops?: Array<{ opens: Array<[number, number]>; flags: Array<[number, number]> }>;
}

function toResult(payload: unknown, isError = false): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
    isError,
  };
}

function handleError(error: unknown, action: string): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return toResult(
    {
      success: false,
      action,
      message,
      baseUrl: BASE_URL,
    },
    true,
  );
}

function resolveEndpoint(path: string): string {
  return `${BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export async function detectGrid(): Promise<CallToolResult> {
  try {
    const response = await fetch(resolveEndpoint('/detect_grid'), { method: 'POST' });
    if (!response.ok) {
      return handleError(new Error(`HTTP ${response.status}`), 'detect_grid');
    }
    const data = (await response.json()) as GridResponse;
    return toResult({
      success: true,
      action: 'detect_grid',
      grid: data.grid,
    });
  } catch (error) {
    return handleError(error, 'detect_grid');
  }
}

export async function clickCell(r: number, c: number): Promise<CallToolResult> {
  try {
    const response = await fetch(resolveEndpoint('/click_cell'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ r, c }),
    });
    const data = (await response.json()) as ActionResponse;
    return toResult({
      success: response.ok && data.ok,
      action: 'click_cell',
      r,
      c,
      response: data,
    }, !(response.ok && data.ok));
  } catch (error) {
    return handleError(error, 'click_cell');
  }
}

export async function flagCell(r: number, c: number): Promise<CallToolResult> {
  try {
    const response = await fetch(resolveEndpoint('/flag_cell'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ r, c }),
    });
    const data = (await response.json()) as ActionResponse;
    return toResult({
      success: response.ok && data.ok,
      action: 'flag_cell',
      r,
      c,
      response: data,
    }, !(response.ok && data.ok));
  } catch (error) {
    return handleError(error, 'flag_cell');
  }
}

export async function stepSolve(): Promise<CallToolResult> {
  try {
    const response = await fetch(resolveEndpoint('/step_solve'), { method: 'POST' });
    const data = (await response.json()) as ActionResponse;
    const ok = response.ok && data.ok !== false;
    return toResult(
      {
        success: ok,
        action: 'step_solve',
        response: data,
      },
      !ok,
    );
  } catch (error) {
    return handleError(error, 'step_solve');
  }
}

export async function autoplay(maxSteps?: number, sleepMs?: number): Promise<CallToolResult> {
  try {
    const payload: Record<string, number> = {};
    if (typeof maxSteps === 'number') {
      payload.max_steps = maxSteps;
    }
    if (typeof sleepMs === 'number') {
      payload.sleep_ms = sleepMs;
    }
    const response = await fetch(resolveEndpoint('/autoplay'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as ActionResponse;
    const ok = response.ok && data.ok !== false;
    return toResult(
      {
        success: ok,
        action: 'autoplay',
        params: payload,
        response: data,
      },
      !ok,
    );
  } catch (error) {
    return handleError(error, 'autoplay');
  }
}

export async function automationHealth(): Promise<CallToolResult> {
  try {
    const response = await fetch(resolveEndpoint('/health'));
    if (!response.ok) {
      return handleError(new Error(`HTTP ${response.status}`), 'automation_health');
    }
    const data = await response.json();
    return toResult({
      success: true,
      action: 'automation_health',
      baseUrl: BASE_URL,
      service: data,
    });
  } catch (error) {
    return handleError(error, 'automation_health');
  }
}

