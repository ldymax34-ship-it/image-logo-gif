import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  HOST,
  LOG_FILE,
  PID_FILE,
  PORT,
  SERVER_URL,
  clearServerRecord,
  ensureRuntimeDir,
  isProcessRunning,
  readServerRecord
} from './server-runtime.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteEntry = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');

function installDependencies() {
  if (fs.existsSync(viteEntry)) return;
  console.log('首次启动，正在安装本地依赖...');
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, ['ci', '--no-audit', '--no-fund'], {
    cwd: projectRoot,
    stdio: 'inherit'
  });
  if (result.status !== 0 || !fs.existsSync(viteEntry)) {
    throw new Error('依赖安装失败，请确认 Node.js 和 npm 可用');
  }
}

async function waitForServer(child) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    if (child.exitCode != null || !isProcessRunning(child.pid)) return false;
    try {
      const response = await fetch(SERVER_URL, { signal: AbortSignal.timeout(800) });
      if (response.ok) return true;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

function openBrowser() {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', SERVER_URL] : [SERVER_URL];
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
}

async function main() {
  ensureRuntimeDir();
  const existing = readServerRecord();
  if (existing && isProcessRunning(existing.pid)) {
    console.log(`工作台已在运行：${SERVER_URL}`);
    openBrowser();
    return;
  }
  clearServerRecord();
  installDependencies();

  const logFd = fs.openSync(LOG_FILE, 'a');
  const child = spawn(process.execPath, [viteEntry, '--host', HOST, '--port', String(PORT), '--strictPort'], {
    cwd: projectRoot,
    detached: true,
    stdio: ['ignore', logFd, logFd]
  });
  child.unref();
  fs.closeSync(logFd);
  fs.writeFileSync(PID_FILE, JSON.stringify({ pid: child.pid, projectRoot, port: PORT, startedAt: new Date().toISOString() }, null, 2));

  if (!(await waitForServer(child))) {
    clearServerRecord();
    throw new Error(`服务器启动失败，请检查日志：${LOG_FILE}`);
  }
  console.log(`工作台已启动：${SERVER_URL}`);
  console.log('双击“关闭工作台.command”或运行 npm stop 可停止服务。');
  openBrowser();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
