import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleUiApiRequest } from '../src/ui/api.js';
import { createMockRequest, createMockResponse } from './helpers/ui-api-test-utils.js';

// Mock child_process exec
const mockExec = vi.fn();
vi.mock('node:child_process', () => ({
  exec: (cmd: string, cb: any) => mockExec(cmd, cb),
}));

// Mock native-launcher to isolate endpoint testing
vi.mock('../src/native-launcher.js', () => ({
  getSupportedApps: () => [
    {
      id: 'claude',
      name: 'Claude Code CLI',
      type: 'cli',
      installed: true,
      path: '/bin/claude',
      relayCommand: 'claude',
      launchCommand: 'mock-launch',
    }
  ],
  detectApp: (id: string) => {
    if (id === 'claude') return { installed: true, path: '/bin/claude' };
    return { installed: false, path: null };
  },
  getSupportedApp: (id: string) => {
    if (id === 'claude') {
      return { id: 'claude', name: 'Claude Code CLI', type: 'cli', detectId: 'claude', relayCommand: 'claude' };
    }
    return undefined;
  },
  getRelayLaunchCommand: (appId: string, options: { providerId?: string; modelId?: string; cwd?: string; trace?: boolean }) => {
    const args = [appId];
    if (options.trace) args.push('--trace');
    if (options.providerId && options.modelId) {
      args.push('--provider', options.providerId, '--model', options.modelId);
    }
    if (options.cwd) args.push('--cwd', options.cwd);
    return `relay-ai ${args.join(' ')}`;
  }
}));

describe('UI API Apps endpoints', () => {
  let tempHome: string;
  let previousRelayHome: string | undefined;

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'relay-ai-ui-api-test-'));
    previousRelayHome = process.env['RELAY_AI_HOME'];
    process.env['RELAY_AI_HOME'] = join(tempHome, 'relay-home');
  });

  afterEach(() => {
    rmSync(tempHome, { recursive: true, force: true });
    if (previousRelayHome === undefined) delete process.env['RELAY_AI_HOME'];
    else process.env['RELAY_AI_HOME'] = previousRelayHome;
  });

  it('handles GET /api/apps', async () => {
    const req = createMockRequest('GET', '/api/apps');
    const mockRes = createMockResponse();

    handleUiApiRequest(req, mockRes.res);

    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 50));

    console.log('GET /api/apps status code:', mockRes.result.code);
    console.log('GET /api/apps raw response:', mockRes.result.data);

    const response = JSON.parse(mockRes.result.data);
    expect(response.apps).toHaveLength(1);
    expect(response.apps[0].id).toBe('claude');
  });

  it('handles POST /api/apps/launch with a model', async () => {
    const req = createMockRequest('POST', '/api/apps/launch', JSON.stringify({
      appId: 'claude',
      providerId: 'google',
      modelId: 'gemini-2.5-pro',
      cwd: process.cwd(),
    }));
    const mockRes = createMockResponse();

    handleUiApiRequest(req, mockRes.res);

    await new Promise(resolve => setTimeout(resolve, 50));

    console.log('POST /api/apps/launch status code:', mockRes.result.code);
    console.log('POST /api/apps/launch raw response:', mockRes.result.data);

    expect(mockRes.result.code).toBe(200);
    const response = JSON.parse(mockRes.result.data);
    expect(response.ok).toBe(true);
    expect(response.command).toContain('relay-ai claude');
    expect(response.command).toContain('--provider google');
    expect(response.command).toContain('--model gemini-2.5-pro');
    expect(response.command).toContain(`--cwd ${process.cwd()}`);
    expect(mockExec).toHaveBeenCalled();
  });

  it('passes trace through to launched tools when UI tracing is enabled', async () => {
    const req = createMockRequest('POST', '/api/apps/launch', JSON.stringify({
      appId: 'claude',
      providerId: 'google',
      modelId: 'gemini-2.5-pro',
    }));
    const mockRes = createMockResponse();

    handleUiApiRequest(req, mockRes.res, { trace: true });

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(mockRes.result.code).toBe(200);
    const response = JSON.parse(mockRes.result.data);
    expect(response.command).toContain('relay-ai claude --trace');
  });
});
