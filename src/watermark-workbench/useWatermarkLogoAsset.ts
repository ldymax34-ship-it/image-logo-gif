import { useCallback, useEffect, useRef, useState } from 'react';
import { createMaterialAsset, releaseMaterialAsset, type MaterialAsset } from '../core';

export type LogoLoader = (file: File) => Promise<MaterialAsset>;
export type LogoReleaser = (asset: MaterialAsset) => void;

export type WatermarkLogoAssetState = {
  asset: MaterialAsset | undefined;
  error: string;
  loading: boolean;
  loadLogo: (file: File | null | undefined) => Promise<void>;
  clearLogo: () => void;
};

/**
 * Isolated Logo watermark asset lifecycle. Loading replaces and releases the
 * previous asset; clear releases the current one; unmount always releases.
 */
export function useWatermarkLogoAsset(deps: {
  load?: LogoLoader;
  release?: LogoReleaser;
} = {}): WatermarkLogoAssetState {
  const load = deps.load ?? ((file) => createMaterialAsset({ kind: 'file', file }));
  const release = deps.release ?? releaseMaterialAsset;
  const [asset, setAsset] = useState<MaterialAsset>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const assetRef = useRef<MaterialAsset>();

  const replace = useCallback((next: MaterialAsset | undefined) => {
    const previous = assetRef.current;
    if (previous && previous !== next) release(previous);
    assetRef.current = next;
    setAsset(next);
  }, [release]);

  useEffect(() => () => {
    const current = assetRef.current;
    if (current) release(current);
    assetRef.current = undefined;
  }, [release]);

  const loadLogo = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const next = await load(file);
      replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [load, replace]);

  const clearLogo = useCallback(() => {
    replace(undefined);
    setError('');
  }, [replace]);

  return { asset, error, loading, loadLogo, clearLogo };
}
