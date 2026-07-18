import type { AppActivity } from '../app/appActivity';

export function getInstallBlockReason(activity: AppActivity): string | undefined {
  if (activity.exporting) return '正在导出，完成后才能安装更新。';
  if (activity.focusEditorOpen) return '聚焦编辑器仍处于打开状态。';
  if (activity.focusEditorDirty || activity.customWorkbenchDirty || activity.settingsDirty) return '当前有未保存修改。';
  if (activity.settingsDialogOpen || activity.confirmationDialogOpen) return '请先关闭当前弹窗。';
  return undefined;
}
