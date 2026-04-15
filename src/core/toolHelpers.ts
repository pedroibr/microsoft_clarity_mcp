import type { ToolResult } from '../types.js';

export function textToolResult(payload: unknown, isError = false): ToolResult {
  return {
    isError,
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}
