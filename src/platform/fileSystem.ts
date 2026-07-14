import { invoke } from '@tauri-apps/api/core';
import { isDesktopBridgeAvailable } from './desktopBridge';

export type PickedFile = {
  name: string;
  type: string;
  size: number;
  file: File;
};

export async function pickFilesFromInput(fileList: FileList | null): Promise<PickedFile[]> {
  if (!fileList) return [];
  return Array.from(fileList).map((file) => ({
    name: file.name,
    type: file.type,
    size: file.size,
    file
  }));
}

type WritableFileStreamLike = {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
};

type FileHandleLike = {
  createWritable(): Promise<WritableFileStreamLike>;
};

export type OutputDirectoryHandle = {
  getFileHandle(name: string, options: { create: boolean }): Promise<FileHandleLike>;
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<OutputDirectoryHandle>;
};

export type OutputTarget =
  | { kind: 'directory'; handle: OutputDirectoryHandle }
  | { kind: 'desktop-directory'; path: string; reservedFileNames: Set<string> }
  | { kind: 'downloads' }
  | { kind: 'cancelled' };

export async function chooseOutputTarget(): Promise<OutputTarget> {
  if (isDesktopBridgeAvailable()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({
      directory: true,
      multiple: false,
      title: '选择导出文件夹'
    });
    return typeof path === 'string'
      ? { kind: 'desktop-directory', path, reservedFileNames: new Set() }
      : { kind: 'cancelled' };
  }

  const pickerWindow = window as DirectoryPickerWindow;
  const picker = pickerWindow.showDirectoryPicker;
  if (!picker) return { kind: 'downloads' };
  try {
    const handle = await pickerWindow.showDirectoryPicker!({ mode: 'readwrite' });
    return { kind: 'directory', handle };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { kind: 'cancelled' };
    }
    throw error;
  }
}

export async function saveBlobToDirectory(handle: OutputDirectoryHandle, fileName: string, blob: Blob): Promise<void> {
  const fileHandle = await handle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

/** Writes only to a directory actively chosen by the user. */
export async function saveBlobToOutputTarget(target: OutputTarget, fileName: string, blob: Blob): Promise<string> {
  if (target.kind === 'directory') {
    await saveBlobToDirectory(target.handle, fileName, blob);
    return fileName;
  }

  if (target.kind === 'desktop-directory') {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    try {
      const resolvedName = await invoke<string>('save_export_file', {
        directory: target.path,
        fileName,
        bytes: Array.from(bytes)
      });
      target.reservedFileNames.add(resolvedName);
      return resolvedName;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`无法写入所选文件夹：${reason}`);
    }
  }

  if (target.kind === 'downloads') {
    downloadBlobFile(blob, fileName);
    return fileName;
  }

  throw new Error('未选择输出位置');
}

export function downloadBlobFile(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
