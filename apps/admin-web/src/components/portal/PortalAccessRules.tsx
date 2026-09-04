'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';

export function PortalAccessRules() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold normal-case tracking-normal text-slate-700 shadow-sm hover:bg-slate-50">
        View Rules
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Portal Access Rules" icon="user" size="md">
        <div className="space-y-4 text-sm text-slate-700">
          <p>Active employees included in an assignment import receive portal access automatically if they do not already have an account and have a valid cell number. This includes existing employee records. New employees imported into the system also receive access.</p>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p><strong>Username:</strong> first 3 letters of the first name, lowercase (for example, mar). No numbers are added.</p>
            <p className="mt-2"><strong>Initial password:</strong> the employee’s cell number, digits only, including the country code if present in the imported number.</p>
          </div>
          <p><strong>Default tabs:</strong> Home, Assignments / Site Information, and Messages. Other optional tabs remain disabled.</p>
          <p>The same username or the same password may be used by different employees, but an identical username and password combination is blocked.</p>
          <p>Existing accounts, passwords, and access settings are preserved on re-import. Missing or invalid cell numbers are reported in the import results for manual follow-up.</p>
          <p className="text-amber-800">A cell number is predictable. Treat it as an initial password and replace it with a strong private password.</p>
        </div>
      </Modal>
    </>
  );
}
