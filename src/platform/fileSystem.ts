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

function splitFileName(fileName: string): { base: string; extension: string } {
  const match = /^(.*?)(\.[^.]+)?$/.exec(fileName);
  return { base: match?.[1] || 'export', extension: match?.[2] || '' };
}

async function getDesktopAvailableFileName(directory: string, fileName: string, reserved: Set<string>): Promise<string> {
  const { exists } = await import('@tauri-apps/plugin-fs');
  const { base, extension } = splitFileName(fileName);
  let candidate = fileName;
  let index = 2;
  while (reserved.has(candidate) || await exists(`${directory}/${candidate}`)) {
    candidate = `${base}_${index}${extension}`;
    index += 1;
  }
  reserved.add(candidate);
  return candidate;
}

/** Writes only to a directory actively chosen by the user. */
export async function saveBlobToOutputTarget(target: OutputTarget, fileName: string, blob: Blob): Promise<string> {
  if (target.kind === 'directory') {
    await saveBlobToDirectory(target.handle, fileName, blob);
    return fileName;
  }

  if (target.kind === 'desktop-directory') {
    const [{ writeFile }, bytes] = await Promise.all([
      import('@tauri-apps/plugin-fs'),
      blob.arrayBuffer()
    ]);
    const resolvedName = await getDesktopAvailableFileName(target.path, fileName, target.reservedFileNames);
    await writeFile(`${target.path}/${resolvedName}`, new Uint8Array(bytes));
    return resolvedName;
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
import { isDesktopBridgeAvailable } from './desktopBridge';
