export interface ParsedTable {
  headers: string[];
  rows: Record<string, string>[];
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

export function parsePastedTable(text: string): ParsedTable {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };

  const delimiter = detectDelimiter(lines[0]);
  const firstCells = splitLine(lines[0], delimiter);
  const hasHeader = firstCells.some((c) => /[a-zA-Z]/.test(c));
  const headers = hasHeader ? firstCells : firstCells.map((_, i) => `Column ${i + 1}`);
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const rows = dataLines.map((line) => {
    const cells = splitLine(line, delimiter);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? '';
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
      return value.trim();
    }
  }
  return '';
}
