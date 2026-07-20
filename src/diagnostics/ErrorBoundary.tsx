import { Component, type ErrorInfo, type ReactNode } from 'react';
import { copyLatestError, exportDiagnostics, logDiagnostic, openLogDirectory } from './client';
import { sanitizeForDiagnostics } from './sanitize';

type Props = { children: ReactNode };
type State = { error?: Error };

export class ErrorBoundary extends Component<Props, State> {
  state: State = {};
  private logging = false;

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (this.logging) return;
    this.logging = true;
    void logDiagnostic('error', 'UI_RENDER_FAILED', error, info.componentStack ?? 'react-boundary')
      .finally(() => { this.logging = false; });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const summary = sanitizeForDiagnostics(this.state.error);
    return (
      <main className="diagnostics-fallback" role="alert">
        <h1>界面暂时无法显示</h1>
        <p>{summary}</p>
        <div className="dialog-actions">
          <button type="button" onClick={() => window.location.reload()}>重新加载界面</button>
          <button type="button" onClick={() => void copyLatestError()}>复制诊断摘要</button>
          <button type="button" onClick={() => void openLogDirectory()}>打开日志目录</button>
          <button type="button" onClick={() => void exportDiagnostics()}>导出诊断包</button>
        </div>
      </main>
    );
  }
}
