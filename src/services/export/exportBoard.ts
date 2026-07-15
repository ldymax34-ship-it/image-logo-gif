import { exportBoardImageWithinLimit } from '../../core';
import type { ExportBoardRequest } from './exportTypes';
export function exportBoard(request: ExportBoardRequest) { return exportBoardImageWithinLimit(request); }
