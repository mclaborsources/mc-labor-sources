import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const path = 'C:/Users/Administrator/Downloads/2026-07-24 Tracking Export.xlsx';
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(path));

const summary = await workbook.inspect({
  kind: 'workbook,sheet,table',
  maxChars: 12000,
  tableMaxRows: 8,
  tableMaxCols: 12,
  tableMaxCellChars: 100,
});
process.stdout.write(summary.ndjson + '\n');

for (const name of ['Assignments', 'Employees', 'Jobs', 'Customers']) {
  try {
    const detail = await workbook.inspect({
      kind: 'region',
      sheetId: name,
      range: 'A1:Z15',
      maxChars: 10000,
    });
    process.stdout.write(`\n--- ${name} ---\n${detail.ndjson}\n`);
  } catch {}
}
