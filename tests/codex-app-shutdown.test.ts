import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  isCancel: vi.fn(() => false),
  isCodexAppRunning: vi.fn(),
  quitCodexAppGracefully: vi.fn(),
}));

vi.mock('@clack/prompts', () => ({
  confirm: mocks.confirm,
  isCancel: mocks.isCancel,
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), step: vi.fn(), success: vi.fn() },
  select: vi.fn(),
  cancel: vi.fn(),
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

vi.mock('../src/codex/app-launch.js', () => ({
  codexAppInstallHint: vi.fn(() => 'Install Codex App'),
  codexAppSupported: vi.fn(() => true),
  launchOrRestartCodexApp: vi.fn(),
  isCodexAppRunning: mocks.isCodexAppRunning,
  quitCodexAppGracefully: mocks.quitCodexAppGracefully,
}));

import { maybeCloseRunningCodexApp } from '../src/codex-app.js';

describe('maybeCloseRunningCodexApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.confirm.mockResolvedValue(true);
    mocks.isCancel.mockReturnValue(false);
    mocks.isCodexAppRunning.mockReturnValue(true);
  });

  it('uses the compact close prompt and quits ChatGPT Desktop when confirmed', async () => {
    await maybeCloseRunningCodexApp();

    expect(mocks.confirm).toHaveBeenCalledWith({
      message: 'ChatGPT Desktop is still running. Close it?',
    });
    expect(mocks.quitCodexAppGracefully).toHaveBeenCalledOnce();
  });

  it('leaves ChatGPT Desktop running when the close prompt is declined', async () => {
    mocks.confirm.mockResolvedValue(false);

    await maybeCloseRunningCodexApp();

    expect(mocks.quitCodexAppGracefully).not.toHaveBeenCalled();
  });
});
