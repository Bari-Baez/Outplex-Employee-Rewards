'use client';

import { useMemo, useRef, useState, type DragEvent } from 'react';
import Papa from 'papaparse';
import {
  AlertCircle,
  CheckCircle2,
  FileImage,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Save,
  Send,
  Table2,
  Trash2,
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
  parseOcrTextToRows,
  sanitizeOTRows,
} from '@/lib/ot';
import { normalizeCSVHeaders, type OTDateFormat } from '@/lib/utils';
import { readFileAsDataUrlWithProgress, readFileAsTextWithProgress } from '@/lib/file-transfer';

type ValidationError = { row: number; field: string; message: string };
type DraftBatch = Pick<OTBatch, 'id' | 'name' | 'status' | 'csv_data' | 'created_at' | 'published_at'>;
type FormulaScope = 'all' | 'selected' | 'blank-only';
type BulkEditScope = 'all' | 'selected' | 'blank-only';
type OcrImageMode = 'contrast' | 'table';
type OcrSummary = {
  fileName: string;
  method: string;
  rowCount: number;
  confidence: number;
  columns: string[];
};
type OcrWorkerHandle = {
  setParameters: (params: Record<string, string>) => Promise<unknown>;
  recognize: (
    image: File,
    options?: { rotateAuto?: boolean },
  ) => Promise<{ data: { text?: string; confidence?: number } }>;
  terminate: () => Promise<unknown>;
};

const DATE_FORMAT_OPTIONS: Array<{ value: OTDateFormat; label: string }> = [
  { value: 'auto', label: 'Auto (MM/DD if ambiguous)' },
  { value: 'mdy', label: 'MM/DD/YYYY' },
  { value: 'dmy', label: 'DD/MM/YYYY' },
];

const FORMULA_SAMPLES = [
  '=SHIFT(start_time)',
  '=DURATION(start_time,end_time)',
  '=COPY(lob)',
  '=TEXT("NYT VOICE")',
  '=CONCAT(lob," - ",spot_id)',
];

const BULK_FILL_PRESETS = [
  { label: 'Pending status', column: 'csv_status', value: 'Pending' },
  { label: 'Morning shift', column: 'shift_label', value: 'Morning Shift' },
  { label: 'Afternoon shift', column: 'shift_label', value: 'Afternoon Shift' },
  { label: 'NYT VOICE', column: 'lob', value: 'NYT VOICE' },
  { label: 'NYT CHAT', column: 'lob', value: 'NYT CHAT' },
  { label: 'NYT EMAIL', column: 'lob', value: 'NYT EMAIL' },
] as const;

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

