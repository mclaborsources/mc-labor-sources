import type { Assignment, Customer } from '@/lib/domain-types';
import { collectDistinct } from '@/lib/filter-options';
import { assignmentOverlapsWeek } from '@/lib/working-week';

const ASSIGNMENT_JOB_SITE_SELECT =
  'id, name, address, customer_id, customer:customers(id, company_name)';

export const assignmentListSelect = `*, employee:employees(*), customer:customers(id, company_name, salesman), job_site:job_sites(${ASSIGNMENT_JOB_SITE_SELECT})`;

/** Customer the assignment was made to (`job_assignments.customer_id`). */
export function assignmentTargetCustomerId(a: Assignment): string | null {
  return a.customerId || a.customer?.id || null;
}

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

export function assignmentSalesman(a: Assignment, customers?: Customer[]): string | null {
  if (a.customer?.salesman) return a.customer.salesman;

  const customerId = assignmentTargetCustomerId(a);
  if (!customerId || !customers) return null;

  return customers.find((c) => c.id === customerId)?.salesman ?? null;
}

export function assignmentMatchesSalesman(
  a: Assignment,
  salesman: string,
  customers?: Customer[],
): boolean {
  return (assignmentSalesman(a, customers) ?? '') === salesman;
}

export function filterAssignments(
  items: Assignment[],
  filters: {
    customerId?: string;
    salesman?: string;
    status?: string;
    weekStart?: string;
    weekEnd?: string;
  },
  customers?: Customer[],
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
  if (filters.salesman) {
    result = result.filter((a) => assignmentMatchesSalesman(a, filters.salesman!, customers));
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

export function salesmenWithAssignments(
  customers: Customer[],
  assignments: Assignment[],
): string[] {
  return collectDistinct(
    assignments.map((a) => assignmentSalesman(a, customers)),
  );
}
