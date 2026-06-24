import type { Customer, CustomerContact } from '@/lib/domain-types';

export function formatCustomerAddress(customer: Pick<Customer, 'street' | 'city' | 'state' | 'zip' | 'address'>): string {
  const parts = [customer.street, customer.city, customer.state, customer.zip].filter(Boolean);
  if (parts.length > 0) return parts.join(', ');
  return customer.address ?? '';
}

export function contactDisplayName(contact: CustomerContact): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
}

export function primaryContactFromCustomer(
  customer: Customer,
  contacts: CustomerContact[] = [],
): {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  officeEmail: string;
} {
  const sorted = [...contacts].sort((a, b) => a.slotNumber - b.slotNumber);
  const primary = sorted[0];
  const secondary = sorted.find((c) => c.slotNumber === 2) ?? sorted[1];

  if (primary) {
    return {
      contactName: contactDisplayName(primary) || customer.contactName || '',
      contactEmail: primary.email || customer.contactEmail || '',
      contactPhone: primary.cell || primary.officePhone || customer.contactPhone || '',
      officeEmail: secondary?.email || customer.officeEmail || '',
    };
  }

  return {
    contactName: customer.contactName || '',
    contactEmail: customer.contactEmail || '',
    contactPhone: customer.contactPhone || '',
    officeEmail: customer.officeEmail || '',
  };
}
