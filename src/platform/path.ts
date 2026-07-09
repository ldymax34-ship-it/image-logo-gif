import { sanitizeFileNamePart } from '../core/export/fileNaming';

export function sanitizePathSegment(segment: string): string {
  return sanitizeFileNamePart(segment, 'folder', 80);
}
