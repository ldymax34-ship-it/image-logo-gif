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
