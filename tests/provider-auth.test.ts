import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../src/opencode-serve.js', () => ({
  findOpencodeBinary: vi.fn(() => '/usr/local/bin/opencode'),
  fetchRawOpencodeProviders: vi.fn(async () => [{
    id: 'gitlab',
    name: 'GitLab',
    models: {
      claude: {
        id: 'claude-sonnet-4-6',
        name: 'Claude Sonnet 4.6',
        api: { npm: 'gitlab-ai-provider', url: 'https://gitlab.example.com/v1' },
      },
    },
  }]),
}));
vi.mock('../src/registry/auth-broker.js', () => ({
  runOpencodeAuthBroker: vi.fn(async () => ({
    type: 'oauth',
    access: 'access-token',
    refresh: 'refresh-token',
    expires: Date.now() + 3600_000,
  })),
}));
vi.mock('../src/ui.js', () => ({
  printOAuthStepsPanel: vi.fn(),
  confirmSubscriptionOAuthRisk: vi.fn(async () => true),
}));
vi.mock('../src/oauth/antigravity-oauth.js', () => ({
  runAntigravityOAuthFlow: vi.fn(async () => ({
    tokens: { access_token: 'antigravity-access', refresh_token: 'antigravity-refresh' },
    userInfo: { email: 'jacob@example.com' },
  })),
}));
vi.mock('../src/oauth/claude-code.js', () => ({
  runClaudeCodeOAuthFlow: vi.fn(async () => ({
    tokens: { access_token: 'claude-access', refresh_token: 'claude-refresh' },
    bootstrap: { accountId: 'acct-123' },
  })),
  generateCliUserID: vi.fn(() => 'cli-user-id'),
}));
vi.mock('../src/env.js', () => ({
  saveProviderCredential: vi.fn(async () => false),
}));
vi.mock('../src/registry/io.js', () => ({
  loadRegistry: vi.fn(() => ({ version: 1, providers: [] })),
  saveRegistry: vi.fn(),
}));
vi.mock('../src/registry/refresh-models.js', () => ({
  refreshProviderModels: vi.fn(),
}));
vi.mock('@clack/prompts', () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), success: vi.fn() },
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  select: vi.fn(),
  isCancel: vi.fn(() => false),
}));

import { saveProviderCredential } from '../src/env.js';
import { saveRegistry } from '../src/registry/io.js';
import { authenticateProvider } from '../src/registry/provider-auth.js';
import { runOpencodeAuthBroker } from '../src/registry/auth-broker.js';
import { runAntigravityOAuthFlow } from '../src/oauth/antigravity-oauth.js';
import { runClaudeCodeOAuthFlow } from '../src/oauth/claude-code.js';
import * as prompts from '@clack/prompts';

describe('authenticateProvider', () => {
  beforeEach(() => {
    vi.mocked(saveProviderCredential).mockClear();
    vi.mocked(saveRegistry).mockClear();
    vi.mocked(runOpencodeAuthBroker).mockClear();
    vi.mocked(runAntigravityOAuthFlow).mockClear();
    vi.mocked(runClaudeCodeOAuthFlow).mockClear();
    vi.mocked(prompts.select).mockClear();
  });

  it('warns and continues when token persistence fails (graceful degradation)', async () => {
    const result = await authenticateProvider('gitlab');
    expect(saveProviderCredential).toHaveBeenCalled();
    expect(saveRegistry).toHaveBeenCalled();
    expect(result.providerId).toBe('gitlab');
  });

  it('launches Antigravity OAuth directly without the OpenCode submenu', async () => {
    const result = await authenticateProvider('antigravity');

    expect(prompts.select).not.toHaveBeenCalled();
    expect(runOpencodeAuthBroker).not.toHaveBeenCalled();
    expect(runAntigravityOAuthFlow).toHaveBeenCalled();
    expect(result.providerId).toBe('antigravity');
  });

  it('launches Claude Code OAuth directly without the OpenCode submenu', async () => {
    const result = await authenticateProvider('claude-code');

    expect(prompts.select).not.toHaveBeenCalled();
    expect(runOpencodeAuthBroker).not.toHaveBeenCalled();
    expect(runClaudeCodeOAuthFlow).toHaveBeenCalled();
    expect(result.providerId).toBe('claude-code');
  });
});
