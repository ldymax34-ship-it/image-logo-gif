// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as toastBus from '../../components/ui/toastBus';
import { parseSpecText } from '../../core';
import { useMediaSpecActions } from './useMediaSpecActions';

function Harness({ onMessage }: { onMessage: (message: string) => void }) {
  const actions = useMediaSpecActions({
    result: parseSpecText('1920x1080'),
    draftText: '1920x1080',
    appliedText: '',
    specs: [],
    previewStates: {},
    brandSettings: {} as never,
    customPresets: [],
    newPresetName: '',
    setDraftText: vi.fn(),
    setAppliedText: vi.fn(),
    setSpecs: vi.fn(),
    setBrandLayer: vi.fn(),
    setCustomPresets: vi.fn(),
    setNewPresetName: vi.fn(),
    setPendingConfirmation: vi.fn(),
    setMessage: onMessage,
    createLogoDefaults: () => ({ colorMode: 'original' } as never),
    deleteAsset: vi.fn()
  });
  return <button type="button" onClick={actions.applyParsedSpecs}>应用尺寸</button>;
}

afterEach(() => vi.restoreAllMocks());

describe('media notification policy', () => {
  it('keeps applying the size matrix as local feedback without a global toast', () => {
    const notify = vi.spyOn(toastBus, 'notify');
    const onMessage = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<Harness onMessage={onMessage} />));
    act(() => container.querySelector('button')?.click());

    expect(onMessage).toHaveBeenCalledWith('已应用 1 个画板');
    expect(notify).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });
});