async function buildProcessedOcrFile(file: File, mode: OcrImageMode) {
  return new Promise<File | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        resolve(null);
        return;
      }

      const image = new Image();
      image.onload = () => {
        const scale =
          mode === 'table'
            ? Math.max(1.8, Math.min(2.4, 2600 / Math.max(image.width, 1)))
            : Math.max(1.4, Math.min(2, 2200 / Math.max(image.width, 1)));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        const context = canvas.getContext('2d');
        if (!context) {
          resolve(null);
          return;
        }

        context.filter =
          mode === 'table'
            ? 'grayscale(1) contrast(1.7) brightness(1.12)'
            : 'grayscale(1) contrast(1.35) brightness(1.05)';
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const { data } = imageData;

        for (let index = 0; index < data.length; index += 4) {
          const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
          const contrast =
            mode === 'table'
              ? gray > 205
                ? 255
                : gray < 132
                  ? 0
                  : Math.round(((gray - 132) / 73) * 255)
              : gray > 185
                ? 255
                : gray < 95
                  ? 0
                  : Math.round(gray);
          data[index] = contrast;
          data[index + 1] = contrast;
          data[index + 2] = contrast;
          data[index + 3] = 255;
        }

        context.putImageData(imageData, 0, 0);
        canvas.toBlob((blob) => {
          if (!blob) {
            resolve(null);
            return;
          }

          resolve(
            new File(
              [blob],
              `${file.name.replace(/\.[^.]+$/i, '')}-${mode}-ocr.png`,
              { type: 'image/png' },
            ),
          );
        }, 'image/png');
      };

      image.onerror = () => resolve(null);
      image.src = reader.result;
    };

    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
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
  const [deleteColumnModal, setDeleteColumnModal] = useState<string | null>(null);
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

  const loadRows = (nextRows: CSVRow[], nextBatchName?: string, nextBatchId?: string | null) => {
    const normalized = sanitizeOTRows(nextRows, dateFormat);
    const nextColumns = getOTColumns(normalized);
    setRows(normalized);
    setColumns(nextColumns.length > 0 ? nextColumns : [...CORE_OT_COLUMNS]);
    setBatchName(nextBatchName ?? '');
    setActiveBatchId(nextBatchId ?? null);
    setSelectedRows(new Set());
    setStatusMessage(null);
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
        loadRows(mapImportedRows(result.data, result.meta.fields ?? [], dateFormat), batchName || 'manual_paste_import', null);
      },
      error: (error: Error) => {
        setStatusTone('warning');
        setStatusMessage(`Unable to parse pasted data: ${error.message}`);
      },
    });
  };

  const handleImageImport = async (file: File) => {
    transfer.start(`Reading ${file.name}...`);
    setOcrBusy(true);
    setStatusMessage(null);
    let worker: OcrWorkerHandle | null = null;
    try {
      await readFileAsDataUrlWithProgress(file, { onProgress: transfer.setProgress });
      transfer.setProgress(100);
      transfer.setMessage('Running OCR...');
      const { createWorker, PSM } = await import('tesseract.js');
      worker = await createWorker('eng');
      const activeWorker = worker;
      const attempts: Array<{ text: string; rows: CSVRow[]; label: string; confidence: number }> = [];

      const runAttempt = async (label: string, source: File, pageSegmentationMode: string) => {
        await activeWorker.setParameters({
          preserve_interword_spaces: '1',
          user_defined_dpi: '300',
          tessedit_pageseg_mode: pageSegmentationMode,
        });

        const result = await activeWorker.recognize(source, { rotateAuto: true });
        const extractedText = result.data.text?.trim() ?? '';
        attempts.push({
          text: extractedText,
          rows: parseOcrTextToRows(extractedText, dateFormat),
          label,
          confidence: Number(result.data.confidence ?? 0),
        });
      };

      await runAttempt('original scan', file, PSM.SPARSE_TEXT);

      const contrastFile = await buildProcessedOcrFile(file, 'contrast');
      if (contrastFile) {
        await runAttempt('contrast cleanup', contrastFile, PSM.SINGLE_BLOCK);
      }

      const tableFile = await buildProcessedOcrFile(file, 'table');
      if (tableFile) {
        await runAttempt('table cleanup', tableFile, PSM.SPARSE_TEXT);
      }

      await activeWorker.terminate();
      worker = null;

      const bestAttempt =
        [...attempts].sort(
          (left, right) =>
            right.rows.length - left.rows.length ||
            right.confidence - left.confidence ||
            right.text.length - left.text.length,
        )[0] ?? { text: '', rows: [], label: 'OCR', confidence: 0 };

      if (bestAttempt.rows.length === 0) {
        setOcrSummary(null);
        setStatusTone('warning');
        setStatusMessage('OCR finished, but no OT rows could be structured from that image.');
        transfer.fail('No rows found');
        return;
      }

      loadRows(bestAttempt.rows, file.name.replace(/\.[^.]+$/i, ''), null);
      setOcrSummary({
        fileName: file.name,
        method: bestAttempt.label,
        rowCount: bestAttempt.rows.length,
        confidence: Math.round(bestAttempt.confidence),
        columns: getOTColumns(bestAttempt.rows).map((column) => getOTColumnLabel(column)),
      });
      setStatusTone('success');
      setStatusMessage(
        `OCR extracted ${bestAttempt.rows.length} OT row(s) using ${bestAttempt.label}. Review the table below before publishing.`,
      );
      transfer.succeed('OCR complete');
    } catch (error) {
      setOcrSummary(null);
      setStatusTone('warning');
      setStatusMessage(error instanceof Error ? error.message : 'Unable to process the image.');
      transfer.fail('OCR failed');
    } finally {
      if (worker) {
        await worker.terminate();
      }
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

  const doAddColumn = (label: string) => {
    const key = label.trim().toLowerCase().replace(/\s+/g, '_');
    if (!key || columns.includes(key)) {
      setStatusTone('warning');
      setStatusMessage('Column already exists or name is invalid.');
      return;
    }
    setColumns((current) => [...current, key]);
    setRows((current) => current.length === 0 ? [{ ...createEmptyOTRow([...columns, key]), [key]: '' }] : current.map((row) => ({ ...row, [key]: '' })));
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

  const handleBulkUpdate = () => {
    if (selectedRows.size === 0) {
      setStatusTone('warning');
      setStatusMessage('Select one or more rows before applying shared start and end times.');
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
      setStatusTone('warning');
      setStatusMessage('Select one or more rows first so the batch edit knows where to apply the change.');
      return;
    }

    if (mode === 'set' && !String(bulkEditValue ?? '').trim() && bulkEditInputType !== 'time' && bulkEditInputType !== 'date') {
      setStatusTone('warning');
      setStatusMessage('Enter a value before applying the bulk change.');
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

  const deleteSelectedRows = () => {
    if (selectedRows.size === 0) {
      setStatusTone('warning');
      setStatusMessage('Select at least one row before trying to delete a group of rows.');
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
        body: JSON.stringify({ rows, batchName, batchId: activeBatchId, status }),
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
                        {ocrSummary.fileName} - {ocrSummary.method} - {ocrSummary.confidence}% confidence
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
          <div style={{ marginTop: '1rem', padding: '0.9rem', borderRadius: 12, background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.18)' }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, marginBottom: '0.35rem', color: 'var(--brand-primary-light)' }}>Formula ideas</div>
            <div className="text-muted" style={{ fontSize: '0.8rem', lineHeight: 1.55, marginBottom: '0.6rem' }}>
              Use these as shortcuts when you want the sheet to fill labels, durations or repeated text for you.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {FORMULA_SAMPLES.map((sample) => <button key={sample} type="button" onClick={() => setFormulaInput(sample)} style={{ border: '1px solid rgba(99,102,241,0.25)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', padding: '0.35rem 0.55rem', borderRadius: 999, fontSize: '0.75rem', cursor: 'pointer' }}>{sample}</button>)}
            </div>
          </div>
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
              <section className="staging-tool-card">
                <div className="staging-tool-head">
                  <div>
                    <h3 className="staging-tool-title">Batch Edit</h3>
                    <p className="staging-tool-copy">Update many OT rows at once without editing cell by cell.</p>
                  </div>
                  <div className="staging-selection-pill">
                    {selectedRowCount > 0 ? `${selectedRowCount} selected` : 'No rows selected'}
                  </div>
                </div>

                <div className="staging-tool-fields">
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
                        { label: 'Selected rows', value: 'selected' },
                        { label: 'Entire table', value: 'all' },
                        { label: 'Only blank matching cells', value: 'blank-only' }
                      ]}
                    />
                  </label>
                  <label className="staging-tool-field staging-tool-field-wide">
                    <span>Value</span>
                    {bulkEditInputType === 'date' ? (
                      <ModernDatePicker
                        date={bulkEditValue}
                        onDateChange={setBulkEditValue}
                      />
                    ) : bulkEditInputType === 'time' ? (
                      <ModernTimePicker
                        time={bulkEditValue}
                        onTimeChange={setBulkEditValue}
                      />
                    ) : (
                      <input
                        className="input"
                        type={bulkEditInputType}
                        step={bulkEditInputType === 'number' ? '0.1' : undefined}
                        value={bulkEditValue}
                        onChange={(event) => setBulkEditValue(event.target.value)}
                        placeholder="Type the value you want to reuse across rows"
                      />
                    )}
                  </label>
                </div>

                <div className="staging-tool-actions">
                  <button className="btn" onClick={() => applyBulkEdit('set')}>Apply value</button>
                  <button className="btn btn-ghost" onClick={() => applyBulkEdit('clear')}>Clear field</button>
                  <button className="btn btn-ghost" onClick={handleBulkUpdate}>Apply start/end time</button>
                  <button className="btn btn-ghost" style={{ color: '#f87171' }} onClick={deleteSelectedRows}>Delete selected</button>
                </div>

                <div className="staging-inline-time-fields">
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

                <div className="staging-preset-row">
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
              </section>

              <section className="staging-tool-card">
                <div className="staging-tool-head">
                  <div>
                    <h3 className="staging-tool-title">Formula Assistant</h3>
                    <p className="staging-tool-copy">Let the sheet calculate labels, durations, copied text and repetitive values for you.</p>
                  </div>
                  <div className="staging-selection-pill">Mini FX</div>
                </div>

                <div className="staging-formula-input-wrap">
                  <div className="staging-fx-badge">FX</div>
                  <input className="input" value={formulaInput} onChange={(event) => setFormulaInput(event.target.value)} />
                </div>

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
                    <span>Scope</span>
                    <ModernSelect
                      value={formulaScope}
                      onValueChange={v => setFormulaScope(v as FormulaScope)}
                      options={[
                        { label: 'Selected rows', value: 'selected' },
                        { label: 'Entire table', value: 'all' },
                        { label: 'Only blank matching cells', value: 'blank-only' }
                      ]}
                    />
                  </label>
                </div>

                <div className="staging-formula-help">
                  <strong>Popular examples</strong>
                  <div className="staging-preset-row">
                    {FORMULA_SAMPLES.map((sample) => (
                      <button key={sample} type="button" className="staging-pill-btn" onClick={() => setFormulaInput(sample)}>
                        {sample}
                      </button>
                    ))}
                  </div>
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
                        <span>{getOTColumnLabel(column)}</span>
                        {!CORE_OT_COLUMNS.includes(column as (typeof CORE_OT_COLUMNS)[number]) && (
                          <button
                            type="button"
                            className="staging-column-delete-btn"
                            onClick={() => requestDeleteColumn(column)}
                            aria-label={`Delete ${getOTColumnLabel(column)} column`}
                          >
                            <Trash2 size={12} />
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
        .staging-column-head { display: flex; align-items: center; justify-content: space-between; gap: 0.45rem; }
        .staging-column-delete-btn { width: 22px; height: 22px; border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.08); color: #fca5a5; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease; }
        .staging-column-delete-btn:hover { background: rgba(239, 68, 68, 0.14); border-color: rgba(239, 68, 68, 0.34); color: #fecaca; }
        .staging-modal { max-width: 480px; display: grid; gap: 1rem; }
        .staging-modal-kicker { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); }
        .staging-modal-actions { display: flex; justify-content: flex-end; gap: 0.75rem; flex-wrap: wrap; }
        .staging-danger-btn { color: #fca5a5; border-color: rgba(239, 68, 68, 0.25); }
        .staging-danger-btn:hover { background: rgba(239, 68, 68, 0.08); color: #fecaca; }
        @media (max-width: 1080px) { .staging-grid { grid-template-columns: 1fr !important; } .staging-header { flex-direction: column; } .staging-tool-grid { grid-template-columns: 1fr; } }
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
          onConfirm={(label) => {
            setAddColumnModal(false);
            doAddColumn(label);
          }}
          onCancel={() => setAddColumnModal(false)}
        />
      )}
    </div>
  );
}
