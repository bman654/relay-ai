import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/proxy.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/proxy.js')>();
  return {
    ...actual,
    startProxyCatalog: vi.fn().mockResolvedValue({
      port: 49100,
      token: 'backend-token',
      close: vi.fn(),
    }),
  };
});

vi.mock('../src/env.js', () => ({
  resolveProviderCredential: vi.fn().mockResolvedValue('fresh-token'),
}));

vi.mock('../src/registry/import-build.js', () => ({
  oauthAuthRef: vi.fn((id: string) => `keyring:oauth:provider:${id}`),
}));

import { rewriteGeminiBackendRoutes } from '../src/gemini/backend-routes.js';
import { startProxyCatalog, type ProxyRoute } from '../src/proxy.js';

const regularRoute: ProxyRoute = {
  aliasId: 'gpt-5.5',
  realModelId: 'gpt-5.5',
  displayName: 'GPT 5.5',
  upstreamUrl: '',
  apiKey: 'openai-token',
  modelFormat: 'openai',
  contextWindow: 200000,
  npm: '@ai-sdk/openai',
  providerId: 'openai',
  authType: 'api',
};

const cloudCodeRoute: ProxyRoute = {
  aliasId: 'gemini-3.5-flash-low',
  realModelId: 'gemini-3.5-flash-low',
  displayName: 'Gemini 3.5 Flash Low',
  upstreamUrl: 'https://cloudcode.googleapis.com',
  apiKey: 'agy-token',
  modelFormat: 'cloud-code',
  contextWindow: 1000000,
  providerId: 'antigravity',
  authType: 'oauth',
  oauthAccountId: 'agy-account',
  providerData: { projectId: 'project-1' },
};

const oauthAnthropicRoute: ProxyRoute = {
  aliasId: 'claude-sonnet-4-6',
  realModelId: 'claude-sonnet-4-6',
  displayName: 'Claude Sonnet 4.6',
  upstreamUrl: 'https://api.anthropic.com',
  apiKey: 'claude-token',
  modelFormat: 'anthropic',
  contextWindow: 200000,
  providerId: 'claude-code',
  authType: 'oauth',
  oauthAccountId: 'claude-account',
  providerData: { cliUserID: 'device-1' },
};

describe('rewriteGeminiBackendRoutes', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns unchanged routes when no backend is needed', async () => {
    const result = await rewriteGeminiBackendRoutes([regularRoute], regularRoute.aliasId, false);

    expect(result).toEqual({
      routes: [regularRoute],
      launchModelId: regularRoute.aliasId,
      backend: null,
    });
    expect(startProxyCatalog).not.toHaveBeenCalled();
  });

  it('rewrites selected cloud-code routes through the shared backend', async () => {
    const result = await rewriteGeminiBackendRoutes(
      [regularRoute, cloudCodeRoute],
      cloudCodeRoute.aliasId,
      false,
    );

    expect(startProxyCatalog).toHaveBeenCalledOnce();
    const [backendRoutes, startingAlias, trace] = (startProxyCatalog as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(backendRoutes).toHaveLength(1);
    expect(backendRoutes[0]).toMatchObject({
      providerId: 'antigravity',
      modelFormat: 'cloud-code',
      realModelId: cloudCodeRoute.realModelId,
      providerData: cloudCodeRoute.providerData,
    });
    expect(startingAlias).toBe(backendRoutes[0].aliasId);
    expect(trace).toBe(false);

    expect(result.launchModelId).toBe(backendRoutes[0].aliasId);
    expect(result.backend).toMatchObject({ port: 49100, token: 'backend-token' });
    expect(result.routes[0]).toBe(regularRoute);
    expect(result.routes[1]).toMatchObject({
      ...cloudCodeRoute,
      aliasId: backendRoutes[0].aliasId,
      realModelId: backendRoutes[0].aliasId,
      upstreamUrl: 'http://127.0.0.1:49100',
      apiKey: 'backend-token',
      modelFormat: 'anthropic',
      npm: '@ai-sdk/anthropic',
      baseURL: 'http://127.0.0.1:49100',
      authType: undefined,
    });
  });

  it('rewrites OAuth Anthropic routes and leaves an unselected launch id unchanged', async () => {
    const result = await rewriteGeminiBackendRoutes(
      [oauthAnthropicRoute, regularRoute],
      regularRoute.aliasId,
      true,
    );

    expect(startProxyCatalog).toHaveBeenCalledOnce();
    const [backendRoutes, startingAlias, trace] = (startProxyCatalog as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(backendRoutes).toHaveLength(1);
    expect(backendRoutes[0]).toMatchObject({
      providerId: 'claude-code',
      modelFormat: 'anthropic',
      realModelId: oauthAnthropicRoute.realModelId,
      upstreamUrl: oauthAnthropicRoute.upstreamUrl,
      providerData: oauthAnthropicRoute.providerData,
    });
    expect(startingAlias).toBe(backendRoutes[0].aliasId);
    expect(trace).toBe(true);

    expect(result.launchModelId).toBe(regularRoute.aliasId);
    expect(result.routes[0]).toMatchObject({
      ...oauthAnthropicRoute,
      aliasId: backendRoutes[0].aliasId,
      realModelId: backendRoutes[0].aliasId,
      upstreamUrl: 'http://127.0.0.1:49100',
      apiKey: 'backend-token',
      modelFormat: 'anthropic',
      npm: '@ai-sdk/anthropic',
      baseURL: 'http://127.0.0.1:49100',
      authType: undefined,
    });
    expect(result.routes[1]).toBe(regularRoute);
  });
});
