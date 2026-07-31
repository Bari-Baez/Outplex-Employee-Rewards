import Papa from 'papaparse';
import type { RaffleParticipant } from '@backend/modules/raffles/domain/runtime';
import { readFileAsTextWithProgress } from '@frontend/shared/lib/file-transfer';

interface ParsedCsvResult {
  participants: RaffleParticipant[];
  detectedNameColumn: number | null;
  detectedIdColumn: number | null;
  headerRowIndex: number | null;
}

function normalizeCell(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function looksLikeTimeOrDate(value: string) {
  return (
    /^\d{1,2}:\d{2}(:\d{2})?\s?(am|pm)?$/i.test(value) ||
    /^\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?$/.test(value) ||
    /^[a-z]{3,9},?\s+[a-z]{3,9}\s+\d{1,2}$/i.test(value)
  );
}

function scoreHeaderName(cell: string) {
  const value = normalizeCell(cell).toLowerCase();
  if (!value) {
    return 0;
  }

  let score = 0;
  if (/(^|[\s_-])(name|nombre)([\s_-]|$)/.test(value)) score += 10;
  if (/(employee|empleado|agent|advisor|participant|winner|entrant)/.test(value)) score += 8;
  if (/(first|last)/.test(value)) score += 2;
  if (/(id|date|time|break|lunch|status|score|hours)/.test(value)) score -= 5;
  return score;
}

function scoreHeaderId(cell: string) {
  const value = normalizeCell(cell).toLowerCase();
  if (!value) {
    return 0;
  }

  let score = 0;
  if (/(^|[\s_-])(id|employee id|emp id|slack id|code|codigo|cedula)([\s_-]|$)/.test(value)) {
    score += 8;
  }
  if (/(name|nombre|agent|employee|participant)/.test(value)) {
    score -= 2;
  }
  return score;
}

function scoreNameValue(cell: string) {
  const value = normalizeCell(cell);
  if (!value) {
    return -10;
  }

  let score = 0;
  if (looksLikeTimeOrDate(value)) score -= 10;
  if (/^\d+$/.test(value)) score -= 8;
  if (/[a-z]/i.test(value)) score += 4;
  if (/^[a-z\s.'-]+$/i.test(value)) score += 6;

  const words = value.split(' ').filter(Boolean);
  if (words.length >= 2 && words.length <= 4) score += 4;
  if (words.length === 1) score += 2;
  if (words.length > 6) score -= 5;
  if (value.length > 40) score -= 4;

  return score;
}

function detectHeaderRow(rows: string[][]) {
  let bestRowIndex: number | null = null;
  let bestScore = 0;

  rows.slice(0, 10).forEach((row, rowIndex) => {
    const score = row.reduce((total, cell) => total + scoreHeaderName(cell) + scoreHeaderId(cell), 0);
    if (score > bestScore) {
      bestScore = score;
      bestRowIndex = rowIndex;
    }
  });

  return bestScore >= 6 ? bestRowIndex : null;
}

function detectColumn(rows: string[][], columnCount: number, scoreCell: (cell: string) => number) {
  let bestColumn: number | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    let score = 0;
    let populatedRows = 0;

    for (const row of rows) {
      const cell = normalizeCell(row[columnIndex]);
      if (!cell) {
        continue;
      }

      populatedRows += 1;
      score += scoreCell(cell);
    }

    if (populatedRows === 0) {
      continue;
    }

    const weightedScore = score / populatedRows;
    if (weightedScore > bestScore) {
      bestScore = weightedScore;
      bestColumn = columnIndex;
    }
  }

  return bestScore > 1 ? bestColumn : null;
}

function buildParticipantsFromRows({
  rows,
  headerRowIndex,
  nameColumn,
  idColumn,
}: {
  rows: string[][];
  headerRowIndex: number | null;
  nameColumn: number | null;
  idColumn: number | null;
}) {
  if (nameColumn === null) {
    return [];
  }

  const startIndex = headerRowIndex === null ? 0 : headerRowIndex + 1;
  const participants: RaffleParticipant[] = [];

  for (let rowIndex = startIndex; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const name = normalizeCell(row[nameColumn]);
    const sourceId = idColumn === null ? null : normalizeCell(row[idColumn]) || null;

    if (scoreNameValue(name) < 3) {
      continue;
    }

    participants.push({
      id: crypto.randomUUID(),
      name,
      sourceId,
    });
  }

  return participants;
}

export function parseRaffleCsvText(text: string): ParsedCsvResult {
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
  });
  const rows = (parsed.data as string[][])
    .map((row) => row.map((cell) => normalizeCell(cell)))
    .filter((row) => row.some((cell) => cell.length > 0));

  if (rows.length === 0) {
    return {
      participants: [],
      detectedNameColumn: null,
      detectedIdColumn: null,
      headerRowIndex: null,
    };
  }

  const headerRowIndex = detectHeaderRow(rows);
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const headerRow = headerRowIndex === null ? null : rows[headerRowIndex];
  const dataRows = rows.slice(headerRowIndex === null ? 0 : headerRowIndex + 1);

  let detectedNameColumn: number | null = null;
  let detectedIdColumn: number | null = null;

  if (headerRow) {
    let bestHeaderNameScore = Number.NEGATIVE_INFINITY;
    let bestHeaderIdScore = Number.NEGATIVE_INFINITY;

    headerRow.forEach((cell, index) => {
      const nameScore = scoreHeaderName(cell);
      if (nameScore > bestHeaderNameScore) {
        bestHeaderNameScore = nameScore;
        detectedNameColumn = index;
      }

      const idScore = scoreHeaderId(cell);
      if (idScore > bestHeaderIdScore) {
        bestHeaderIdScore = idScore;
        detectedIdColumn = index;
      }
    });

    if (bestHeaderNameScore < 4) {
      detectedNameColumn = null;
    }

    if (bestHeaderIdScore < 4) {
      detectedIdColumn = null;
    }
  }

  if (detectedNameColumn === null) {
    detectedNameColumn = detectColumn(dataRows, columnCount, scoreNameValue);
  }

  if (detectedIdColumn === null) {
    detectedIdColumn = detectColumn(dataRows, columnCount, (cell) => {
      if (!cell) return -1;
      if (/^[a-f0-9-]{8,}$/i.test(cell)) return 8;
      if (/^\d{3,}$/.test(cell)) return 5;
      if (/^[a-z0-9._-]{3,}$/i.test(cell)) return 3;
      return -1;
    });
  }

  return {
    participants: buildParticipantsFromRows({
      rows,
      headerRowIndex,
      nameColumn: detectedNameColumn,
      idColumn: detectedIdColumn,
    }),
    detectedNameColumn,
    detectedIdColumn,
    headerRowIndex,
  };
}

export async function parseRaffleCsvFile(file: File, opts?: { onProgress?: (pct: number) => void }) {
  const text = await readFileAsTextWithProgress(file, { onProgress: opts?.onProgress });
  return parseRaffleCsvText(text);
}
