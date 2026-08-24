import { useEffect } from 'react';
import type { AppPreferencesV1, StartupTool } from './appPreferences';
import { isDesktopBridgeAvailable } from '../platform/desktopBridge';
import { Select } from '../components/ui';

const STARTUP_OPTIONS: Array<{ value: StartupTool; label: string }> = [
  { value: 'toolbox', label: '工具箱首页' },
  { value: 'logo-layout', label: 'Logo 与版式' },
  { value: 'gif-media', label: 'GIF / 媒体工具' },
  { value: 'watermark', label: '水印工具' },
  { value: 'video-watermark', label: '视频水印' },
  { value: 'last', label: '上次使用的工具' }
];

export function ApplicationSettingsDialog({ preferences, onPreferencesChange, onClose, isDesktop, onRecheckEnvironment }: {
  preferences: AppPreferencesV1;
  onPreferencesChange: (preferences: AppPreferencesV1) => void;
  onClose: () => void;
  isDesktop?: boolean;
  onRecheckEnvironment?: () => void;
}) {
  const desktop = isDesktop ?? isDesktopBridgeAvailable();
  const startupOptions = desktop
    ? STARTUP_OPTIONS
    : STARTUP_OPTIONS.filter((option) => option.value !== 'gif-media');
  // 浏览器里若本地偏好残留了桌面专用的 gif-media，不能让 select 指向一个不存在的 option。
  const selectValue = !desktop && preferences.startupTool === 'gif-media' ? 'toolbox' : preferences.startupTool;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="dialog-backdrop confirm-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="application-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="application-settings-title">
        <div className="dialog-header">
          <div>
            <span className="eyebrow">应用级偏好</span>
            <h2 id="application-settings-title">设置</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭应用设置" title="关闭">×</button>
        </div>
        <div className="application-settings-dialog-body">
          <label className="settings-field">
            <span>启动时打开</span>
            <Select
              value={selectValue}
              options={startupOptions}
              onChange={(value) => onPreferencesChange({ ...preferences, startupTool: value as StartupTool })}
              aria-label="启动时打开"
            />
          </label>
          <p>启动偏好会保存在本机，只记录工具入口，不恢复未保存的工作内容。</p>
          {desktop && (
            <p className="inline-note">GIF / 媒体工具会在启动后打开独立窗口，且不会恢复未保存任务；水印工具会直接打开水印工作台。</p>
          )}
          {desktop && onRecheckEnvironment ? (
            <div className="settings-recheck">
              <div>
                <span>环境检测</span>
                <p>重新检测内置转换引擎与视频编码能力。</p>
              </div>
              <button type="button" className="secondary-button" onClick={onRecheckEnvironment}>重新检测</button>
            </div>
          ) : null}
        </div>
        <div className="dialog-footer">
          <span />
          <div className="dialog-actions"><button type="button" className="primary-button" onClick={onClose}>完成</button></div>
        </div>
      </section>
    </div>
  );
}
