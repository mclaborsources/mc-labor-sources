'use client';

import type { AssignmentImportResolution, ImportRowResult } from '@mc-labor/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Table, Th, Td } from '@/components/ui/Table';

interface ImportPreviewTableProps {
  results: ImportRowResult[];
  parsedSummary?: Record<number, string>;
  resolutions?: AssignmentImportResolution[];
  onResolve?: (row: number, resolution: AssignmentImportResolution) => void;
}

export function ImportPreviewTable({
  results,
  parsedSummary,
  resolutions = [],
  onResolve,
}: ImportPreviewTableProps) {
  if (results.length === 0) return null;

  const resolutionFor = (row: number) => resolutions.find((r) => r.row === row);

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <Table>
        <thead>
          <tr>
            <Th>Row</Th>
            <Th>Parsed</Th>
            <Th>Status</Th>
            <Th>Message</Th>
            {onResolve ? <Th>Action</Th> : null}
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const resolution = resolutionFor(r.row);
            return (
              <tr key={r.row}>
                <Td>{r.row}</Td>
                <Td className="max-w-xs truncate text-xs font-mono">
                  {parsedSummary?.[r.row] ?? '—'}
                </Td>
                <Td>
                  <Badge status={r.status.toUpperCase()} />
                </Td>
                <Td className="max-w-md text-sm">{r.message}</Td>
                {onResolve ? (
                  <Td>
                    {r.status === 'conflict' ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={resolution?.action === 'skip' ? 'primary' : 'secondary'}
                          onClick={() => onResolve(r.row, { row: r.row, action: 'skip' })}
                        >
                          Skip
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={resolution?.action === 'move' ? 'primary' : 'secondary'}
                          onClick={() =>
                            onResolve(r.row, {
                              row: r.row,
                              action: 'move',
                              oldEndDate: resolution?.oldEndDate ?? new Date().toISOString().slice(0, 10),
                              newStartDate: resolution?.newStartDate ?? new Date().toISOString().slice(0, 10),
                            })
                          }
                        >
                          Move
                        </Button>
                        {resolution?.action === 'move' ? (
                          <div className="flex flex-col gap-1 text-xs">
                            <label>
                              End current
                              <input
                                type="date"
                                className="ml-1 rounded border px-1 py-0.5"
                                value={resolution.oldEndDate ?? ''}
                                onChange={(e) =>
                                  onResolve(r.row, {
                                    ...resolution,
                                    action: 'move',
                                    oldEndDate: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label>
                              Start new
                              <input
                                type="date"
                                className="ml-1 rounded border px-1 py-0.5"
                                value={resolution.newStartDate ?? ''}
                                onChange={(e) =>
                                  onResolve(r.row, {
                                    ...resolution,
                                    action: 'move',
                                    newStartDate: e.target.value,
                                  })
                                }
                              />
                            </label>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">{r.action}</span>
                    )}
                  </Td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}
