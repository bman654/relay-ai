import { execFileSync, execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { prepareIdeProfile } from './ide-profile.js';
import { getAppPathOverride } from '../config.js';

type ProcessListOptions = {
  processList?: () => string;
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function runPowerShell(script: string): string {
  return execSync(`powershell.exe -NoProfile -Command ${JSON.stringify(script)}`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function winIsProcessRunningForProfile(exeName: string, profileDir: string): boolean {
  try {
    const escapedDir = profileDir.replace(/'/g, "''");
    const out = runPowerShell(
      `Get-CimInstance Win32_Process -Filter "Name='${exeName}'" | Where-Object { $_.CommandLine -like '*--user-data-dir=${escapedDir}*' } | Select-Object -ExpandProperty ProcessId`,
    );
    return out.length > 0;
  } catch {
    return false;
  }
}

function winQuitProcess(exeName: string): void {
  try {
    runPowerShell(
      `Get-Process -Name '${exeName.replace(/\.exe$/i, '')}' -ErrorAction SilentlyContinue | ForEach-Object { [void]$_.CloseMainWindow() }`,
    );
  } catch { /* ignore */ }
}

/**
 * Force-kill any still-running instance for this profile. Needed because
 * CloseMainWindow() only asks nicely — apps that minimize to the tray
 * instead of exiting on window-close will otherwise keep running with
 * the old config loaded, so a "restart" silently does nothing.
 */
function winForceQuitProcess(exeName: string, profileDir: string): void {
  try {
    const escapedDir = profileDir.replace(/'/g, "''");
    runPowerShell(
      `Get-CimInstance Win32_Process -Filter "Name='${exeName}'" | Where-Object { $_.CommandLine -like '*--user-data-dir=${escapedDir}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
    );
  } catch { /* ignore */ }
}

function defaultProcessList(): string {
  if (process.platform !== 'darwin') return '';
  try {
    return execFileSync('ps', ['-axo', 'pid=,command='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 1024 * 1024 * 4,
    });
  } catch {
    return '';
  }
}

export function isAntigravityIdeRunning(profileDir: string, processList = defaultProcessList): boolean {
  if (process.platform === 'win32') return winIsProcessRunningForProfile('Antigravity IDE.exe', profileDir);
  const output = processList();
  return output
    .split('\n')
    .some(line => line.includes('Antigravity IDE.app') && line.includes(`--user-data-dir=${profileDir}`));
}

export function isAntigravityAppRunning(profileDir: string, processList = defaultProcessList): boolean {
  if (process.platform === 'win32') return winIsProcessRunningForProfile('Antigravity.exe', profileDir);
  const output = processList();
  return output
    .split('\n')
    .some(line => line.includes('Antigravity.app') && line.includes(`--user-data-dir=${profileDir}`));
}

export async function waitForAntigravityIdeQuit(
  profileDir: string,
  options: ProcessListOptions & { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<boolean> {
  const processList = options.processList ?? defaultProcessList;
  const deadline = Date.now() + (options.timeoutMs ?? 5_000);
  const pollIntervalMs = options.pollIntervalMs ?? 200;
  while (Date.now() < deadline) {
    if (!isAntigravityIdeRunning(profileDir, processList)) return true;
    await sleep(pollIntervalMs);
  }
  return !isAntigravityIdeRunning(profileDir, processList);
}

export async function waitForAntigravityAppQuit(
  profileDir: string,
  options: ProcessListOptions & { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<boolean> {
  const processList = options.processList ?? defaultProcessList;
  const deadline = Date.now() + (options.timeoutMs ?? 5_000);
  const pollIntervalMs = options.pollIntervalMs ?? 200;
  while (Date.now() < deadline) {
    if (!isAntigravityAppRunning(profileDir, processList)) return true;
    await sleep(pollIntervalMs);
  }
  return !isAntigravityAppRunning(profileDir, processList);
}

/** Windows-only: force-kill a still-running managed Antigravity IDE process. No-op elsewhere. */
export function forceQuitAntigravityIde(profileDir: string): void {
  if (process.platform === 'win32') winForceQuitProcess('Antigravity IDE.exe', profileDir);
}

/** Windows-only: force-kill a still-running managed standalone Antigravity process. No-op elsewhere. */
export function forceQuitAntigravityApp(profileDir: string): void {
  if (process.platform === 'win32') winForceQuitProcess('Antigravity.exe', profileDir);
}

export function quitAntigravityIdeGracefully(): void {
  if (process.platform === 'win32') { winQuitProcess('Antigravity IDE.exe'); return; }
  if (process.platform !== 'darwin') return;
  try {
    execFileSync('osascript', ['-e', 'tell application "Antigravity IDE" to quit'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    execFileSync('osascript', ['-e', 'tell application id "com.google.antigravity-ide" to quit'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
}

export function quitAntigravityAppGracefully(): void {
  if (process.platform === 'win32') { winQuitProcess('Antigravity.exe'); return; }
  if (process.platform !== 'darwin') return;
  try {
    execFileSync('osascript', ['-e', 'tell application "Antigravity" to quit'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    execFileSync('osascript', ['-e', 'tell application id "com.google.antigravity" to quit'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
}

/**
 * Locate the standalone Antigravity app binary path (macOS + Windows).
 * Returns null if not installed or the platform is unsupported.
 */
export function findAntigravityAppBinary(): string | null {
  const override = getAppPathOverride('antigravity');
  if (override) return existsSync(override) ? override : null;

  if (process.platform === 'win32') {
    const localAppData = process.env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local');
    const winPath = join(localAppData, 'Programs', 'Antigravity', 'Antigravity.exe');
    return existsSync(winPath) ? winPath : null;
  }

  if (process.platform !== 'darwin') return null;

  const defaultPath = '/Applications/Antigravity.app/Contents/MacOS/Antigravity';
  if (existsSync(defaultPath)) return defaultPath;

  const homePath = join(homedir(), 'Applications', 'Antigravity.app', 'Contents', 'MacOS', 'Antigravity');
  if (existsSync(homePath)) return homePath;

  return null;
}

/**
 * Locate the Antigravity IDE binary path.
 *
 * Currently support macOS (/Applications/Antigravity IDE.app) with fallbacks.
 * Returns null if not on macOS or if the app is not installed.
 */
export function findAntigravityIdeBinary(): string | null {
  const override = getAppPathOverride('antigravity-ide');
  if (override) return existsSync(override) ? override : null;

  if (process.platform === 'win32') {
    const localAppData = process.env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local');
    const winPath = join(localAppData, 'Programs', 'Antigravity IDE', 'Antigravity IDE.exe');
    return existsSync(winPath) ? winPath : null;
  }

  if (process.platform !== 'darwin') return null;

  const defaultPath = '/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide';
  if (existsSync(defaultPath)) return defaultPath;

  const homePath = join(homedir(), 'Applications', 'Antigravity IDE.app', 'Contents', 'Resources', 'app', 'bin', 'antigravity-ide');
  if (existsSync(homePath)) return homePath;

  return null;
}

export function launchAntigravityApp(
  env: NodeJS.ProcessEnv,
  profileDir: string,
  gatewayUrl: string,
  extraArgs: string[],
): Promise<number> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (code: number): void => {
      if (settled) return;
      settled = true;
      resolve(code);
    };
    const binaryPath = findAntigravityAppBinary();
    if (!binaryPath) {
      console.error('Antigravity app bundle not found at "/Applications/Antigravity.app".');
      console.error('Please make sure Antigravity is installed on your Mac.');
      settle(127);
      return;
    }

    prepareIdeProfile(profileDir, gatewayUrl);

    const args = [
      `--user-data-dir=${profileDir}`,
      ...extraArgs,
    ];

    const child = spawn(binaryPath, args, {
      stdio: 'inherit',
      env,
    });

    child.on('spawn', () => {
      settle(0);
    });

    child.on('exit', (code) => {
      settle(code ?? 1);
    });

    child.on('error', (err) => {
      console.error(`Failed to launch Antigravity: ${err.message}`);
      settle(1);
    });
  });
}

/**
 * Launch the Antigravity IDE under an isolated Relay-managed profile.
 *
 * It prepares the isolated user data directory, configures the local Cloud Code gateway URL
 * both in env and profile settings, and spawns the IDE with correct args.
 *
 * @param env Child process environment variables
 * @param profileDir Absolute path to the isolated profile directory
 * @param gatewayUrl Local gateway URL
 * @param extraArgs Passthrough args from the user
 */
export function launchAntigravityIde(
  env: NodeJS.ProcessEnv,
  profileDir: string,
  gatewayUrl: string,
  extraArgs: string[],
): Promise<number> {
  return new Promise((resolve) => {
    const binaryPath = findAntigravityIdeBinary();
    if (!binaryPath) {
      console.error('Antigravity IDE app bundle not found at "/Applications/Antigravity IDE.app".');
      console.error('Please make sure Antigravity IDE is installed on your Mac.');
      resolve(127);
      return;
    }

    // 1. Prepare the isolated profile and set jetski.cloudCodeUrl
    prepareIdeProfile(profileDir, gatewayUrl);

    // 2. Build VS Code arguments
    // Keep Relay's Antigravity profile fully isolated from the normal IDE profile.
    const relayExtensionsDir = join(homedir(), '.relay-ai', 'antigravity', 'extensions');
    const args = [
      `--user-data-dir=${profileDir}`,
      `--extensions-dir=${relayExtensionsDir}`,
      ...extraArgs,
    ];

    const child = spawn(binaryPath, args, {
      stdio: 'inherit',
      env,
    });

    child.on('exit', (code) => {
      resolve(code ?? 1);
    });

    child.on('error', (err) => {
      console.error(`Failed to launch Antigravity IDE: ${err.message}`);
      resolve(1);
    });
  });
}
