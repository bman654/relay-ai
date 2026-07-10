export interface CloudCodeChunkOptions {
  text?: string;
  thought?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  modelVersion: string;
  responseId: string;
  finishReason?: 'STOP' | 'MAX_TOKENS' | 'OTHER' | string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

/**
 * Some non-Gemini models stringify nested object/array values in tool-call
 * arguments instead of emitting real JSON — observed with Antigravity's generic
 * `call_mcp_tool` wrapper, whose `Arguments` field has no fixed schema (it has
 * to accept any MCP tool's parameters). Google's own Gemini reliably fills it
 * with a real object; third-party models often stringify it instead, which
 * Antigravity's MCP execution rejects. Un-stringify anything that's valid JSON
 * and parses to an object/array so Antigravity receives the shape it expects.
 */
export function normalizeFunctionCallArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object') {
          out[key] = parsed;
          continue;
        }
      } catch { /* not JSON — keep as string */ }
    }
    out[key] = value;
  }
  return out;
}

/**
 * Map SDK finish reasons to Cloud Code format.
 */
export function mapFinishReason(reason: string): string {
  if (reason === 'stop' || reason === 'tool-calls') return 'STOP';
  if (reason === 'length') return 'MAX_TOKENS';
  if (reason === 'content-filter') return 'SAFETY';
  return 'OTHER';
}

/**
 * Format a text delta, function call, stop reason, and usage stats
 * into the Cloud Code SSE shape.
 */
export function formatCloudCodeChunk(opts: CloudCodeChunkOptions): Record<string, any> {
  const parts: any[] = [];

  if (opts.thought !== undefined && opts.thought !== '') {
    parts.push({ text: opts.thought, thought: true });
  }
  if (opts.text !== undefined && opts.text !== '') {
    parts.push({ text: opts.text });
  }
  if (opts.functionCall) {
    parts.push({ functionCall: opts.functionCall });
  }
  if (parts.length === 0 && !opts.finishReason) {
    parts.push({ text: '' });
  }

  const candidate: Record<string, any> = {};

  if (parts.length > 0) {
    candidate.content = {
      role: 'model',
      parts,
    };
  }

  if (opts.finishReason) {
    candidate.finishReason = opts.finishReason;
  }

  const response: Record<string, any> = {
    candidates: [candidate],
    modelVersion: opts.modelVersion,
    responseId: opts.responseId,
  };

  if (opts.usage) {
    response.usageMetadata = {
      promptTokenCount: opts.usage.promptTokens,
      candidatesTokenCount: opts.usage.completionTokens,
      totalTokenCount: opts.usage.promptTokens + opts.usage.completionTokens,
    };
  }

  return {
    response,
    traceId: 'relay-trace',
    metadata: {},
  };
}
