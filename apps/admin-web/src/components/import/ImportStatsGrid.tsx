'use client';

import { PortalSummaryStat } from '@/components/portal/PortalComponents';

export type ImportStats = {
  pasted: number;
  created: number;
  updated: number;
  skipped: number;
  conflicts: number;
  failed: number;
};

interface ImportStatsGridProps {
  stats: ImportStats;
  showConflicts?: boolean;
}

function StatIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {children}
    </svg>
  );
}

export function ImportStatsGrid({ stats, showConflicts = true }: ImportStatsGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <PortalSummaryStat
        label="Total rows"
        value={stats.pasted}
        accent="slate"
        icon={
          <StatIcon>
            <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
          </StatIcon>
        }
      />
      <PortalSummaryStat
        label="Created"
        value={stats.created}
        accent="green"
        icon={
          <StatIcon>
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </StatIcon>
        }
      />
      <PortalSummaryStat
        label="Updated"
        value={stats.updated}
        accent="primary"
        icon={
          <StatIcon>
            <path d="M4 20h4l10-10-4-4L4 16v4z" strokeLinejoin="round" />
          </StatIcon>
        }
      />
      <PortalSummaryStat
        label="Skipped"
        value={stats.skipped}
        accent="slate"
        icon={
          <StatIcon>
            <path d="M5 12h14" strokeLinecap="round" />
          </StatIcon>
        }
      />
      {showConflicts ? (
        <PortalSummaryStat
          label="Conflicts"
          value={stats.conflicts}
          accent="amber"
          icon={
            <StatIcon>
              <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </StatIcon>
          }
        />
      ) : null}
      <PortalSummaryStat
        label="Failed"
        value={stats.failed}
        accent={stats.failed > 0 ? 'amber' : 'green'}
        icon={
          <StatIcon>
            <circle cx="12" cy="12" r="10" />
            <path d="M15 9l-6 6M9 9l6 6" strokeLinecap="round" />
          </StatIcon>
        }
      />
    </div>
  );
}
