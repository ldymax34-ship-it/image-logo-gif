import { useReducer, useState } from 'react';
import {
  loadCustomPresetTemplates,
  type BoardBrandStateMap, type BoardPreviewState,
  type MaterialAsset, type MaterialSpec, type PresetTemplate
} from '../../core';
import { boardBrandReducer } from './boardBrandReducer';

export type PresetApplyMode = 'replace' | 'append';
export type PendingConfirmation =
  | { type: 'apply-specs'; count: number }
  | { type: 'delete-preset'; presetId: string; presetName: string }
  | { type: 'delete-asset'; assetId: string; fileName: string };

export function useMediaWorkbenchState() {
  const [draftText, setDraftText] = useState(''); const [appliedText, setAppliedText] = useState('');
  const [specs, setSpecs] = useState<MaterialSpec[]>([]); const [assets, setAssets] = useState<MaterialAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string>(); const [selectedSpecId, setSelectedSpecId] = useState<string>();
  const [previewStates, setPreviewStates] = useState<Record<string, BoardPreviewState>>({});
  const [boardBrandStates, dispatchBoardBrand] = useReducer(boardBrandReducer, {} as BoardBrandStateMap);
  const [customPresets, setCustomPresets] = useState<PresetTemplate[]>(() => loadCustomPresetTemplates());
  const [presetApplyMode, setPresetApplyMode] = useState<PresetApplyMode>('replace');
  const [focusAssetId, setFocusAssetId] = useState<string>(); const [focusSpecId, setFocusSpecId] = useState<string>();
  const [focusEditorDirty, setFocusEditorDirty] = useState(false); const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation>();
  const [newPresetName, setNewPresetName] = useState(''); const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState(''); const [importFailures, setImportFailures] = useState<string[]>([]);
  return { draftText, setDraftText, appliedText, setAppliedText, specs, setSpecs, assets, setAssets, selectedAssetId, setSelectedAssetId, selectedSpecId, setSelectedSpecId, previewStates, setPreviewStates, boardBrandStates, dispatchBoardBrand, customPresets, setCustomPresets, presetApplyMode, setPresetApplyMode, focusAssetId, setFocusAssetId, focusSpecId, setFocusSpecId, focusEditorDirty, setFocusEditorDirty, pendingConfirmation, setPendingConfirmation, newPresetName, setNewPresetName, exportDialogOpen, setExportDialogOpen, exporting, setExporting, message, setMessage, importFailures, setImportFailures };
}
