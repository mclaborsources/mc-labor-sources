export interface ParsedTable {
  headers: string[];
  rows: Record<string, string>[];
}

const EMPTY_LITERALS = new Set(['NULL', 'N/A', 'NA', '#N/A', 'NONE', '-']);

/** Treat Raymond export sentinels (NULL, N/A, etc.) as blank. */
export function normalizePasteCell(value: string | undefined | null): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  if (EMPTY_LITERALS.has(trimmed.toUpperCase())) return '';
  return trimmed;
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function detectDelimiter(line: string): '\t' | ',' {
  const tabs = (line.match(/\t/g) ?? []).length;
  const commas = (line.match(/,/g) ?? []).length;
  return tabs >= commas ? '\t' : ',';
}

function splitLine(line: string, delimiter: '\t' | ','): string[] {
  if (delimiter === '\t') return line.split('\t').map((c) => c.trim());
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

/** Header row when the first line looks like labels, not a lone data row. */
function looksLikeHeaderRow(cells: string[]): boolean {
  if (cells.length < 2) return false;
  const labelHits = cells.filter((c) =>
    /^(employee|customer|job|tracking|first|last|name|id|status|street|email|phone|cell|trade|pay|bill|salesman|foreman|assign|week)/i.test(
      c.trim(),
    ),
  ).length;
  if (labelHits >= 2) return true;
  const numericIds = cells.filter((c) => /^\d+$/.test(c.trim())).length;
  return numericIds < cells.length / 2;
}

export function parsePastedTable(text: string): ParsedTable {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };

  const delimiter = detectDelimiter(lines[0]);
  const firstCells = splitLine(lines[0], delimiter);
  const hasHeader = looksLikeHeaderRow(firstCells);
  const headers = hasHeader ? firstCells : firstCells.map((_, i) => `Column ${i + 1}`);
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const rows = dataLines.map((line) => {
    const cells = splitLine(line, delimiter);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = normalizePasteCell(cells[i] ?? '');
    });
    return row;
  });

  return { headers, rows };
}

export function findColumnValue(row: Record<string, string>, aliases: string[]): string {
  const normalizedAliases = aliases.map(normalizeHeader);
  for (const [key, value] of Object.entries(row)) {
    const nk = normalizeHeader(key);
    if (normalizedAliases.some((a) => nk === a || nk.includes(a) || a.includes(nk))) {
      return normalizePasteCell(value);
    }
  }
  return '';
}

export function normalizeImportDate(raw: string): string | undefined {
  const v = normalizePasteCell(raw);
  if (!v) return undefined;
  const datePart = v.split(/[ T]/)[0];
  return datePart || undefined;
}

export function normalizeImportRate(raw: string): string | undefined {
  const v = normalizePasteCell(raw).replace(/[$,]/g, '');
  return v || undefined;
}

const RECOGNIZED_STATUSES = new Set([
  'ACTIVE',
  'INACTIVE',
  'AVAILABLE',
  'A',
  'I',
  'ACT',
  'INACT',
  'ENABLED',
  'DISABLED',
]);

/** Omit unknown status values (e.g. salesman names) so the server defaults to ACTIVE. */
export function normalizeImportStatus(raw: string): string | undefined {
  const v = normalizePasteCell(raw).toUpperCase();
  if (!v || !RECOGNIZED_STATUSES.has(v)) return undefined;
  if (v === 'AVAILABLE' || v === 'A' || v === 'ACT' || v === 'ENABLED') return 'ACTIVE';
  if (v === 'I' || v === 'INACT' || v === 'DISABLED') return 'INACTIVE';
  return v;
}
