'use client';

import { useState } from 'react';
import { EditableHelpRuleModal } from '@/components/portal/EditableHelpRuleModal';

export function PortalAccessRules() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold normal-case tracking-normal text-slate-700 shadow-sm hover:bg-slate-50">
        View Rules
      </button>
      <PortalAccessRulesModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function PortalAccessRulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <EditableHelpRuleModal
    open={open}
    onClose={onClose}
    ruleId="portal-access-rules"
    defaultTitle="Portal Access Rules"
    defaultContent={`Active employees included in an assignment import receive portal access automatically if they do not already have an account and have a valid cell number. This includes existing employee records. New employees imported into the system also receive access.\n\nUsername: first 3 letters of the first name, lowercase (for example, mar). No numbers are added.\n\nInitial password: the employee’s cell number, digits only, including the country code if present in the imported number.\n\nDefault tabs: Home, Assignments / Site Information, and Messages. Other optional tabs remain disabled.\n\nThe same username or the same password may be used by different employees, but an identical username and password combination is blocked.\n\nExisting accounts, passwords, and access settings are preserved on re-import. Missing or invalid cell numbers are reported in the import results for manual follow-up.\n\nA cell number is predictable. Treat it as an initial password and replace it with a strong private password.`}
  />;
}
