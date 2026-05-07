'use client';

import { useMemo, useRef, useState, type DragEvent } from 'react';
import Papa from 'papaparse';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  FileImage,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Save,
  Send,
  Table2,
  Tag,
  Trash2,
  Type,
  Wand2,
} from 'lucide-react';
import { TransferProgress } from '@/components/uploads/TransferProgress';
import { useTransferState } from '@/components/uploads/useTransferState';
import { ModernSelect } from '@/components/ui/Select';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PromptDialog } from '@/components/ui/PromptDialog';
import { toast } from 'sonner';
import { ModernDatePicker } from '@/components/ui/DatePicker';
import { ModernTimePicker } from '@/components/ui/TimePicker';
import type { CSVRow, OTBatch } from '@/types/database';
import {
  applyFormulaToRows,
  CORE_OT_COLUMNS,
  createEmptyOTRow,
  getOTColumnLabel,
  getOTColumns,
  normalizeOTRow,
  parseOcrContent,
  type OcrParseIssue,
  type OcrParseLayout,
  sanitizeOTRows,
} from '@/lib/ot';
import { normalizeCSVHeaders, parseFlexibleTime, type OTDateFormat, type OTMeridiem } from '@/lib/utils';
import { readFileAsTextWithProgress } from '@/lib/file-transfer';

type ValidationError = { row: number; field: string; message: string };
type DraftBatch = Pick<OTBatch, 'id' | 'name' | 'status' | 'csv_data' | 'created_at' | 'published_at'>;
type FormulaScope = 'all' | 'selected' | 'blank-only';
type BulkEditScope = 'all' | 'selected' | 'blank-only';
type OcrSummary = {
  fileName: string;
  method: string;
  rowCount: number;
  confidence: number;
  columns: string[];
  layout: OcrParseLayout;
};
type OcrReviewState = {
  fileName: string;
  rows: CSVRow[];
  issues: OcrParseIssue[];
  summary: OcrSummary;
  extraColumns: string[];
};

const DATE_FORMAT_OPTIONS: Array<{ value: OTDateFormat; label: string }> = [
  { value: 'auto', label: 'Auto (MM/DD if ambiguous)' },
  { value: 'mdy', label: 'MM/DD/YYYY' },
  { value: 'dmy', label: 'DD/MM/YYYY' },
];

const FORMULA_CARDS: Array<{ formula: string; label: string; description: string; icon: React.ReactNode }> = [
  { formula: '=SHIFT(start_time)', label: 'Shift label', description: 'Auto-fills "Morning Shift" / "Afternoon Shift" based on the start time', icon: <Tag size={13} /> },
  { formula: '=DURATION(start_time,end_time)', label: 'Hours worked', description: 'Calculates the number of hours between Start and End time', icon: <Clock size={13} /> },
  { formula: '=COPY(lob)', label: 'Copy column', description: 'Copies the value from another column into the target column', icon: <Copy size={13} /> },
  { formula: '=TEXT("NYT VOICE")', label: 'Fixed text', description: 'Fills all target cells with a fixed text you define', icon: <Type size={13} /> },
  { formula: '=CONCAT(lob," - ",spot_id)', label: 'Combine values', description: 'Joins multiple columns and literal text into one value', icon: <Tag size={13} /> },
];

const FORMULA_DESCRIPTIONS: Record<string, string> = {
  '=SHIFT(': 'Fills the column with "Morning Shift" or "Afternoon Shift" based on the start time.',
  '=DURATION(': 'Calculates total hours between start and end times.',
  '=COPY(': 'Copies values from another column into the target column.',
  '=TEXT(': 'Fills the column with a fixed text value you specify.',
  '=CONCAT(': 'Combines column values and literal text into a single value.',
  '=UPPER(': 'Converts text to ALL CAPS.',
  '=LOWER(': 'Converts text to all lowercase.',
  '=TRIM(': 'Removes extra spaces from the beginning and end.',
  '=DATE(': 'Formats dates using a custom pattern.',
  '=AUTO': 'Automatically calculates the best value for the target column.',
};

const BULK_FILL_PRESETS = [
  { label: 'Pending status', column: 'csv_status', value: 'Pending' },
  { label: 'Morning shift', column: 'shift_label', value: 'Morning Shift' },
  { label: 'Afternoon shift', column: 'shift_label', value: 'Afternoon Shift' },
  { label: 'NYT VOICE', column: 'lob', value: 'NYT VOICE' },
  { label: 'NYT CHAT', column: 'lob', value: 'NYT CHAT' },
  { label: 'NYT EMAIL', column: 'lob', value: 'NYT EMAIL' },
] as const;

// Converts an image to high-contrast grayscale at 2× resolution before Tesseract.
// Excel screenshots with colored header rows and alternating row colors confuse Tesseract;
// binarization removes the color noise while the upscale preserves character detail.
async function preprocessImageForTesseract(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width * 2;
    canvas.height = bitmap.height * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = imageData;
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      // Threshold 160: light backgrounds → white, text + borders → black
      const binary = gray > 160 ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = binary;
      data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
    return await new Promise<File>((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob ? new File([blob], file.name, { type: 'image/png' }) : file);
      }, 'image/png');
    });
  } catch {
    return file;
  }
}

function mapImportedRows(rawRows: Record<string, string>[], rawHeaders: string[], dateFormat: OTDateFormat) {
  const headerMap = normalizeCSVHeaders(rawHeaders);
  return rawRows.map((row) => {
    const mapped: CSVRow = { date: '', start_time: '', end_time: '' };
    Object.entries(headerMap).forEach(([original, normalizedKey]) => {
      mapped[normalizedKey] = row[original] ?? '';
    });
    return normalizeOTRow(mapped, dateFormat);
  });
}

