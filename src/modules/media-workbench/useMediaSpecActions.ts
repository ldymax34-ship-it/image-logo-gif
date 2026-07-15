import type { Dispatch, SetStateAction } from 'react';
import {
  serializePresetSpecs, toPresetSpecs, type BoardPreviewState, type BrandLayerState, type BrandSettingsV1,
  type LogoGroupState, type MaterialSpec, type PresetTemplate, type parseSpecText
} from '../../core';
import type { PendingConfirmation, PresetApplyMode } from './useMediaWorkbenchState';

function mergeSpecText(currentText: string, presetText: string): string {
  const current = currentText.trim(); const preset = presetText.trim();
  if (!current) return preset; if (!preset) return current; return `${current}\n${preset}`;
}

export function useMediaSpecActions(input: {
  result: ReturnType<typeof parseSpecText>; draftText: string; appliedText: string; specs: MaterialSpec[];
  previewStates: Record<string, BoardPreviewState>; brandSettings: BrandSettingsV1; customPresets: PresetTemplate[];
  newPresetName: string; pendingConfirmation?: PendingConfirmation;
  setDraftText: Dispatch<SetStateAction<string>>; setAppliedText: Dispatch<SetStateAction<string>>;
  setSpecs: Dispatch<SetStateAction<MaterialSpec[]>>; setBrandLayer: Dispatch<SetStateAction<BrandLayerState>>;
  setCustomPresets: Dispatch<SetStateAction<PresetTemplate[]>>; setNewPresetName: Dispatch<SetStateAction<string>>;
  setPendingConfirmation: Dispatch<SetStateAction<PendingConfirmation | undefined>>; setMessage: Dispatch<SetStateAction<string>>;
  createLogoDefaults: (spec?: MaterialSpec) => LogoGroupState; deleteAsset: (assetId: string) => void;
}) {
  function commitParsedSpecs() {
    const nextSpecs = input.result.specs;
    if (!input.specs.length && nextSpecs.length) {
      const defaults = input.createLogoDefaults(nextSpecs[0]); const color = defaults.colorMode === 'black' ? '#000000' : '#ffffff';
      input.setBrandLayer((previous) => ({ ...previous, logoLanguage: input.brandSettings.defaultLanguage, logoEffect: { ...previous.logoEffect, colorEnabled: true, color }, cprEffect: { ...previous.cprEffect, colorEnabled: input.brandSettings.defaultCprColorMode !== 'original', color: input.brandSettings.defaultCprColorMode === 'black' ? '#000000' : '#ffffff' } }));
    }
    input.setSpecs(nextSpecs); input.setAppliedText(input.draftText.trim()); input.setMessage(nextSpecs.length ? `已应用 ${nextSpecs.length} 个画板` : '已清空画板');
  }
  function applyParsedSpecs() {
    if ((input.specs.length > 0 || Object.keys(input.previewStates).length > 0) && input.draftText.trim() !== input.appliedText.trim()) { input.setPendingConfirmation({ type: 'apply-specs', count: input.result.specs.length }); return; }
    commitParsedSpecs();
  }
  function restoreAppliedText() { input.setDraftText(input.appliedText); input.setMessage('已恢复到上一次应用的尺寸矩阵'); }
  function applyPresetTemplate(template: PresetTemplate, mode: PresetApplyMode) { const text = serializePresetSpecs(template.specs); input.setDraftText((current) => mode === 'replace' ? text : mergeSpecText(current, text)); input.setMessage(`已${mode === 'replace' ? '填入' : '追加'}套组：${template.name}`); }
  function saveCurrentAsPreset() {
    if (!input.specs.length) { input.setMessage('当前没有可保存的尺寸套组'); return; }
    const name = input.newPresetName.trim() || `我的套组 ${input.customPresets.length + 1}`;
    input.setCustomPresets((previous) => [{ id: `custom_${crypto.randomUUID()}`, name, description: `保存于 ${new Date().toLocaleDateString('zh-CN')}`, specs: toPresetSpecs(input.specs) }, ...previous]);
    input.setNewPresetName(''); input.setMessage(`已保存套组：${name}`);
  }
  function removeCustomPreset(id: string) { const preset = input.customPresets.find((item) => item.id === id); if (preset) input.setPendingConfirmation({ type: 'delete-preset', presetId: id, presetName: preset.name }); }
  function confirmPendingAction() {
    const pending = input.pendingConfirmation; if (!pending) return;
    if (pending.type === 'apply-specs') commitParsedSpecs();
    else if (pending.type === 'delete-preset') { input.setCustomPresets((previous) => previous.filter((preset) => preset.id !== pending.presetId)); input.setMessage(`已删除套组：${pending.presetName}`); }
    else input.deleteAsset(pending.assetId);
    input.setPendingConfirmation(undefined);
  }
  return { applyParsedSpecs, commitParsedSpecs, restoreAppliedText, applyPresetTemplate, saveCurrentAsPreset, removeCustomPreset, confirmPendingAction };
}
