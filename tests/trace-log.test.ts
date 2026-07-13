import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getLatestMessagePreview,
  redactTraceLine,
  redactTraceLog,
  writeInferenceRequestLog,
} from '../src/trace-log.js';

describe('trace log redaction', () => {
  it('redacts bearer tokens', () => {
    expect(redactTraceLine('Authorization: Bearer sk-ant-api03-secret123')).toContain('[REDACTED]');
    expect(redactTraceLine('Authorization: Bearer sk-ant-api03-secret123')).not.toContain('secret123');
  });

  it('redacts sk- prefixed keys', () => {
    expect(redactTraceLine('key=sk-abc1234567890')).toBe('key=sk-[REDACTED]');
  });

  it('redacts full log content', () => {
    const log = redactTraceLog('line1\nBearer sk-test123456789012345678901234\nline3');
    expect(log).not.toContain('sk-test123456789012345678901234');
  });
});

describe('inference request log', () => {
  it('writes only structured routing metadata', () => {
    const dir = mkdtempSync(join(tmpdir(), 'relay-ai-inference-log-'));
    const path = join(dir, 'requests.jsonl');
    try {
      writeInferenceRequestLog(path, {
        modelId: 'relay:openai:gpt-test[1m]',
        effort: 'high',
        provider: 'openai',
        route: 'translated',
      });
      const entry = JSON.parse(readFileSync(path, 'utf8').trim());
      expect(entry).toMatchObject({
        modelId: 'relay:openai:gpt-test[1m]',
        effort: 'high',
        provider: 'openai',
        route: 'translated',
      });
      expect(entry.timestamp).toEqual(expect.any(String));
      expect(Object.keys(entry).sort()).toEqual(['effort', 'modelId', 'provider', 'route', 'timestamp']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('adds only the latest message text when request previews are enabled', () => {
    const dir = mkdtempSync(join(tmpdir(), 'relay-ai-inference-preview-'));
    const path = join(dir, 'requests.jsonl');
    const previous = process.env['RELAY_AI_LOG_REQUEST_PREVIEW'];
    const requestPreview = getLatestMessagePreview([
      { role: 'user', content: 'older prompt' },
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', data: 'private-image-data' } },
          { type: 'text', text: 'identify this request\nwithout logging media' },
          { type: 'tool_result', content: 'private tool result' },
        ],
      },
    ]);

    try {
      delete process.env['RELAY_AI_LOG_REQUEST_PREVIEW'];
      writeInferenceRequestLog(path, {
        modelId: 'claude-sonnet-4-6',
        provider: 'anthropic',
        route: 'passthrough',
        requestPreview,
      });
      process.env['RELAY_AI_LOG_REQUEST_PREVIEW'] = '1';
      writeInferenceRequestLog(path, {
        modelId: 'claude-sonnet-4-6',
        provider: 'anthropic',
        route: 'passthrough',
        requestPreview,
      });

      const raw = readFileSync(path, 'utf8');
      const entries = raw.trim().split('\n').map(line => JSON.parse(line));
      expect(entries[0]).not.toHaveProperty('requestPreview');
      expect(entries[1]).toMatchObject({
        requestPreview: 'user: identify this request without logging media',
      });
      expect(raw).not.toContain('older prompt');
      expect(raw).not.toContain('private-image-data');
      expect(raw).not.toContain('private tool result');
      expect(getLatestMessagePreview([
        { role: 'user', content: [{ type: 'tool_result', content: 'private tool result' }] },
      ])).toBe('user: [tool_result]');
    } finally {
      if (previous === undefined) delete process.env['RELAY_AI_LOG_REQUEST_PREVIEW'];
      else process.env['RELAY_AI_LOG_REQUEST_PREVIEW'] = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
