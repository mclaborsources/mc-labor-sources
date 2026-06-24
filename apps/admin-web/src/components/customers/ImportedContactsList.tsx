'use client';

import type { CustomerContact } from '@/lib/domain-types';
import { contactDisplayName } from '@/lib/customer-contact-utils';

interface ImportedContactsListProps {
  contacts: CustomerContact[];
}

export function ImportedContactsList({ contacts }: ImportedContactsListProps) {
  if (contacts.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
      <h4 className="text-sm font-semibold text-slate-800">Imported contacts</h4>
      <p className="mt-1 text-xs text-slate-500">
        Additional contacts from the master import (slots 1–10). Primary contact fields above use slot 1.
      </p>
      <div className="mt-3 space-y-2">
        {contacts.map((contact) => (
          <div
            key={contact.id}
            className="rounded-lg border border-white bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-900">
                {contactDisplayName(contact) || `Contact ${contact.slotNumber}`}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                Slot {contact.slotNumber}
              </span>
              {contact.title ? (
                <span className="text-xs text-slate-500">{contact.title}</span>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
              {contact.email ? <span>{contact.email}</span> : null}
              {contact.cell ? <span>{contact.cell}</span> : null}
              {contact.officePhone ? <span>Office: {contact.officePhone}</span> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