export function StagingClient({ initialDrafts }: { initialDrafts: DraftBatch[] }) {
  const [rows, setRows] = useState<CSVRow[]>([]);
  const [columns, setColumns] = useState<string[]>([...CORE_OT_COLUMNS]);
  const [batchName, setBatchName] = useState('');
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [dateFormat, setDateFormat] = useState<OTDateFormat>('auto');
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [pendingPublish, setPendingPublish] = useState<'draft' | 'published' | null>(null);
  const [addColumnModal, setAddColumnModal] = useState(false);
  const [addColumnError, setAddColumnError] = useState<string | null>(null);
  const [deleteDraftConfirm, setDeleteDraftConfirm] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [bulkTime, setBulkTime] = useState({ start_time: '', end_time: '' });
  const [drafts, setDrafts] = useState<DraftBatch[]>(initialDrafts);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<'success' | 'warning'>('success');
  const [pasteText, setPasteText] = useState('');
  const [formulaInput, setFormulaInput] = useState('=SHIFT(start_time)');
  const [formulaColumn, setFormulaColumn] = useState('shift_label');
  const [formulaScope, setFormulaScope] = useState<FormulaScope>('selected');
  const [bulkEditColumn, setBulkEditColumn] = useState('csv_status');
  const [bulkEditValue, setBulkEditValue] = useState('Pending');
  const [bulkEditScope, setBulkEditScope] = useState<BulkEditScope>('selected');
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrSummary, setOcrSummary] = useState<OcrSummary | null>(null);
  const [ocrReview, setOcrReview] = useState<OcrReviewState | null>(null);
  const [ocrStartMeridiem, setOcrStartMeridiem] = useState<OTMeridiem | null>(null);
  const [ocrEndMeridiem, setOcrEndMeridiem] = useState<OTMeridiem | null>(null);
  const [inlineBatchError, setInlineBatchError] = useState<string | null>(null);
  const [inlineTimeError, setInlineTimeError] = useState<string | null>(null);
  const [deleteColumnModal, setDeleteColumnModal] = useState<string | null>(null);
  const [ocrImageColumns, setOcrImageColumns] = useState<Set<string>>(new Set());
  const uploadRef = useRef<HTMLInputElement>(null);
  const [dragKind, setDragKind] = useState<'csv' | 'image' | null>(null);
  const transfer = useTransferState({ resetAfterMs: 1500 });

  const hasMissingIDs = rows.some((row) => !String(row.spot_id ?? '').trim());
  const selectedRowCount = selectedRows.size;
  const bulkEditInputType =
    bulkEditColumn === 'date'
      ? 'date'
      : bulkEditColumn === 'start_time' || bulkEditColumn === 'end_time'
        ? 'time'
        : bulkEditColumn === 'duration_hrs'
          ? 'number'
          : 'text';

  const validateRows = (rowsToValidate: CSVRow[]) => {
    const nextErrors: ValidationError[] = [];
    const duplicates = new Map<string, number[]>();

    rowsToValidate.forEach((row, index) => {
      if (!String(row.date ?? '').trim()) nextErrors.push({ row: index, field: 'date', message: 'Date required' });
      if (!String(row.start_time ?? '').trim()) nextErrors.push({ row: index, field: 'start_time', message: 'Start required' });
      if (!String(row.end_time ?? '').trim()) nextErrors.push({ row: index, field: 'end_time', message: 'End required' });

      const key = [
        String(row.spot_id ?? '').trim(),
        String(row.date ?? '').trim(),
        String(row.start_time ?? '').trim(),
        String(row.end_time ?? '').trim(),
      ].join('|');
      if (key !== '|||') duplicates.set(key, [...(duplicates.get(key) ?? []), index]);
    });

    duplicates.forEach((indexes) => {
      if (indexes.length > 1) {
        indexes.forEach((row) => nextErrors.push({ row, field: 'spot_id', message: 'Duplicate OT row' }));
      }
    });

    setErrors(nextErrors);
    return nextErrors;
  };

  const loadRows = (nextRows: CSVRow[], nextBatchName?: string, nextBatchId?: string | null, imageCols?: string[]) => {
    const normalized = sanitizeOTRows(nextRows, dateFormat);
    const nextColumns = getOTColumns(normalized);
    setRows(normalized);
    setColumns(nextColumns.length > 0 ? nextColumns : [...CORE_OT_COLUMNS]);
    setBatchName(nextBatchName ?? '');
    setActiveBatchId(nextBatchId ?? null);
    setSelectedRows(new Set());
    setStatusMessage(null);
    setOcrImageColumns(imageCols ? new Set(imageCols) : new Set());
    validateRows(normalized);
  };

  const parseFile = async (file: File) => {
    transfer.start(`Reading ${file.name}...`);
    setStatusMessage(null);

    try {
      const text = await readFileAsTextWithProgress(file, { onProgress: transfer.setProgress });
      transfer.setProgress(100);

      const result = await new Promise<Papa.ParseResult<Record<string, string>>>((resolve, reject) => {
        Papa.parse<Record<string, string>>(text, {
          header: true,
          skipEmptyLines: true,
          complete: resolve,
          error: (error: Error) => reject(error),
        });
      });

      setOcrSummary(null);
      setOcrReview(null);
      loadRows(
        mapImportedRows(result.data, result.meta.fields ?? [], dateFormat),
        file.name.replace(/\.(csv|txt)$/i, ''),
        null,
      );
      transfer.succeed('Imported');
    } catch (error) {
      setOcrSummary(null);
      setStatusTone('warning');
      setStatusMessage(error instanceof Error ? error.message : 'Unable to parse that file.');
      transfer.fail('Try again');
    }
  };

  const parsePastedText = () => {
    if (!pasteText.trim()) {
      setStatusTone('warning');
      setStatusMessage('Paste the table first.');
      return;
    }
    Papa.parse<Record<string, string>>(pasteText.trim(), {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if ((result.meta.fields ?? []).length === 0) {
          setStatusTone('warning');
          setStatusMessage('Headers were not found in the pasted data.');
          return;
        }
        setOcrSummary(null);
        setOcrReview(null);
        loadRows(mapImportedRows(result.data, result.meta.fields ?? [], dateFormat), batchName || 'manual_paste_import', null);
      },
      error: (error: Error) => {
        setStatusTone('warning');
        setStatusMessage(`Unable to parse pasted data: ${error.message}`);
      },
    });
  };

  const finalizeOcrReview = (meridiems: { start_time: OTMeridiem | null; end_time: OTMeridiem | null } | null) => {
    if (!ocrReview) {
      return;
    }

    const nextRows = ocrReview.rows.map((row, rowIndex) => {
      const patchedRow = { ...row };
      ocrReview.issues.forEach((issue) => {
        if (issue.type !== 'ambiguous-time' || issue.rowIndex !== rowIndex) return;
        const meridiem = meridiems ? meridiems[issue.field] : null;
        if (!meridiem) return;
        const parsed = parseFlexibleTime(issue.rawValue, { defaultMeridiem: meridiem });
        if (parsed.value) {
          patchedRow[issue.field] = parsed.value;
        }
      });
      return normalizeOTRow(patchedRow, dateFormat);
    });

    loadRows(nextRows, ocrReview.fileName.replace(/\.[^.]+$/i, ''), null, ocrReview.extraColumns);
    setOcrSummary({
      ...ocrReview.summary,
      rowCount: nextRows.length,
      columns: getOTColumns(nextRows).map((column) => getOTColumnLabel(column)),
    });
    setOcrReview(null);
    setStatusTone('success');
    setStatusMessage(
      ocrReview.issues.length > 0
        ? `OCR extracted ${nextRows.length} OT row(s). Review the highlighted blanks before publishing.`
        : `OCR extracted ${nextRows.length} OT row(s). Review the table below before publishing.`,
    );
  };

  // Shared logic: pick best attempt and update state.
  const applyOcrAttempts = (
    attempts: Array<{ text: string; tsv?: string | null; rows: ReturnType<typeof parseOcrContent>['rows']; issues: OcrParseIssue[]; label: string; confidence: number; layout: OcrParseLayout; extraColumns?: string[] }>,
    fileName: string,
  ) => {
    const bestAttempt =
      [...attempts].sort(
        (left, right) =>
          right.rows.length - left.rows.length ||
          left.issues.length - right.issues.length ||
          right.confidence - left.confidence ||
          right.text.length - left.text.length,
      )[0] ?? { text: '', rows: [], issues: [], label: 'OCR', confidence: 0, layout: 'none' as OcrParseLayout, extraColumns: [] };

    if (bestAttempt.rows.length === 0) {
      setOcrSummary(null);
      setOcrReview(null);
      setStatusTone('warning');
      setStatusMessage(
        attempts.length === 0
          ? 'The OCR engine could not start. Check that the image file is valid and try again.'
          : 'OCR finished but no OT rows were found. Make sure the image contains a schedule table with ID, Date, Start, and End columns.',
      );
      transfer.fail('No rows found');
      return false;
    }

    const nextSummary = {
      fileName,
      method: bestAttempt.label,
      rowCount: bestAttempt.rows.length,
      confidence: Math.round(bestAttempt.confidence),
      columns: getOTColumns(bestAttempt.rows).map((column) => getOTColumnLabel(column)),
      layout: bestAttempt.layout,
    } satisfies OcrSummary;

    const extraCols = bestAttempt.extraColumns ?? [];

    if (bestAttempt.issues.length > 0) {
      setOcrSummary(null);
      setOcrReview({ fileName, rows: bestAttempt.rows, issues: bestAttempt.issues, summary: nextSummary, extraColumns: extraCols });
      setStatusTone('warning');
      setStatusMessage(`OCR extracted ${bestAttempt.rows.length} row(s). Some fields need review — decide below and load the sheet.`);
      transfer.succeed('Review required');
      return true;
    }

    loadRows(bestAttempt.rows, fileName.replace(/\.[^.]+$/i, ''), null, extraCols);
    setOcrReview(null);
    setOcrSummary(nextSummary);
    setStatusTone('success');
    setStatusMessage(
      `OCR extracted ${bestAttempt.rows.length} OT row(s) via ${bestAttempt.label} (${Math.round(bestAttempt.confidence)}% confidence). Review the table before publishing.`,
    );
    transfer.succeed('OCR complete');
    return true;
  };

  const handleImageImport = async (file: File) => {
    transfer.start(`Processing ${file.name}...`);
    setOcrBusy(true);
    setStatusMessage(null);

    // Helper: parse server attempts and run applyOcrAttempts
    const processServerAttempts = (raw: Array<{ label: string; text: string; tsv: string | null; confidence: number; rows?: Record<string, string>[] | null; extraColumns?: string[] }>) => {
      const attempts = raw.map(({ label, text, tsv, confidence, rows: serverRows, extraColumns }) => {
        if (serverRows && serverRows.length > 0) {
          // Claude Vision returned structured JSON — use directly without text parsing
          const csvRows = serverRows.map((r) => normalizeOTRow(r as CSVRow, dateFormat));
          return { text, tsv, rows: csvRows, issues: [], label, confidence, layout: 'wide-export' as OcrParseLayout, extraColumns: extraColumns ?? [] };
        }
        const parsed = parseOcrContent({ text, tsv, dateFormat });
        return { text, tsv, rows: parsed.rows, issues: parsed.issues, label, confidence, layout: parsed.inferredLayout, extraColumns: [] };
      });
      return applyOcrAttempts(attempts, file.name);
    };

    try {
      // ── Path A: Claude Vision (server) ────────────────────────────────────
      transfer.setMessage('Running OCR...');
      transfer.setProgress(10);

      const body = new FormData();
      body.append('image', file);
      const response = await fetch('/api/ocr', { method: 'POST', body });

      if (response.ok) {
        transfer.setProgress(90);
        const { attempts: rawAttempts } = await response.json() as {
          attempts: Array<{ label: string; text: string; tsv: string | null; confidence: number; rows?: Record<string, string>[] | null; extraColumns?: string[] }>;
        };
        transfer.setProgress(100);
        processServerAttempts(rawAttempts);
        return;
      }

      // Server returned an error — check if it's a fallback-able situation (503)
      const errData = await response.json().catch(() => ({})) as { error?: string; fallback?: boolean };
      if (!errData.fallback) {
        throw new Error(errData.error ?? `OCR request failed (${response.status})`);
      }

      // ── Path B: Browser Tesseract fallback ───────────────────────────────
      // Server Vision API is unavailable. Use local Tesseract running in the browser.
      // corePath points to the specific non-SIMD .wasm.js file — this bypasses
      // getCore's SIMD detection logic so the WASM always loads reliably.
      transfer.setMessage('Using browser OCR...');
      transfer.setProgress(5);

      const { createWorker, OEM, PSM } = await import('tesseract.js');

      const makeLogger = () => (msg: Record<string, unknown>) => {
        if (typeof msg.progress === 'number') transfer.setProgress((msg.progress as number) * 100);
        if (typeof msg.status === 'string') {
          transfer.setMessage(msg.status === 'recognizing text' ? 'Running OCR...' : msg.status as string);
        }
      };

      const workerPromise = createWorker('eng', OEM.LSTM_ONLY, {
        workerPath: '/tesseract/worker.min.js',
        // Ending in .js → getCore uses this exact file, skips SIMD detection entirely
        corePath: '/tesseract/core/tesseract-core-lstm.wasm.js',
        langPath: '/tesseract/langs',
        workerBlobURL: false,
        logger: makeLogger(),
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Browser OCR timed out after 45 s. Try a smaller or clearer image.')), 45_000),
      );

      const worker = await Promise.race([workerPromise, timeoutPromise]);

      // Pre-process the image for better Tesseract accuracy on Excel/Sheets screenshots
      transfer.setMessage('Preprocessing image...');
      const processedFile = await preprocessImageForTesseract(file);

      type BrowserAttempt = { text: string; tsv: string | null; rows: ReturnType<typeof parseOcrContent>['rows']; issues: OcrParseIssue[]; label: string; confidence: number; layout: OcrParseLayout; extraColumns: string[] };
      const browserAttempts: BrowserAttempt[] = [];

      for (const { label, psm, src } of [
        { label: 'enhanced auto', psm: PSM.AUTO, src: processedFile },
        { label: 'enhanced sparse', psm: PSM.SPARSE_TEXT, src: processedFile },
        { label: 'original auto', psm: PSM.AUTO, src: file },
      ]) {
        try {
          await worker.setParameters({ preserve_interword_spaces: '1', user_defined_dpi: '300', tessedit_pageseg_mode: psm });
          const result = await worker.recognize(src, { rotateAuto: true }, { text: true, tsv: true });
          const text = result.data.text?.trim() ?? '';
          const parsed = parseOcrContent({ text, tsv: result.data.tsv, dateFormat });
          browserAttempts.push({ text, tsv: result.data.tsv ?? null, rows: parsed.rows, issues: parsed.issues, label, confidence: Number(result.data.confidence ?? 0), layout: parsed.inferredLayout, extraColumns: [] });
        } catch (err) {
          console.warn(`[OCR] browser attempt "${label}" skipped:`, err);
        }
      }

      await worker.terminate();
      applyOcrAttempts(browserAttempts, file.name);
    } catch (error) {
      setOcrSummary(null);
      setOcrReview(null);
      setStatusTone('warning');
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'OCR failed. Make sure the image is a valid PNG, JPG or WEBP and try again.';
      console.warn('[OT Staging OCR] failed:', error);
      setStatusMessage(message.trim() || 'OCR failed. Make sure the image is a valid PNG, JPG or WEBP and try again.');
      transfer.fail('OCR failed');
    } finally {
      setOcrBusy(false);
    }
  };

  const handlePickedFile = (file: File) => {
    setDragKind(null);
    if (file.type.startsWith('image/')) {
      void handleImageImport(file);
      return;
    }
    void parseFile(file);
  };

  const detectDragKind = (event: DragEvent<HTMLDivElement>) => {
    const item = event.dataTransfer?.items?.[0];
    const file = event.dataTransfer?.files?.[0];
    const mime = item?.type || file?.type || '';
    const name = file?.name?.toLowerCase() ?? '';

    if (mime.startsWith('image/') || name.match(/\.(png|jpe?g|webp|gif|bmp|tiff?)$/)) {
      return 'image' as const;
    }
    return 'csv' as const;
  };

  const handleDropzoneDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragKind(detectDragKind(event));
  };

  const handleDropzoneDragLeave = () => {
    setDragKind(null);
  };

  const handleDropzoneDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    setDragKind(null);
    if (file) {
      handlePickedFile(file);
    }
  };

  const updateCell = (rowIndex: number, field: string, value: string) => {
    setRows((current) => {
      const next = current.map((row, index) =>
        index === rowIndex ? normalizeOTRow({ ...row, [field]: value }, dateFormat, false) : row,
      );
      validateRows(next);
      return next;
    });
  };

  const deleteRow = (rowIndex: number) => {
    setRows((current) => {
      const next = current.filter((_, index) => index !== rowIndex);
      setColumns(next.length > 0 ? getOTColumns(next) : [...CORE_OT_COLUMNS]);
      validateRows(next);
      return next;
    });
    setSelectedRows(new Set());
  };

  const addRow = () => {
    setRows((current) => {
      const next = [...current, createEmptyOTRow(columns)];
      validateRows(next);
      return next;
    });
  };

  const addColumn = () => setAddColumnModal(true);

  const doAddColumn = (label: string): boolean => {
    const key = label.trim().toLowerCase().replace(/\s+/g, '_');
    if (!key) {
      setAddColumnError('Column name cannot be empty.');
      return false;
    }
    if (columns.includes(key)) {
      setAddColumnError(`"${key}" already exists. Choose a different name.`);
      return false;
    }
    setAddColumnError(null);
    setColumns((current) => [...current, key]);
    setRows((current) => current.length === 0 ? [{ ...createEmptyOTRow([...columns, key]), [key]: '' }] : current.map((row) => ({ ...row, [key]: '' })));
    return true;
  };

  const requestDeleteColumn = (column: string) => {
    if (CORE_OT_COLUMNS.includes(column as (typeof CORE_OT_COLUMNS)[number])) {
      setStatusTone('warning');
      setStatusMessage(`${getOTColumnLabel(column)} is a protected OT column and cannot be removed.`);
      return;
    }

    setDeleteColumnModal(column);
  };

  const confirmDeleteColumn = () => {
    if (!deleteColumnModal) {
      return;
    }

    const columnToDelete = deleteColumnModal;
    const nextColumns = columns.filter((column) => column !== columnToDelete);

    setRows((current) => {
      const nextRows = current.map((row) => {
        const nextRow = { ...row };
        delete nextRow[columnToDelete];
        return normalizeOTRow(nextRow, dateFormat);
      });
      validateRows(nextRows);
      return nextRows;
    });
    setColumns(nextColumns);
    setDeleteColumnModal(null);

    if (formulaColumn === columnToDelete) {
      setFormulaColumn(nextColumns[0] ?? 'shift_label');
    }
    if (bulkEditColumn === columnToDelete) {
      setBulkEditColumn(nextColumns[0] ?? 'csv_status');
    }

    setStatusTone('success');
    setStatusMessage(`${getOTColumnLabel(columnToDelete)} was removed from the staging table.`);
  };

  const showInlineError = (setter: React.Dispatch<React.SetStateAction<string | null>>, msg: string) => {
    setter(msg);
    setTimeout(() => setter(null), 3500);
  };

  const handleBulkUpdate = () => {
    if (selectedRows.size === 0) {
      showInlineError(setInlineTimeError, 'Select rows first — check the boxes on the left of the table.');
      return;
    }
    if (!bulkTime.start_time && !bulkTime.end_time) {
      showInlineError(setInlineTimeError, 'Pick a Start or End time above before applying.');
      return;
    }

    setRows((current) => {
      const next = current.map((row, index) => {
        if (!selectedRows.has(index)) return row;
        return normalizeOTRow({ ...row, start_time: bulkTime.start_time || row.start_time, end_time: bulkTime.end_time || row.end_time }, dateFormat);
      });
      validateRows(next);
      return next;
    });
    setStatusTone('success');
    setStatusMessage('Shared start and end times were applied to the selected rows.');
  };

  const handleApplyFormula = () => {
    if (formulaScope === 'selected' && selectedRows.size === 0) {
      setStatusTone('warning');
      setStatusMessage('Select one or more rows before applying a formula to selected rows.');
      return;
    }

    setRows((current) => {
      const next = applyFormulaToRows({ rows: current, expression: formulaInput, targetColumn: formulaColumn, scope: formulaScope, selectedIndexes: selectedRows, dateFormat });
      validateRows(next);
      return next;
    });
    setStatusTone('success');
    setStatusMessage(`Formula applied to ${formulaScope === 'all' ? 'the full sheet' : formulaScope === 'blank-only' ? 'blank matching cells' : 'the selected rows'}.`);
  };

  const applyBulkEdit = (mode: 'set' | 'clear') => {
    if (bulkEditScope === 'selected' && selectedRows.size === 0) {
      showInlineError(setInlineBatchError, 'Select rows first — check the boxes on the left of the table.');
      return;
    }

    if (mode === 'set' && !String(bulkEditValue ?? '').trim() && bulkEditInputType !== 'time' && bulkEditInputType !== 'date') {
      showInlineError(setInlineBatchError, 'Enter a value before applying.');
      return;
    }

    setRows((current) => {
      const next = current.map((row, index) => {
        const isSelected = selectedRows.has(index);
        const isBlank = !String(row[bulkEditColumn] ?? '').trim();
        const shouldApply =
          bulkEditScope === 'all' ||
          (bulkEditScope === 'selected' && isSelected) ||
          (bulkEditScope === 'blank-only' && isBlank && (selectedRows.size === 0 || isSelected));

        if (!shouldApply) {
          return row;
        }

        return normalizeOTRow(
          {
            ...row,
            [bulkEditColumn]: mode === 'clear' ? '' : bulkEditValue,
          },
          dateFormat,
        );
      });

      validateRows(next);
      return next;
    });

    setStatusTone('success');
    setStatusMessage(
      `${mode === 'clear' ? 'Cleared' : 'Updated'} ${getOTColumnLabel(bulkEditColumn)} for ${
        bulkEditScope === 'all'
          ? 'the whole sheet'
          : bulkEditScope === 'blank-only'
            ? 'blank matching cells'
            : `${selectedRows.size} selected row(s)`
      }.`,
    );
  };

  const applyBulkPreset = (column: string, value: string) => {
    setBulkEditColumn(column);
    setBulkEditValue(value);
    setStatusTone('success');
    setStatusMessage(`Preset ready: ${getOTColumnLabel(column)} will be set to "${value}". Click Apply value when ready.`);
  };

  const duplicateSelectedRows = () => {
    if (selectedRows.size === 0) {
      showInlineError(setInlineBatchError, 'Select rows first — check the boxes on the left of the table.');
      return;
    }
    setRows((current) => {
      const dupes = [...selectedRows].sort((a, b) => a - b).map((i) => ({ ...current[i], spot_id: '' }));
      const next = [...current, ...dupes];
      validateRows(next);
      return next;
    });
    setSelectedRows(new Set());
    setStatusTone('success');
    setStatusMessage(`Duplicated ${selectedRows.size} row(s). Spot IDs cleared — fill them in or use Generate Spot IDs.`);
  };

  const deleteSelectedRows = () => {
    if (selectedRows.size === 0) {
      showInlineError(setInlineBatchError, 'Select rows first — check the boxes on the left of the table.');
      return;
    }

    const next = rows.filter((_, index) => !selectedRows.has(index));
    setRows(next);
    setSelectedRows(new Set());
    validateRows(next);
    setStatusTone('success');
    setStatusMessage('Selected rows were removed from the staging sheet.');
  };

  const doPublish = async (status: 'draft' | 'published') => {
    setPublishing(true);
    try {
      const response = await fetch('/api/ot/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, batchName, batchId: activeBatchId, status, dateFormat }),
      });
      const payload = (await response.json()) as { batch?: DraftBatch; error?: string; message?: string };
      if (!response.ok || !payload.batch) throw new Error(payload.error ?? 'Unable to save OT batch.');

      if (status === 'draft') {
        setActiveBatchId(payload.batch.id);
        setDrafts((current) => [payload.batch!, ...current.filter((draft) => draft.id !== payload.batch!.id)].slice(0, 6));
      } else {
        setRows([]);
        setColumns([...CORE_OT_COLUMNS]);
        setBatchName('');
        setActiveBatchId(null);
        setSelectedRows(new Set());
        setDrafts((current) => current.filter((draft) => draft.id !== payload.batch!.id));
      }

      setStatusTone('success');
      setStatusMessage(payload.message ?? (status === 'draft' ? 'Draft saved.' : 'OT slots published.'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save OT batch.');
    } finally {
      setPublishing(false);
    }
  };

  const handlePersist = (status: 'draft' | 'published') => {
    if (rows.length === 0) {
      setStatusTone('warning');
      setStatusMessage('Add at least one OT row first.');
      return;
    }
    if (validateRows(rows).length > 0) {
      setStatusTone('warning');
      setStatusMessage('Fix the highlighted issues before continuing.');
      return;
    }
    if (hasMissingIDs) {
      setPendingPublish(status);
      return;
    }
    void doPublish(status);
  };

  const doDeleteDraft = async (draftId: string) => {
    const response = await fetch(`/api/ot/drafts/${draftId}`, { method: 'DELETE' });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      toast.error(payload.error ?? 'Unable to delete the draft.');
      return;
    }
    setDrafts((current) => current.filter((draft) => draft.id !== draftId));
    if (activeBatchId === draftId) {
      setRows([]);
      setColumns([...CORE_OT_COLUMNS]);
      setBatchName('');
      setActiveBatchId(null);
    }
  };

  const handleDeleteDraft = (draftId: string) => setDeleteDraftConfirm(draftId);

  const draftSummary = useMemo(() => drafts.map((draft) => ({ ...draft, rowCount: Array.isArray(draft.csv_data) ? draft.csv_data.length : 0 })), [drafts]);
  const hasError = (rowIndex: number, field: string) => errors.some((error) => error.row === rowIndex && error.field === field);

  return (
    <div>
      <div className="staging-header animate-fade-in">
        <div>
          <h1 className="staging-title">OT Staging Editor</h1>
          <p className="staging-subtitle">CSV, pasted tables, OCR beta, manual editing, Mini FX, and drafts in one place.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <ModernSelect
            value={dateFormat}
            onValueChange={v => setDateFormat(v as OTDateFormat)}
            options={DATE_FORMAT_OPTIONS}
          />
          <button className="btn btn-ghost" onClick={addRow}><Table2 size={15} /> Manual Sheet</button>
          <button className="btn btn-modern" onClick={() => void handlePersist('draft')} disabled={publishing || rows.length === 0}><Save size={15} /> Save Draft</button>
          <button className="btn btn-primary" onClick={() => void handlePersist('published')} disabled={publishing || rows.length === 0}>{publishing ? 'Working...' : <><Send size={15} /> Publish Live</>}</button>
        </div>
      </div>

      <input
        ref={uploadRef}
        type="file"
        accept=".csv,.txt,image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            handlePickedFile(file);
          }
          event.currentTarget.value = '';
        }}
      />

      {statusMessage && (
        <div className={statusTone === 'success' ? 'success-banner' : 'warning-banner'}>
          {statusTone === 'success' ? (
            <CheckCircle2 size={18} style={{ color: 'var(--status-available)' }} />
          ) : (
            <AlertCircle size={18} />
          )}
          <span>{statusMessage}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, 0.9fr)', gap: '1rem', marginBottom: '1rem' }} className="staging-grid">
        <section className="card" style={{ padding: '1rem 1.1rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 700 }}>Import Options</h2>
            <p className="text-muted" style={{ margin: 0, fontSize: '0.8125rem' }}>Use CSV/TXT, paste copied rows, or try photo OCR beta.</p>
          </div>
          <div
            className={`dropzone ${dragKind ? 'dropzone-dragging' : ''} ${ocrBusy ? 'dropzone-disabled' : ''}`}
            onClick={() => !ocrBusy && uploadRef.current?.click()}
            onDragOver={!ocrBusy ? handleDropzoneDragOver : undefined}
            onDragLeave={!ocrBusy ? handleDropzoneDragLeave : undefined}
            onDrop={!ocrBusy ? handleDropzoneDrop : undefined}
            role="button"
            tabIndex={ocrBusy ? -1 : 0}
            aria-disabled={ocrBusy}
            onKeyDown={(event) => {
              if (!ocrBusy && (event.key === 'Enter' || event.key === ' ')) {
                uploadRef.current?.click();
              }
            }}
          >
            <div className="dropzone-icon">
              {dragKind === 'image' ? (
                <FileImage size={34} style={{ color: 'var(--brand-primary-light)' }} />
              ) : dragKind === 'csv' ? (
                <FileSpreadsheet size={34} style={{ color: 'var(--brand-primary-light)' }} />
              ) : (
                <div className="dropzone-icon-duo">
                  <FileSpreadsheet size={28} style={{ color: 'var(--brand-primary-light)' }} />
                  <FileImage size={28} style={{ color: 'rgba(148,163,184,0.9)' }} />
                </div>
              )}
            </div>
            <h3 style={{ margin: '0 0 0.35rem' }}>Drop your CSV/TXT or Image file here</h3>
            <p className="text-muted" style={{ margin: 0 }}>
              or click to browse. CSV/TXT with headers + images supported.
            </p>

            <div style={{ marginTop: '0.9rem', width: '100%' }}>
              <TransferProgress state={transfer.state} />
            </div>
          </div>
          <div style={{ marginTop: '1rem' }}>
            <label className="meta-label">Paste Table Text</label>
            <textarea className="textarea" value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder="Paste CSV content or copied spreadsheet rows here..." />
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={parsePastedText}><FileSpreadsheet size={15} /> Import pasted rows</button>
              <button className="btn btn-ghost" onClick={() => { setOcrSummary(null); loadRows([createEmptyOTRow(columns)], batchName || 'manual_table', null); }}><Plus size={15} /> Start blank table</button>
            </div>
          </div>
          <div style={{ marginTop: '1rem' }}>
            <label className="meta-label">OCR Extraction</label>
            <div className="ocr-summary-card">
              {ocrSummary ? (
                <>
                  <div className="ocr-summary-header">
                    <CheckCircle2 size={18} style={{ color: 'var(--status-available)' }} />
                    <div>
                      <strong>Information extracted successfully</strong>
                      <div className="text-muted" style={{ fontSize: '0.8125rem' }}>
                        {ocrSummary.fileName} - {ocrSummary.method} - {ocrSummary.confidence}% confidence - {ocrSummary.layout}
                      </div>
                    </div>
                  </div>
                  <div className="ocr-summary-metrics">
                    <div className="ocr-metric-chip">
                      <span>Rows</span>
                      <strong>{ocrSummary.rowCount}</strong>
                    </div>
                    <div className="ocr-metric-chip">
                      <span>Columns</span>
                      <strong>{ocrSummary.columns.length}</strong>
                    </div>
                  </div>
                  <div className="ocr-column-list">
                    {ocrSummary.columns.map((column) => (
                      <span key={column} className="ocr-column-chip">{column}</span>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-muted" style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
                  {ocrBusy
                    ? 'Reading the image and organizing the OT rows...'
                    : 'When OCR finishes, the important OT information will appear directly in the editor below.'}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="card" style={{ padding: '1rem 1.1rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 700 }}>Drafts</h2>
            <p className="text-muted" style={{ margin: 0, fontSize: '0.8125rem' }}>Load unfinished OT batches and continue editing.</p>
          </div>
          {draftSummary.length === 0 ? <div className="text-muted" style={{ fontSize: '0.8125rem' }}>No OT drafts saved yet.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {draftSummary.map((draft) => (
                <div key={draft.id} style={{ display: 'flex', gap: '0.5rem', border: activeBatchId === draft.id ? '1px solid rgba(99,102,241,0.45)' : '1px solid var(--border-subtle)', borderRadius: 12, background: 'var(--bg-elevated)', padding: '0.5rem' }}>
                  <button type="button" style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }} onClick={() => { setOcrSummary(null); loadRows((draft.csv_data as CSVRow[]) ?? [], draft.name, draft.id); }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{draft.name}</div>
                    <div className="text-muted" style={{ fontSize: '0.8125rem' }}>{draft.rowCount} row(s) - created {new Date(draft.created_at).toLocaleDateString()}</div>
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ color: '#f87171' }} onClick={() => handleDeleteDraft(draft.id)}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {rows.length > 0 && (
        <>
          <div className="card" style={{ padding: '1rem 1.1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <label className="meta-label">Batch Name</label>
                <input className="input" value={batchName} onChange={(event) => setBatchName(event.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div><strong>{rows.length}</strong> <span className="text-muted">rows</span></div>
                <div><strong>{columns.length}</strong> <span className="text-muted">columns</span></div>
                <div><strong style={{ color: errors.length > 0 ? 'var(--status-claimed)' : 'var(--status-available)' }}>{errors.length}</strong> <span className="text-muted">issues</span></div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
              <button className="btn btn-ghost" onClick={addRow}><Plus size={15} /> Add row</button>
              <button className="btn btn-ghost" onClick={addColumn}><Table2 size={15} /> Add column</button>
              <button className="btn btn-ghost" onClick={() => setRows((current) => current.map((row) => String(row.spot_id ?? '').trim() ? row : { ...row, spot_id: `${Math.floor(10000 + Math.random() * 90000)}` }))} disabled={!hasMissingIDs}><Wand2 size={15} /> Generate Spot IDs</button>
              <button className="btn btn-ghost" onClick={() => { setRows([]); setColumns([...CORE_OT_COLUMNS]); setBatchName(''); setActiveBatchId(null); setSelectedRows(new Set()); setErrors([]); setStatusMessage(null); setOcrSummary(null); }}><RefreshCw size={15} /> Clear sheet</button>
            </div>
            <div className="staging-tool-grid">
              {/* ── Batch Edit ─────────────────────────────────────────── */}
              <section className="staging-tool-card">
                <div className="staging-tool-head">
                  <div>
                    <h3 className="staging-tool-title">Batch Edit</h3>
                    <p className="staging-tool-copy">Update many rows at once. Select rows using the checkboxes, then apply a change.</p>
                  </div>
                  <div className={`staging-selection-pill ${selectedRowCount > 0 ? 'staging-selection-pill-active' : ''}`}>
                    {selectedRowCount > 0 ? `${selectedRowCount} selected` : 'No rows selected'}
                  </div>
                </div>

                {/* Quick presets */}
                <div>
                  <span className="staging-batch-section-label">Quick presets</span>
                  <div className="staging-preset-row" style={{ marginTop: '0.45rem' }}>
                    {BULK_FILL_PRESETS.map((preset) => (
                      <button
                        key={`${preset.column}-${preset.value}`}
                        type="button"
                        className="staging-pill-btn"
                        onClick={() => applyBulkPreset(preset.column, preset.value)}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="staging-batch-divider" />

                {/* Section 1 — Fill column value */}
                <div>
                  <span className="staging-batch-section-label">Fill column value</span>
                  <p className="staging-batch-section-desc">Choose a column, pick which rows to update, enter the new value, then click Apply.</p>
                  <div className="staging-tool-fields" style={{ marginTop: '0.55rem' }}>
                    <label className="staging-tool-field">
                      <span>Column</span>
                      <ModernSelect
                        value={bulkEditColumn}
                        onValueChange={setBulkEditColumn}
                        options={columns.map(column => ({
                          label: getOTColumnLabel(column),
                          value: column
                        }))}
                      />
                    </label>
                    <label className="staging-tool-field">
                      <span>Apply to</span>
                      <ModernSelect
                        value={bulkEditScope}
                        onValueChange={v => setBulkEditScope(v as BulkEditScope)}
                        options={[
                          { label: 'Selected rows only', value: 'selected' },
                          { label: 'Entire table', value: 'all' },
                          { label: 'Blank cells only', value: 'blank-only' }
                        ]}
                      />
                    </label>
                    <label className="staging-tool-field staging-tool-field-wide">
                      <span>New value</span>
                      {bulkEditInputType === 'date' ? (
                        <ModernDatePicker date={bulkEditValue} onDateChange={setBulkEditValue} />
                      ) : bulkEditInputType === 'time' ? (
                        <ModernTimePicker time={bulkEditValue} onTimeChange={setBulkEditValue} />
                      ) : (
                        <input
                          className="input"
                          type={bulkEditInputType}
                          step={bulkEditInputType === 'number' ? '0.1' : undefined}
                          value={bulkEditValue}
                          onChange={(event) => setBulkEditValue(event.target.value)}
                          placeholder="Type the value to apply across rows"
                        />
                      )}
                    </label>
                  </div>
                  <div className="staging-tool-actions" style={{ marginTop: '0.65rem' }}>
                    <button className="btn" onClick={() => applyBulkEdit('set')}>Apply value</button>
                    <button className="btn btn-ghost" onClick={() => applyBulkEdit('clear')}>Clear field</button>
                  </div>
                  {inlineBatchError && (
                    <p className="staging-inline-error">{inlineBatchError}</p>
                  )}
                </div>

                <div className="staging-batch-divider" />

                {/* Section 2 — Set schedule times */}
                <div>
                  <span className="staging-batch-section-label">Set schedule times</span>
                  <p className="staging-batch-section-desc">Pick times below, select rows in the table, then click Apply.</p>
                  <div className="staging-inline-time-fields" style={{ marginTop: '0.55rem' }}>
                    <label className="staging-tool-field">
                      <span>Start time</span>
                      <ModernTimePicker
                        time={bulkTime.start_time}
                        onTimeChange={v => setBulkTime(current => ({ ...current, start_time: v }))}
                      />
                    </label>
                    <label className="staging-tool-field">
                      <span>End time</span>
                      <ModernTimePicker
                        time={bulkTime.end_time}
                        onTimeChange={v => setBulkTime(current => ({ ...current, end_time: v }))}
                      />
                    </label>
                  </div>
                  <div className="staging-tool-actions" style={{ marginTop: '0.65rem' }}>
                    <button className="btn btn-ghost" onClick={handleBulkUpdate}>Apply to selected</button>
                  </div>
                  {inlineTimeError && (
                    <p className="staging-inline-error">{inlineTimeError}</p>
                  )}
                </div>

                <div className="staging-batch-divider" />

                {/* Section 3 — Row actions */}
                <div>
                  <span className="staging-batch-section-label">Row actions</span>
                  <div className="staging-tool-actions" style={{ marginTop: '0.45rem' }}>
                    <button className="btn btn-ghost" onClick={duplicateSelectedRows}><Copy size={14} /> Duplicate selected</button>
                    <button className="btn btn-ghost staging-danger-btn" onClick={deleteSelectedRows}><Trash2 size={14} /> Delete selected</button>
                  </div>
                </div>
              </section>

              {/* ── Formula Assistant ────────────────────────────────────── */}
              <section className="staging-tool-card">
                <div className="staging-tool-head">
                  <div>
                    <h3 className="staging-tool-title">Formula Assistant</h3>
                    <p className="staging-tool-copy">Auto-calculate shift labels, durations, and repeated values — no manual typing needed.</p>
                  </div>
                  <div className="staging-selection-pill">Mini FX</div>
                </div>

                {/* Formula cards */}
                <div>
                  <span className="staging-batch-section-label">Click a formula to use it</span>
                  <div className="staging-formula-cards" style={{ marginTop: '0.5rem' }}>
                    {FORMULA_CARDS.map((card) => (
                      <button
                        key={card.formula}
                        type="button"
                        className={`staging-formula-card ${formulaInput === card.formula ? 'staging-formula-card-active' : ''}`}
                        onClick={() => setFormulaInput(card.formula)}
                        title={card.description}
                      >
                        <span className="staging-formula-card-icon">{card.icon}</span>
                        <span className="staging-formula-card-label">{card.label}</span>
                        <code className="staging-formula-card-code">{card.formula.split('(')[0]}(…)</code>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="staging-batch-divider" />

                {/* FX input */}
                <div>
                  <span className="staging-batch-section-label">Formula expression</span>
                  <div className="staging-formula-input-wrap" style={{ marginTop: '0.45rem' }}>
                    <div className="staging-fx-badge">FX</div>
                    <input
                      className="input"
                      value={formulaInput}
                      onChange={(event) => setFormulaInput(event.target.value)}
                      placeholder="=SHIFT(start_time)"
                    />
                  </div>
                  {(() => {
                    const desc = Object.entries(FORMULA_DESCRIPTIONS).find(([key]) => formulaInput.toUpperCase().startsWith(key.toUpperCase()));
                    return desc ? <p className="staging-formula-desc">{desc[1]}</p> : null;
                  })()}
                </div>

                {/* Target + scope */}
                <div className="staging-tool-fields">
                  <label className="staging-tool-field">
                    <span>Target column</span>
                    <ModernSelect
                      value={formulaColumn}
                      onValueChange={setFormulaColumn}
                      options={columns.map(column => ({
                        label: getOTColumnLabel(column),
                        value: column
                      }))}
                    />
                  </label>
                  <label className="staging-tool-field">
                    <span>Apply to</span>
                    <ModernSelect
                      value={formulaScope}
                      onValueChange={v => setFormulaScope(v as FormulaScope)}
                      options={[
                        { label: 'Selected rows (☑)', value: 'selected' },
                        { label: 'Entire table', value: 'all' },
                        { label: 'Blank cells only', value: 'blank-only' }
                      ]}
                    />
                  </label>
                </div>

                <div className="staging-tool-actions">
                  <button className="btn" onClick={handleApplyFormula}>Apply formula</button>
                </div>
              </section>
            </div>
          </div>

          {errors.length > 0 && <div className="warning-banner"><AlertCircle size={18} /><span>There are validation issues in the sheet. Review highlighted cells before publishing.</span></div>}

          <div className="card" style={{ padding: 0, overflow: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <label className="checkbox-container">
                      <input
                        type="checkbox"
                        checked={selectedRows.size === rows.length && rows.length > 0}
                        onChange={() =>
                          setSelectedRows(
                            selectedRows.size === rows.length
                              ? new Set()
                              : new Set(rows.map((_, index) => index)),
                          )
                        }
                      />
                      <span className="checkbox-checkmark"></span>
                    </label>
                  </th>
                  <th style={{ width: 48 }}>#</th>
                  {columns.map((column) => (
                    <th key={column}>
                      <div className="staging-column-head">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 0 }}>
                          <span>{getOTColumnLabel(column)}</span>
                          {ocrImageColumns.has(column) && (
                            <span className="staging-ocr-col-badge">FROM IMAGE</span>
                          )}
                        </div>
                        {!CORE_OT_COLUMNS.includes(column as (typeof CORE_OT_COLUMNS)[number]) && (
                          <button
                            type="button"
                            className="staging-column-delete-btn"
                            onClick={() => requestDeleteColumn(column)}
                            aria-label={`Delete ${getOTColumnLabel(column)} column`}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                  <th style={{ width: 60 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={`${row.spot_id ?? 'row'}-${rowIndex}`} style={{ background: selectedRows.has(rowIndex) ? 'rgba(255,255,255,0.03)' : undefined }}>
                    <td>
                      <label className="checkbox-container">
                        <input
                          type="checkbox"
                          checked={selectedRows.has(rowIndex)}
                          onChange={() =>
                            setSelectedRows((current) => {
                              const next = new Set(current);
                              if (next.has(rowIndex)) next.delete(rowIndex);
                              else next.add(rowIndex);
                              return next;
                            })
                          }
                        />
                        <span className="checkbox-checkmark"></span>
                      </label>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{rowIndex + 1}</td>
                    {columns.map((column) => {
                      const value = String(row[column] ?? '');
                      const isDate = column === 'date';
                      const isTime = column === 'start_time' || column === 'end_time';
                      const isDuration = column === 'duration_hrs';
                      return (
                        <td key={`${column}-${rowIndex}`} style={{ background: hasError(rowIndex, column) ? 'rgba(239,68,68,0.08)' : undefined }}>
                          {isDate ? (
                            <ModernDatePicker
                              date={value}
                              onDateChange={v => updateCell(rowIndex, column, v)}
                              variant="ghost"
                            />
                          ) : isTime ? (
                            <ModernTimePicker
                              time={value}
                              onTimeChange={v => updateCell(rowIndex, column, v)}
                              variant="ghost"
                            />
                          ) : (
                            <input
                              type={isDuration ? 'number' : 'text'}
                              value={value}
                              step={isDuration ? '0.1' : undefined}
                              readOnly={isDuration}
                              onChange={(event) => updateCell(rowIndex, column, event.target.value)}
                              className="staging-cell-input"
                            />
                          )}
                        </td>
                      );
                    })}
                    <td><button className="btn btn-ghost btn-sm" style={{ color: '#f87171' }} onClick={() => deleteRow(rowIndex)}><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {ocrReview && (() => {
        const missingIssues = ocrReview.issues.filter((i) => i.type === 'missing-field');
        const ambiguousStartIssues = ocrReview.issues.filter((i) => i.type === 'ambiguous-time' && i.field === 'start_time');
        const ambiguousEndIssues = ocrReview.issues.filter((i) => i.type === 'ambiguous-time' && i.field === 'end_time');
        const ambiguousIssues = [...ambiguousStartIssues, ...ambiguousEndIssues];
        const cleanRows = ocrReview.summary.rowCount - new Set(ocrReview.issues.map((i) => i.rowIndex)).size;
        const canLoad = ambiguousIssues.length === 0 || (
          (ambiguousStartIssues.length === 0 || ocrStartMeridiem !== null) &&
          (ambiguousEndIssues.length === 0 || ocrEndMeridiem !== null)
        );
        return (
          <div className="modal-overlay" onClick={() => { setOcrReview(null); setOcrStartMeridiem(null); setOcrEndMeridiem(null); }}>
            <div className="modal staging-modal ocr-review-modal" onClick={(e) => e.stopPropagation()}>
              <div className="staging-modal-kicker">OCR Review</div>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                Fields need attention before loading
              </h3>
              <p className="text-muted" style={{ margin: 0, lineHeight: 1.7 }}>
                <strong>{ocrReview.summary.rowCount}</strong> row(s) detected from <strong>{ocrReview.fileName}</strong>.{' '}
                {cleanRows > 0 && <><strong style={{ color: 'var(--status-available)' }}>{cleanRows}</strong> complete, </>}
                <strong style={{ color: '#fbbf24' }}>{ocrReview.issues.length}</strong> field(s) need attention.
              </p>

              {missingIssues.length > 0 && (
                <div className="ocr-review-card">
                  <div className="ocr-review-card-header">
                    <span className="ocr-review-badge ocr-review-badge-warn">Missing</span>
                    <strong style={{ fontSize: '0.875rem' }}>Fields not detected by OCR</strong>
                  </div>
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    These fields will be <strong>blank</strong> — you can fill them in the editor after loading.
                  </p>
                  <ul className="ocr-review-list">
                    {missingIssues.slice(0, 12).map((issue, index) => (
                      <li key={`${issue.rowIndex}-${issue.field}-${index}`}>
                        Row {issue.rowIndex + 1}: <strong>{getOTColumnLabel(issue.field)}</strong> not detected
                      </li>
                    ))}
                    {missingIssues.length > 12 && (
                      <li style={{ color: 'var(--text-muted)' }}>…and {missingIssues.length - 12} more</li>
                    )}
                  </ul>
                </div>
              )}

              {ambiguousIssues.length > 0 && (
                <div className="ocr-review-card">
                  <div className="ocr-review-card-header">
                    <span className="ocr-review-badge ocr-review-badge-info">AM / PM</span>
                    <strong style={{ fontSize: '0.875rem' }}>Times without AM / PM indicator</strong>
                  </div>
                  <p style={{ margin: '0 0 0.75rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    Select AM or PM for each group below. Start and end times can be different.
                  </p>

                  {ambiguousStartIssues.length > 0 && (
                    <div className="ocr-meridiem-group">
                      <div className="ocr-meridiem-group-header">
                        <span className="ocr-meridiem-label">Start Time</span>
                        <span className="ocr-meridiem-samples">
                          {[...new Set(ambiguousStartIssues.slice(0, 4).map((i) => i.type === 'ambiguous-time' ? i.rawValue : ''))].join(', ')}
                          {ambiguousStartIssues.length > 4 ? ` +${ambiguousStartIssues.length - 4} more` : ''}
                        </span>
                      </div>
                      <div className="ocr-meridiem-toggle">
                        <button
                          className={`btn btn-sm ${ocrStartMeridiem === 'am' ? 'btn-primary' : 'btn-ghost'}`}
                          onClick={() => setOcrStartMeridiem(ocrStartMeridiem === 'am' ? null : 'am')}
                        >
                          AM
                        </button>
                        <button
                          className={`btn btn-sm ${ocrStartMeridiem === 'pm' ? 'btn-primary' : 'btn-ghost'}`}
                          onClick={() => setOcrStartMeridiem(ocrStartMeridiem === 'pm' ? null : 'pm')}
                        >
                          PM
                        </button>
                      </div>
                    </div>
                  )}

                  {ambiguousEndIssues.length > 0 && (
                    <div className="ocr-meridiem-group">
                      <div className="ocr-meridiem-group-header">
                        <span className="ocr-meridiem-label">End Time</span>
                        <span className="ocr-meridiem-samples">
                          {[...new Set(ambiguousEndIssues.slice(0, 4).map((i) => i.type === 'ambiguous-time' ? i.rawValue : ''))].join(', ')}
                          {ambiguousEndIssues.length > 4 ? ` +${ambiguousEndIssues.length - 4} more` : ''}
                        </span>
                      </div>
                      <div className="ocr-meridiem-toggle">
                        <button
                          className={`btn btn-sm ${ocrEndMeridiem === 'am' ? 'btn-primary' : 'btn-ghost'}`}
                          onClick={() => setOcrEndMeridiem(ocrEndMeridiem === 'am' ? null : 'am')}
                        >
                          AM
                        </button>
                        <button
                          className={`btn btn-sm ${ocrEndMeridiem === 'pm' ? 'btn-primary' : 'btn-ghost'}`}
                          onClick={() => setOcrEndMeridiem(ocrEndMeridiem === 'pm' ? null : 'pm')}
                        >
                          PM
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="staging-modal-actions">
                <button
                  className="btn btn-ghost"
                  onClick={() => { setOcrReview(null); setOcrStartMeridiem(null); setOcrEndMeridiem(null); uploadRef.current?.click(); }}
                >
                  Try another image
                </button>
                <button className="btn btn-ghost" onClick={() => { finalizeOcrReview({ start_time: null, end_time: null }); setOcrStartMeridiem(null); setOcrEndMeridiem(null); }}>
                  Load with blanks
                </button>
                <button
                  className="btn btn-primary"
                  disabled={!canLoad}
                  onClick={() => { finalizeOcrReview({ start_time: ocrStartMeridiem, end_time: ocrEndMeridiem }); setOcrStartMeridiem(null); setOcrEndMeridiem(null); }}
                >
                  {canLoad ? 'Load sheet' : 'Select AM / PM above'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {deleteColumnModal && (
        <div className="modal-overlay" onClick={() => setDeleteColumnModal(null)}>
          <div className="modal staging-modal" onClick={(event) => event.stopPropagation()}>
            <div className="staging-modal-kicker">Delete Column</div>
            <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
              Remove <span className="gradient-text">{getOTColumnLabel(deleteColumnModal)}</span> from this sheet?
            </h3>
            <p className="text-muted" style={{ margin: 0, lineHeight: 1.7 }}>
              This will delete the full column and every value inside it for the current staging table.
            </p>
            <div className="staging-modal-actions">
              <button className="btn btn-ghost" onClick={() => setDeleteColumnModal(null)}>
                Cancel
              </button>
              <button className="btn btn-ghost staging-danger-btn" onClick={confirmDeleteColumn}>
                <Trash2 size={15} />
                Delete column
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .staging-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; }
        .staging-title { font-size: 1.875rem; font-weight: 800; letter-spacing: -0.03em; margin: 0 0 0.25rem; }
        .staging-subtitle { color: var(--text-secondary); font-size: 0.9375rem; margin: 0; }
        .success-banner, .warning-banner { display: flex; align-items: center; gap: 0.75rem; border-radius: 12px; padding: 0.9rem 1rem; margin-bottom: 1rem; }
        .success-banner { background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2); }
        .warning-banner { background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.2); color: #fbbf24; }
        .dropzone { border: 1px dashed var(--border-default); border-radius: 16px; padding: 1.5rem; text-align: center; cursor: pointer; background: rgba(255,255,255,0.02); }
        .dropzone:hover { border-color: rgba(99,102,241,0.5); background: rgba(99,102,241,0.06); }
        .dropzone-dragging { border-color: rgba(99,102,241,0.7); background: rgba(99,102,241,0.08); }
        .dropzone-icon { width: 64px; height: 64px; border-radius: 18px; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem; background: rgba(99,102,241,0.12); }
        .dropzone-icon-duo { display: inline-flex; align-items: center; justify-content: center; gap: 0.55rem; }
        .meta-label { display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 0.35rem; }
        .textarea { width: 100%; min-height: 130px; border-radius: 12px; border: 1px solid var(--border-subtle); background: var(--bg-elevated); color: var(--text-primary); font-family: inherit; font-size: 0.875rem; padding: 0.85rem; }
        .textarea { resize: vertical; }
        .ocr-summary-card { border-radius: 16px; border: 1px solid rgba(16, 185, 129, 0.18); background: linear-gradient(145deg, rgba(16, 185, 129, 0.08), rgba(99, 102, 241, 0.06)); padding: 1rem; display: grid; gap: 0.9rem; min-height: 130px; }
        .ocr-summary-header { display: flex; align-items: flex-start; gap: 0.75rem; }
        .ocr-summary-metrics { display: flex; gap: 0.75rem; flex-wrap: wrap; }
        .ocr-metric-chip { min-width: 110px; padding: 0.75rem 0.85rem; border-radius: 12px; border: 1px solid var(--border-subtle); background: rgba(11, 13, 20, 0.3); display: grid; gap: 0.2rem; }
        .ocr-metric-chip span { font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
        .ocr-column-list { display: flex; flex-wrap: wrap; gap: 0.5rem; }
        .ocr-column-chip { padding: 0.38rem 0.65rem; border-radius: 999px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); font-size: 0.76rem; color: var(--text-secondary); }
        .ocr-review-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.85rem; margin-top: 0.35rem; }
        .ocr-review-card { border-radius: 14px; border: 1px solid var(--border-subtle); background: rgba(255,255,255,0.03); padding: 0.85rem; display: grid; gap: 0.55rem; }
        .ocr-review-card-header { display: flex; align-items: center; gap: 0.55rem; }
        .ocr-review-badge { display: inline-block; padding: 0.25rem 0.6rem; border-radius: 999px; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
        .ocr-review-badge-warn { background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.3); color: #fbbf24; }
        .ocr-review-badge-info { background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.3); color: var(--brand-primary-light); }
        .ocr-review-list { margin: 0; padding-left: 1rem; color: var(--text-secondary); font-size: 0.82rem; line-height: 1.6; }
        .ocr-review-modal { max-width: 520px; }
        .ocr-meridiem-group { border: 1px solid var(--border-subtle); border-radius: 12px; padding: 0.75rem; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
        .ocr-meridiem-group-header { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; flex: 1; }
        .ocr-meridiem-label { font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); }
        .ocr-meridiem-samples { font-size: 0.76rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ocr-meridiem-toggle { display: flex; gap: 0.4rem; flex-shrink: 0; }
        .staging-batch-section-label { font-size: 0.74rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-muted); }
        .staging-batch-section-desc { margin: 0.25rem 0 0; font-size: 0.8rem; color: var(--text-muted); line-height: 1.5; }
        .staging-batch-divider { height: 1px; background: var(--border-subtle); margin: 0.25rem 0; }
        .staging-inline-error { margin: 0.4rem 0 0; font-size: 0.78rem; color: #fca5a5; font-weight: 600; }
        .staging-selection-pill-active { background: rgba(99,102,241,0.25) !important; border-color: rgba(99,102,241,0.55) !important; color: #fff !important; }
        .staging-formula-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.55rem; }
        .staging-formula-card { display: flex; flex-direction: column; gap: 0.3rem; padding: 0.65rem 0.75rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.09); background: rgba(255,255,255,0.03); cursor: pointer; text-align: left; transition: border-color 0.18s ease, background 0.18s ease; }
        .staging-formula-card:hover { border-color: rgba(99,102,241,0.4); background: rgba(99,102,241,0.07); }
        .staging-formula-card-active { border-color: rgba(99,102,241,0.55) !important; background: rgba(99,102,241,0.12) !important; }
        .staging-formula-card-icon { display: flex; align-items: center; color: var(--brand-primary-light); opacity: 0.85; }
        .staging-formula-card-label { font-size: 0.78rem; font-weight: 700; color: var(--text-primary); line-height: 1.3; }
        .staging-formula-card-code { font-family: monospace; font-size: 0.7rem; color: var(--text-muted); background: rgba(0,0,0,0.25); border-radius: 5px; padding: 0.1rem 0.35rem; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .staging-formula-desc { font-size: 0.78rem; color: var(--brand-primary-light); background: rgba(99,102,241,0.08); border-radius: 8px; padding: 0.5rem 0.75rem; margin-top: 0.45rem; border: 1px solid rgba(99,102,241,0.2); }
        .staging-tool-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin-top: 1rem; }
        .staging-tool-card { border: 1px solid var(--border-subtle); border-radius: 18px; background: linear-gradient(160deg, rgba(99,102,241,0.08), rgba(11,13,20,0.34)); padding: 1rem; display: grid; gap: 0.95rem; }
        .staging-tool-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
        .staging-tool-title { margin: 0 0 0.25rem; font-size: 1rem; font-weight: 800; }
        .staging-tool-copy { margin: 0; color: var(--text-secondary); font-size: 0.82rem; line-height: 1.55; }
        .staging-selection-pill { padding: 0.45rem 0.75rem; border-radius: 999px; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.25); color: var(--brand-primary-light); font-size: 0.76rem; font-weight: 700; white-space: nowrap; }
        .staging-tool-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
        .staging-tool-field { display: grid; gap: 0.35rem; }
        .staging-tool-field span { font-size: 0.74rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
        .staging-tool-field-wide { grid-column: 1 / -1; }
        .staging-tool-actions { display: flex; gap: 0.65rem; flex-wrap: wrap; }
        .staging-inline-time-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
        .staging-preset-row { display: flex; flex-wrap: wrap; gap: 0.55rem; }
        .staging-pill-btn {
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-primary);
          padding: 0.42rem 0.85rem;
          border-radius: 999px;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          backdrop-filter: blur(8px);
        }
        .staging-pill-btn:hover {
          background: rgba(99, 102, 241, 0.1);
          border-color: rgba(99, 102, 241, 0.4);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }
        .staging-formula-input-wrap { display: flex; gap: 0.75rem; align-items: center; }
        .staging-fx-badge { width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 800; background: rgba(99,102,241,0.15); color: var(--brand-primary-light); flex-shrink: 0; }
        .staging-formula-help { display: grid; gap: 0.55rem; }
        .staging-formula-help strong { font-size: 0.8rem; color: var(--text-secondary); }
        .staging-column-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.45rem; }
        .staging-column-delete-btn { width: 26px; height: 26px; border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.1); color: #f87171; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease; flex-shrink: 0; }
        .staging-column-delete-btn:hover { background: rgba(239, 68, 68, 0.2); border-color: rgba(239, 68, 68, 0.5); color: #fecaca; }
        .staging-ocr-col-badge { font-size: 0.62rem; font-weight: 800; letter-spacing: 0.07em; text-transform: uppercase; color: var(--brand-primary-light); background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.25); border-radius: 4px; padding: 0.08rem 0.35rem; display: inline-block; }
        .staging-modal { max-width: 480px; display: grid; gap: 1rem; }
        .staging-modal-kicker { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); }
        .staging-modal-actions { display: flex; justify-content: flex-end; gap: 0.75rem; flex-wrap: wrap; }
        .staging-danger-btn { color: #fca5a5; border-color: rgba(239, 68, 68, 0.25); }
        .staging-danger-btn:hover { background: rgba(239, 68, 68, 0.08); color: #fecaca; }
        @media (max-width: 1080px) { .staging-grid { grid-template-columns: 1fr !important; } .staging-header { flex-direction: column; } .staging-tool-grid { grid-template-columns: 1fr; } .ocr-review-grid { grid-template-columns: 1fr; } }
        @media (max-width: 720px) { .staging-tool-fields, .staging-inline-time-fields { grid-template-columns: 1fr; } .staging-formula-input-wrap { align-items: stretch; flex-direction: column; } }
      `}</style>

      {pendingPublish && (
        <ConfirmDialog
          title="Missing Spot IDs"
          body="Some rows still have no Spot ID. Continue anyway?"
          confirmLabel="Continue"
          tone="default"
          busy={publishing}
          onConfirm={async () => {
            const status = pendingPublish;
            setPendingPublish(null);
            await doPublish(status);
          }}
          onCancel={() => setPendingPublish(null)}
        />
      )}

      {deleteDraftConfirm && (
        <ConfirmDialog
          title="Delete OT draft"
          body="This will permanently delete the draft and all its rows."
          confirmLabel="Delete"
          tone="danger"
          onConfirm={async () => {
            const id = deleteDraftConfirm;
            setDeleteDraftConfirm(null);
            await doDeleteDraft(id);
          }}
          onCancel={() => setDeleteDraftConfirm(null)}
        />
      )}

      {addColumnModal && (
        <PromptDialog
          title="Add column"
          placeholder="Column name"
          confirmLabel="Add"
          required
          error={addColumnError}
          onConfirm={(label) => {
            const ok = doAddColumn(label);
            if (ok) setAddColumnModal(false);
          }}
          onCancel={() => { setAddColumnModal(false); setAddColumnError(null); }}
        />
      )}
    </div>
  );
}
