import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

vi.mock('./client', () => ({
  copyLatestError: vi.fn(),
  exportDiagnostics: vi.fn(),
  logDiagnostic: vi.fn(async () => {}),
  openLogDirectory: vi.fn()
}));

describe('ErrorBoundary', () => {
  it('derives a sanitized fallback without rethrowing', () => {
    const error = new Error('token=private-value render failed');
    const boundary = new ErrorBoundary({ children: <span>content</span> });
    boundary.state = ErrorBoundary.getDerivedStateFromError(error);
    const fallback = boundary.render();
    expect(fallback).toBeTruthy();
    expect(JSON.stringify(fallback)).toContain('界面暂时无法显示');
    expect(JSON.stringify(fallback)).not.toContain('private-value');
    expect(JSON.stringify(fallback)).toContain('复制诊断摘要');
  });
});
