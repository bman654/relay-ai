// Find, open, quit, and restart the ChatGPT desktop app / Codex mode (macOS + Windows).
import { execSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as p from '@clack/prompts';

const CODEX_BUNDLE_ID = 'com.openai.codex';
// OpenAI merged the Codex desktop app into the ChatGPT desktop app (2026-07-09).
// The bundle id is unchanged, but the app is now named "ChatGPT" on disk and
// as a running process. Check both names — some users may still be on the
// pre-merge "Codex" build until they update.
const DARWIN_APP_NAMES = ['ChatGPT', 'Codex'];
// Confirmed on macOS only (see DARWIN_APP_NAMES above); the Windows renamed
// exe/process name is not yet verified against a real install. Mirrors the
// confirmed macOS rename (Codex -> ChatGPT, same install-folder convention)
// as a best-effort guess until confirmed on a real Windows install.
const WIN_APP_NAMES = ['ChatGPT', 'Codex'];

export function codexAppSupported(): void {
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    throw new Error('Codex App launch is supported on macOS and Windows only.');
  }
}

function run(cmd: string, encoding: BufferEncoding = 'utf8'): string {
  return execSync(cmd, { encoding, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function runPowerShell(script: string): string {
  return run(`powershell.exe -NoProfile -Command ${JSON.stringify(script)}`);
}

function darwinAppCandidates(): string[] {
  return DARWIN_APP_NAMES.flatMap(name => [
    `/Applications/${name}.app`,
    join(homedir(), 'Applications', `${name}.app`),
  ]);
}

function winLocalAppData(): string {
  return process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
}

function winCodexExeCandidates(): string[] {
  const local = winLocalAppData();
  const bases = WIN_APP_NAMES.flatMap(name => [
    join(local, 'Programs', name),
    join(local, 'Programs', `OpenAI ${name}`),
    join(local, name),
    join(local, `OpenAI ${name}`),
    join(local, 'OpenAI', name),
  ]);
  bases.push(join(local, 'openai-codex-electron'), join(local, 'openai-chatgpt-electron'));
  const out: string[] = [];
  for (const base of bases) {
    for (const name of WIN_APP_NAMES) {
      out.push(join(base, `${name}.exe`));
    }
    try {
      if (existsSync(base)) {
        for (const dir of readdirSync(base)) {
          if (dir.startsWith('app-')) {
            for (const name of WIN_APP_NAMES) {
              out.push(join(base, dir, `${name}.exe`));
            }
          }
        }
      }
    } catch { /* ignore */ }
  }
  return out;
}

function mdfindCodexApp(): string | null {
  try {
    const out = run(`mdfind "kMDItemCFBundleIdentifier == '${CODEX_BUNDLE_ID}'"`);
    const first = out.split('\n').map(l => l.trim()).find(Boolean);
    return first && existsSync(first) ? first : null;
  } catch {
    return null;
  }
}

export function findCodexApp(): string | null {
  if (process.platform === 'darwin') {
    for (const path of darwinAppCandidates()) {
      if (existsSync(path)) return path;
    }
    return mdfindCodexApp();
  }
  if (process.platform === 'win32') {
    for (const path of winCodexExeCandidates()) {
      try {
        if (existsSync(path) && statSync(path).isFile()) return path;
      } catch { /* ignore */ }
    }
    try {
      const nameFilter = WIN_APP_NAMES
        .map(name => `$_.Name -eq '${name}' -or $_.Name -like '${name}*'`)
        .join(' -or ');
      const appId = runPowerShell(
        `(Get-StartApps | Where-Object { ${nameFilter} } | Select-Object -First 1 -ExpandProperty AppID)`,
      );
      if (appId) return `shell:AppsFolder\\${appId}`;
    } catch { /* ignore */ }
  }
  return null;
}

function darwinIsRunning(): boolean {
  return DARWIN_APP_NAMES.some(name => {
    try {
      const out = run(`osascript -e 'tell application "System Events" to exists process "${name}"'`);
      return out.toLowerCase() === 'true';
    } catch {
      return false;
    }
  });
}

function winMatchingPids(): number[] {
  try {
    const nameFilter = WIN_APP_NAMES.map(name => `Name = '${name}.exe'`).join(' OR ');
    // Exclude Electron subprocess helpers (renderer/gpu, tagged with --type=)
    // for each app's main process; 'codex.exe' (lowercase) is the embedded
    // CLI engine, kept as its own case since it isn't part of the rename.
    const mainProcessFilter = WIN_APP_NAMES
      .map(name => `(($_.Name -ieq '${name}.exe') -and (($null -eq $_.CommandLine) -or ($_.CommandLine -notlike '* --type=*')))`)
      .join(' -or ');
    const script = `$current = ${process.pid}; Get-CimInstance Win32_Process -Filter "${nameFilter} OR Name = 'codex.exe'" | Where-Object { $_.ProcessId -ne $current -and (${mainProcessFilter} -or (($_.Name -ieq 'codex.exe') -and ($_.CommandLine -like '*app-server*'))) } | Select-Object -ExpandProperty ProcessId`;
    const out = runPowerShell(script);
    return out.split(/\s+/).map(s => Number.parseInt(s, 10)).filter(n => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}

function winHasWindow(): boolean {
  try {
    const nameFilter = WIN_APP_NAMES.map(name => `'${name}'`).join(',');
    const out = runPowerShell(
      `(Get-Process ${nameFilter} -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1).Id`,
    );
    return out.length > 0 && Number.isFinite(Number.parseInt(out, 10));
  } catch {
    return false;
  }
}

export function isCodexAppRunning(): boolean {
  if (process.platform === 'darwin') return darwinIsRunning();
  if (process.platform === 'win32') return winMatchingPids().length > 0 || winHasWindow();
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForQuit(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // Check actual process existence, not window visibility — apps that
    // minimize to the tray on close clear their window handle immediately
    // while staying alive, which would make this return early with the
    // old process (and its old config) still running.
    if (process.platform === 'win32') {
      if (winMatchingPids().length === 0) return true;
    } else if (!darwinIsRunning()) {
      return true;
    }
    await sleep(200);
  }
  return process.platform === 'win32' ? winMatchingPids().length === 0 : !darwinIsRunning();
}

function openCodexAppAt(path: string): void {
  if (process.platform === 'darwin') {
    if (path.endsWith('.app')) {
      execSync(`open ${JSON.stringify(path)}`, { stdio: 'inherit' });
    } else {
      execSync(`open -b ${CODEX_BUNDLE_ID}`, { stdio: 'inherit' });
    }
    return;
  }
  if (process.platform === 'win32') {
    if (path.startsWith('shell:AppsFolder\\')) {
      // cmd /c start avoids PowerShell backslash double-escaping issues with shell: URIs
      spawn('cmd.exe', ['/c', 'start', '', path], { stdio: 'ignore', detached: true }).unref();
    } else {
      runPowerShell(`Start-Process -FilePath '${path.replace(/'/g, "''")}'`);
    }
  }
}

export function openCodexApp(): void {
  const path = findCodexApp();
  if (!path) {
    throw new Error(
      'ChatGPT Desktop app not found. Install from https://developers.openai.com/codex/app then run relay-ai codex-app again.',
    );
  }
  openCodexAppAt(path);
}

function darwinQuit(): void {
  try {
    execSync('osascript -e \'tell application "Codex" to quit\'', { stdio: 'pipe' });
  } catch {
    execSync(`osascript -e 'tell application id "${CODEX_BUNDLE_ID}" to quit'`, { stdio: 'pipe' });
  }
}

function winQuitGraceful(): void {
  const nameFilter = WIN_APP_NAMES.map(name => `'${name}'`).join(',');
  runPowerShell(
    `Get-Process ${nameFilter} -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { [void]$_.CloseMainWindow() }`,
  );
}

export function quitCodexAppGracefully(): void {
  if (process.platform === 'darwin') darwinQuit();
  else if (process.platform === 'win32') winQuitGraceful();
}

function winForceQuit(): void {
  const pids = winMatchingPids();
  if (pids.length === 0) return;
  runPowerShell(`Stop-Process -Id ${pids.join(',')} -Force -ErrorAction SilentlyContinue`);
}

export async function launchOrRestartCodexApp(
  prompt = 'Restart ChatGPT Desktop to apply relay-ai settings?',
): Promise<void> {
  const appPath = findCodexApp();
  if (!isCodexAppRunning()) {
    if (!appPath) {
      throw new Error(
        'ChatGPT Desktop app not found. Install from https://developers.openai.com/codex/app then run relay-ai codex-app again.',
      );
    }
    openCodexAppAt(appPath);
    return;
  }

  const restart = await p.confirm({ message: prompt, initialValue: true });
  if (p.isCancel(restart) || !restart) {
    p.log.info('Quit and reopen ChatGPT Desktop when you are ready for the new model to take effect.');
    return;
  }

  if (process.platform === 'darwin') darwinQuit();
  else winQuitGraceful();

  if (!(await waitForQuit(5000))) {
    if (process.platform === 'win32') winForceQuit();
    await waitForQuit(5000);
  }

  if (appPath) openCodexAppAt(appPath);
  else openCodexApp();
}

export function codexAppInstallHint(): string {
  return 'Install the ChatGPT desktop app (Codex mode) for macOS or Windows: https://developers.openai.com/codex/app';
}
