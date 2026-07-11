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
  | { kind: 'downloads' }
  | { kind: 'cancelled' };

export async function chooseOutputTarget(): Promise<OutputTarget> {
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

export function downloadBlobFile(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
