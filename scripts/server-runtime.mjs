import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const HOST = '127.0.0.1';
export const PORT = 5173;
export const SERVER_URL = `http://${HOST}:${PORT}/`;
export const RUNTIME_DIR = path.join(os.homedir(), '.brand-material-workbench');
export const PID_FILE = path.join(RUNTIME_DIR, 'server.json');
export const LOG_FILE = path.join(RUNTIME_DIR, 'server.log');

export function ensureRuntimeDir() {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
}

export function readServerRecord() {
  try {
    return JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));
  } catch {
    return undefined;
  }
}

export function isProcessRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function clearServerRecord() {
  fs.rmSync(PID_FILE, { force: true });
}
