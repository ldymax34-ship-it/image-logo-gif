import { useReducer, useState } from 'react';
import {
  DEFAULT_BRAND_ASSETS, loadBrandSettings, loadCustomPresetTemplates,
  type BoardBrandStateMap, type BoardPreviewState, type BrandAsset, type BrandLanguage,
  type BrandLayerState, type BrandSettingsV1, type MaterialAsset, type MaterialSpec, type PresetTemplate
} from '../../core';
import type { WorkbenchModule } from '../../components';
import { boardBrandReducer } from './boardBrandReducer';

export type PresetApplyMode = 'replace' | 'append';
export type PendingConfirmation =
  | { type: 'apply-specs'; count: number }
  | { type: 'delete-preset'; presetId: string; presetName: string }
  | { type: 'delete-asset'; assetId: string; fileName: string };

export function useMediaWorkbenchState(defaultBrandLayer: BrandLayerState) {
  const [activeModule, setActiveModule] = useState<WorkbenchModule>('media');
  const [draftText, setDraftText] = useState(''); const [appliedText, setAppliedText] = useState('');
  const [specs, setSpecs] = useState<MaterialSpec[]>([]); const [assets, setAssets] = useState<MaterialAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string>(); const [selectedSpecId, setSelectedSpecId] = useState<string>();
  const [previewStates, setPreviewStates] = useState<Record<string, BoardPreviewState>>({});
  const [brandAssets, setBrandAssets] = useState<BrandAsset[]>(DEFAULT_BRAND_ASSETS);
  const [brandLayer, setBrandLayer] = useState<BrandLayerState>(defaultBrandLayer);
  const [brandSettings, setBrandSettings] = useState<BrandSettingsV1>(() => loadBrandSettings());
  const [boardBrandStates, dispatchBoardBrand] = useReducer(boardBrandReducer, {} as BoardBrandStateMap);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false); const [settingsDirty, setSettingsDirty] = useState(false);
  const [customPresets, setCustomPresets] = useState<PresetTemplate[]>(() => loadCustomPresetTemplates());
  const [presetApplyMode, setPresetApplyMode] = useState<PresetApplyMode>('replace');
  const [focusAssetId, setFocusAssetId] = useState<string>(); const [focusSpecId, setFocusSpecId] = useState<string>();
  const [focusEditorDirty, setFocusEditorDirty] = useState(false); const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation>();
  const [newPresetName, setNewPresetName] = useState(''); const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false); const [customWorkbenchDirty, setCustomWorkbenchDirty] = useState(false);
  const [message, setMessage] = useState(''); const [importFailures, setImportFailures] = useState<string[]>([]);
  const [resourceUploadLanguage, setResourceUploadLanguage] = useState<BrandLanguage>('zh-CN'); const [replacingResourceId, setReplacingResourceId] = useState<string>();
  return { activeModule, setActiveModule, draftText, setDraftText, appliedText, setAppliedText, specs, setSpecs, assets, setAssets, selectedAssetId, setSelectedAssetId, selectedSpecId, setSelectedSpecId, previewStates, setPreviewStates, brandAssets, setBrandAssets, brandLayer, setBrandLayer, brandSettings, setBrandSettings, boardBrandStates, dispatchBoardBrand, settingsDialogOpen, setSettingsDialogOpen, settingsDirty, setSettingsDirty, customPresets, setCustomPresets, presetApplyMode, setPresetApplyMode, focusAssetId, setFocusAssetId, focusSpecId, setFocusSpecId, focusEditorDirty, setFocusEditorDirty, pendingConfirmation, setPendingConfirmation, newPresetName, setNewPresetName, exportDialogOpen, setExportDialogOpen, exporting, setExporting, customWorkbenchDirty, setCustomWorkbenchDirty, message, setMessage, importFailures, setImportFailures, resourceUploadLanguage, setResourceUploadLanguage, replacingResourceId, setReplacingResourceId };
}
