import type { Assignment, Customer } from '@/lib/domain-types';

const ASSIGNMENT_JOB_SITE_SELECT =
  'id, name, address, customer_id, customer:customers(id, company_name)';

export const assignmentListSelect = `*, employee:employees(*), customer:customers(id, company_name), job_site:job_sites(${ASSIGNMENT_JOB_SITE_SELECT})`;

export function assignmentCustomerIds(a: Assignment): string[] {
  const ids = new Set<string>();
  if (a.customerId) ids.add(a.customerId);
  if (a.customer?.id) ids.add(a.customer.id);
  if (a.jobSite?.customerId) ids.add(a.jobSite.customerId);
  if (a.jobSite?.customer?.id) ids.add(a.jobSite.customer.id);
  return [...ids];
}

export function assignmentMatchesCustomer(a: Assignment, customerId: string): boolean {
  return assignmentCustomerIds(a).includes(customerId);
}

export function assignmentCustomerLabel(a: Assignment): string | undefined {
  return a.customer?.companyName ?? a.jobSite?.customer?.companyName;
}

import { assignmentOverlapsWeek } from '@/lib/working-week';

export function filterAssignments(
  items: Assignment[],
  filters: {
    customerId?: string;
    status?: string;
    weekStart?: string;
    weekEnd?: string;
  },
): Assignment[] {
  let result = items;
  if (filters.weekStart && filters.weekEnd) {
    result = result.filter((a) =>
      assignmentOverlapsWeek(a.assignedDate, a.endDate, filters.weekStart!, filters.weekEnd!),
    );
  }
  if (filters.customerId) {
    result = result.filter((a) => assignmentMatchesCustomer(a, filters.customerId!));
  }
  if (filters.status) {
    result = result.filter((a) => a.status === filters.status);
  }
  return result;
}

export function customersWithAssignments(
  customers: Customer[],
  assignments: Assignment[],
): Customer[] {
  const ids = new Set<string>();
  for (const a of assignments) {
    for (const id of assignmentCustomerIds(a)) {
      ids.add(id);
    }
  }
  return customers
    .filter((c) => ids.has(c.id))
    .sort((a, b) => a.companyName.localeCompare(b.companyName));
}
