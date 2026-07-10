import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildClaudeCodeAuthUrl,
  exchangeClaudeCodeToken,
  extractClaudeAuthCode,
  fetchClaudeCodeModels,
} from '../src/oauth/claude-code.js';

describe('oauth/claude-code', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('uses the registered Anthropic hosted callback by default', async () => {
    const { authUrl, redirectUri } = await buildClaudeCodeAuthUrl();
    const url = new URL(authUrl);

    expect(redirectUri).toBe('https://platform.claude.com/oauth/code/callback');
    expect(url.searchParams.get('redirect_uri')).toBe('https://platform.claude.com/oauth/code/callback');
  });

  it('uses the same hosted callback during token exchange', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'token' }),
    } as Response);

    await exchangeClaudeCodeToken(
      'auth-code',
      'verifier',
      'https://platform.claude.com/oauth/code/callback',
      'state',
    );

    const [, init] = vi.mocked(global.fetch).mock.calls[0]!;
    const body = JSON.parse(String(init?.body));
    expect(body.redirect_uri).toBe('https://platform.claude.com/oauth/code/callback');
  });

  it('extracts authorization codes from pasted callback URLs', () => {
    expect(extractClaudeAuthCode('https://platform.claude.com/oauth/code/callback?code=abc123&state=xyz'))
      .toBe('abc123');
    expect(extractClaudeAuthCode('?code=def456&state=xyz')).toBe('def456');
    expect(extractClaudeAuthCode('raw-code')).toBe('raw-code');
  });

  describe('fetchClaudeCodeModels', () => {
    it('fetches models from /v1/models with Bearer auth', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: 'claude-opus-4-8', display_name: 'Claude Opus 4.8', max_input_tokens: 1000000, max_tokens: 128000 },
            { id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6', max_input_tokens: 1000000, max_tokens: 128000 },
          ],
        }),
      } as Response);

      const models = await fetchClaudeCodeModels('test-token');

      expect(models).toHaveLength(2);
      expect(models[0]).toEqual({
        id: 'claude-opus-4-8',
        displayName: 'Claude Opus 4.8',
        maxInputTokens: 1000000,
        maxTokens: 128000,
      });

      const [url, init] = vi.mocked(global.fetch).mock.calls[0]!;
      expect(url).toBe('https://api.anthropic.com/v1/models');
      const headers = init?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-token');
      expect(headers).not.toHaveProperty('x-api-key');
    });

    it('throws on HTTP error', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      } as Response);

      await expect(fetchClaudeCodeModels('bad-token'))
        .rejects.toThrow('Claude Code model discovery failed (HTTP 401)');
    });

    it('throws when response contains no models', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

      await expect(fetchClaudeCodeModels('test-token'))
        .rejects.toThrow('Claude Code model discovery returned no models');
    });
  });
});
