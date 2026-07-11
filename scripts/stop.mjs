import { spawnSync } from 'node:child_process';
import { clearServerRecord, isProcessRunning, readServerRecord } from './server-runtime.mjs';

function stopProcessTree(pid) {
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return result.status === 0;
  }
  try {
    process.kill(-pid, 'SIGTERM');
    return true;
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
      return true;
    } catch {
      return false;
    }
  }
}

const record = readServerRecord();
if (!record || !isProcessRunning(record.pid)) {
  clearServerRecord();
  console.log('当前没有运行中的品宣物料工作台。');
} else if (stopProcessTree(record.pid)) {
  clearServerRecord();
  console.log('品宣物料工作台已停止。');
} else {
  console.error('无法停止服务器，请检查当前用户权限。');
  process.exitCode = 1;
}
