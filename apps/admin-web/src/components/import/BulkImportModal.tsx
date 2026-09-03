'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ZodSchema } from 'zod';
import * as XLSX from 'xlsx';
import type { BulkImportResult } from '@mc-labor/shared';
import { Button } from '@/components/ui/Button';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { FormField } from '@/components/ui/FormField';
import { portalFormFieldClassName } from '@/components/portal';

export interface ImportFieldDef {
  key: string;
  label: string;
  required?: boolean;
}

interface BulkImportModalProps<TRow extends Record<string, unknown>> {
  open: boolean;
  onClose: () => void;
  title: string;
  fields: ImportFieldDef[];
  rowSchema: ZodSchema<TRow>;
  onImport: (rows: TRow[]) => Promise<BulkImportResult>;
  templateHeaders: string[];
  templateFilename: string;
  extraOptions?: React.ReactNode;
}

type Step = 'upload' | 'map' | 'preview' | 'results';

function parseFile(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
        if (json.length === 0) {
          resolve({ headers: [], rows: [] });
          return;
        }
        const headers = Object.keys(json[0]);
        resolve({ headers, rows: json });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function autoMapHeaders(headers: string[], fields: ImportFieldDef[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const field of fields) {
    const normalized = field.key.toLowerCase().replace(/[^a-z]/g, '');
    const match = headers.find((h) => {
      const hn = h.toLowerCase().replace(/[^a-z]/g, '');
      return hn === normalized || hn.includes(normalized) || normalized.includes(hn);
    });
    if (match) mapping[field.key] = match;
  }
  return mapping;
}

export function BulkImportModal<TRow extends Record<string, unknown>>({
  open,
  onClose,
  title,
  fields,
  rowSchema,
  onImport,
  templateHeaders,
  templateFilename,
  extraOptions,
}: BulkImportModalProps<TRow>) {
  const [step, setStep] = useState<Step>('upload');
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [fileError, setFileError] = useState('');

  const reset = useCallback(() => {
    setStep('upload');
    setRawHeaders([]);
    setRawRows([]);
    setColumnMap({});
    setImporting(false);
    setResult(null);
    setFileError('');
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const mappedRows = useMemo(() => {
    return rawRows.map((row) => {
      const mapped: Record<string, unknown> = {};
      for (const field of fields) {
        const sourceCol = columnMap[field.key];
        if (sourceCol && row[sourceCol] !== undefined && row[sourceCol] !== '') {
          mapped[field.key] = String(row[sourceCol]).trim();
        }
      }
      return mapped;
    });
  }, [rawRows, columnMap, fields]);

  const validation = useMemo(() => {
    return mappedRows.map((row, index) => {
      const parsed = rowSchema.safeParse(row);
      return {
        rowNum: index + 2,
        valid: parsed.success,
        data: parsed.success ? parsed.data : null,
        error: parsed.success ? null : parsed.error.errors.map((e) => e.message).join('; '),
      };
    });
  }, [mappedRows, rowSchema]);

  const validRows = validation.filter((v) => v.valid && v.data).map((v) => v.data as TRow);
  const previewRows = validation.slice(0, 10);

  const onFileSelect = async (file: File | null) => {
    if (!file) return;
    setFileError('');
    try {
      const { headers, rows } = await parseFile(file);
      if (rows.length === 0) {
        setFileError('File is empty or has no data rows');
        return;
      }
      setRawHeaders(headers);
      setRawRows(rows);
      setColumnMap(autoMapHeaders(headers, fields));
      setStep('map');
    } catch {
      setFileError('Could not parse file. Use CSV or XLSX format.');
    }
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([templateHeaders]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, templateFilename);
  };

  const downloadErrorReport = () => {
    if (!result?.errors.length) return;
    const lines = ['Row,Error', ...result.errors.map((e) => `${e.row},"${e.message.replace(/"/g, '""')}"`)];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import-errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const runImport = async () => {
    setImporting(true);
    try {
      const res = await onImport(validRows);
      setResult(res);
      setStep('results');
    } catch (err) {
      setResult({
        imported: 0,
        skipped: validRows.length,
        errors: [{ row: 0, message: err instanceof Error ? err.message : 'Import failed' }],
      });
      setStep('results');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      subtitle="Upload a spreadsheet to bulk-create records"
      icon="upload"
      tone="success"
      size="lg"
    >
      {step === 'upload' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Upload a CSV or Excel file. Download the template to see expected columns.
          </p>
          <Button type="button" variant="secondary" icon="download" onClick={downloadTemplate}>
            Download Template
          </Button>
          {extraOptions}
          <FormField label="Spreadsheet file">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary"
              onChange={(e) => onFileSelect(e.target.files?.[0] ?? null)}
            />
          </FormField>
          {fileError && <p className="text-sm text-red-600">{fileError}</p>}
        </div>
      )}

      {step === 'map' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Map spreadsheet columns to fields ({rawRows.length} rows detected).
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <FormField key={field.key} label={`${field.label}${field.required ? ' *' : ''}`}>
                <Select
                  value={columnMap[field.key] ?? ''}
                  onChange={(e) =>
                    setColumnMap((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  className={portalFormFieldClassName}
                >
                  <option value="">— skip —</option>
                  {rawHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </Select>
              </FormField>
            ))}
          </div>
          <ModalFooter>
            <Button type="button" variant="secondary" icon="arrowLeft" onClick={() => setStep('upload')}>
              Back
            </Button>
            <Button type="button" icon="eye" onClick={() => setStep('preview')}>
              Preview
            </Button>
          </ModalFooter>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-emerald-700">{validRows.length}</span> valid ·{' '}
            <span className="font-semibold text-red-600">
              {validation.length - validRows.length}
            </span>{' '}
            invalid (showing first 10 rows)
          </p>
          <div className="max-h-64 overflow-auto rounded-lg border border-gray-100">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-2 py-1 text-left">Row</th>
                  <th className="px-2 py-1 text-left">Status</th>
                  <th className="px-2 py-1 text-left">Details</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={row.rowNum} className="border-t border-gray-50">
                    <td className="px-2 py-1">{row.rowNum}</td>
                    <td className="px-2 py-1">
                      {row.valid ? (
                        <span className="text-emerald-600">Valid</span>
                      ) : (
                        <span className="text-red-600">Invalid</span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-slate-600">
                      {row.error ?? fields.map((f) => String((row.data as TRow)?.[f.key] ?? '')).join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ModalFooter>
            <Button type="button" variant="secondary" icon="arrowLeft" onClick={() => setStep('map')}>
              Back
            </Button>
            <Button
              type="button"
              icon="upload"
              onClick={runImport}
              loading={importing}
              disabled={validRows.length === 0}
            >
              Import {validRows.length} row{validRows.length === 1 ? '' : 's'}
            </Button>
          </ModalFooter>
        </div>
      )}

      {step === 'results' && result && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-100 bg-slate-50/80 px-4 py-3 text-sm">
            <p>
              <span className="font-semibold text-emerald-700">{result.imported}</span> imported ·{' '}
              <span className="font-semibold text-amber-700">{result.skipped}</span> skipped
            </p>
          </div>
          {result.results && result.results.length > 0 && (
            <div className="max-h-48 overflow-auto rounded-lg border border-gray-100 text-xs">
              <table className="min-w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-2 py-1 text-left">Row</th>
                    <th className="px-2 py-1 text-left">Result</th>
                    <th className="px-2 py-1 text-left">Portal login</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r) => (
                    <tr key={r.row} className="border-t border-gray-50">
                      <td className="px-2 py-1">{r.row}</td>
                      <td className="px-2 py-1">
                        {r.success ? (
                          <span className={r.message ? 'text-amber-700' : 'text-emerald-600'}>{r.message || 'OK'}</span>
                        ) : (
                          <span className="text-red-600">{r.message}</span>
                        )}
                      </td>
                      <td className="px-2 py-1 font-mono text-slate-600">
                        {r.username ? `${r.username} · password: cell number (digits only)` : r.generatedPassword ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.errors.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-red-700">Errors</p>
              <ul className="max-h-32 overflow-auto text-xs text-red-600">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
              <Button type="button" variant="secondary" size="sm" icon="download" onClick={downloadErrorReport}>
                Download Error Report
              </Button>
            </div>
          )}
          <ModalFooter>
            <Button type="button" icon="checkCircle" onClick={handleClose}>
              Done
            </Button>
          </ModalFooter>
        </div>
      )}
    </Modal>
  );
}
