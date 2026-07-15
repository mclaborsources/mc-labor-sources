// Types for UI layer (camelCase)
export interface DashboardStats {
  totalEmployees: number;
  activeJobSites: number;
  clockedInToday: number;
  pendingJobOrders: number;
  signedTimesheets: number;
  recentAttendance: AttendanceLog[];
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  hourlyRate: string | number | null;
  billRate?: string | number | null;
  masterEmployeeId?: string | null;
  status: string;
}

export interface Customer {
  id: string;
  companyName: string;
  masterCustomerId?: string | null;
  customerType?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  officeEmail: string | null;
  address: string | null;
  salesman?: string | null;
  status: string;
  _count?: { jobSites: number; users: number };
}

export interface CustomerContact {
  id: string;
  slotNumber: number;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  email: string | null;
  cell: string | null;
  officePhone: string | null;
}

export interface CustomerDetail extends Customer {
  contacts: CustomerContact[];
  jobSites: JobSite[];
  users: { id: string; name: string; email: string; status: string; role: string }[];
}

export interface JobSite {
  id: string;
  customerId: string;
  masterJobId?: string | null;
  startDate?: string | null;
  name: string;
  address: string;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  foremanName: string | null;
  foremanPhone: string | null;
  foremanEmail: string | null;
  status: string;
  customer?: {
    id: string;
    companyName: string;
    salesman?: string | null;
    customerType?: string | null;
  };
  assignments?: Assignment[];
}

export interface Assignment {
  id: string;
  employeeId: string;
  customerId: string;
  jobSiteId: string;
  masterAssignmentId?: string | null;
  assignedDate: string;
  endDate?: string | null;
  startTime: string | null;
  endTime: string | null;
  status: string;
  notes: string | null;
  employee?: Employee;
  customer?: { id: string; companyName: string; salesman?: string | null };
  jobSite?: {
    id: string;
    name: string;
    address?: string;
    customerId?: string;
    foremanName?: string | null;
    foremanPhone?: string | null;
    customer?: { id: string; companyName: string };
  };
}

export interface AttendanceLog {
  id: string;
  employeeId: string;
  customerId: string;
  jobSiteId: string;
  clockInTime: string;
  clockOutTime: string | null;
  clockInLatitude: string | number | null;
  clockInLongitude: string | number | null;
  clockOutLatitude: string | number | null;
  clockOutLongitude: string | number | null;
  clockInLocationLabel?: string | null;
  clockOutLocationLabel?: string | null;
  totalHours: string | number | null;
  status: string;
  employee?: { id: string; firstName: string; lastName: string };
  customer?: { id: string; companyName: string };
  jobSite?: { id: string; name: string };
}

export interface TimesheetEntry {
  id: string;
  timesheetId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  hours: string | number;
  notes: string | null;
  attendanceLogId?: string | null;
}

export interface Timesheet {
  id: string;
  employeeId: string;
  customerId: string;
  jobSiteId: string;
  assignmentId?: string | null;
  workDate?: string | null;
  weekStartDate?: string | null;
  weekEndDate?: string | null;
  totalHours: string | number;
  notes?: string | null;
  status: string;
  createdAt?: string;
  employee?: { id: string; firstName: string; lastName: string };
  customer?: { id: string; companyName: string };
  jobSite?: { id: string; name: string };
  entries?: TimesheetEntry[];
  signature?: {
    id?: string;
    foremanName: string;
    foremanEmail?: string | null;
    signatureImageUrl: string;
    signedAt?: string;
    sentToCustomerOffice: boolean;
    sentToMcLaborOffice: boolean;
  };
}

export interface JobOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  jobSiteId: string;
  employeeId: string | null;
  title: string;
  description: string | null;
  startDate: string;
  startTime: string | null;
  requiredPosition: string | null;
  instructions: string | null;
  safetyNotes: string | null;
  status: string;
  sentAt: string | null;
  acknowledgedAt: string | null;
  createdById: string;
  createdAt?: string;
  employee?: { id: string; firstName: string; lastName: string };
  customer?: { id: string; companyName: string };
  jobSite?: { id: string; name: string };
}

export interface Document {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string;
  category: string;
  uploadedById: string;
  createdAt?: string;
  uploadedBy?: { id: string; name: string };
}

export interface SafetyBulletin {
  id: string;
  title: string;
  message: string;
  fileUrl: string | null;
  audience: string;
  jobSiteId: string | null;
  sentAt: string | null;
  createdById: string;
  createdAt?: string;
  jobSite?: { id: string; name: string };
  recipientEmployeeIds?: string[];
  recipientEmployees?: { id: string; firstName: string; lastName: string }[];
}

export interface Notification {
  id: string;
  userId: string | null;
  employeeId: string | null;
  title: string;
  message: string;
  type: string;
  readAt: string | null;
  createdAt?: string;
}

export interface CustomerDashboard {
  customer: Customer;
  stats: {
    activeJobSites: number;
    workersAssigned: number;
    clockedInToday: number;
    signedTimesheets: number;
  };
  assignments: Assignment[];
  todayAttendance: AttendanceLog[];
  signedTimesheets: Timesheet[];
  jobOrders: unknown[];
}

export interface CustomerJobSite extends JobSite {
  assignments: Assignment[];
}

export interface CompanySettings {
  id: string;
  companyName: string;
  officeEmail: string | null;
  dashboardSubdomain: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpFromEmail: string | null;
  smtpFromName: string | null;
  emailEnabled: boolean;
  pushEnabled: boolean;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  customerId: string | null;
  employeeId: string | null;
}

export interface SupervisorUser extends AuthUser {
  assignedJobSiteCount?: number;
}

export interface SupervisorDashboard {
  stats: {
    assignedJobSites: number;
    workersAssigned: number;
    clockedInToday: number;
    pendingTimesheets: number;
    signedTimesheets: number;
  };
  todayAttendance: AttendanceLog[];
  pendingTimesheets: Timesheet[];
  recentSignedTimesheets: Timesheet[];
}

export interface SupervisorHoursReportRow {
  employeeId: string;
  firstName: string;
  lastName: string;
  jobSiteId: string;
  jobSiteName: string;
  totalHours: number;
  timesheetCount: number;
}

export interface AdminHoursReportRow {
  employeeId: string;
  firstName: string;
  lastName: string;
  customerId: string;
  companyName: string;
  jobSiteId: string;
  jobSiteName: string;
  totalHours: number;
  timesheetCount: number;
}

export type DataImportType = 'EMPLOYEE' | 'CUSTOMER' | 'JOB' | 'ASSIGNMENT';

export interface DataImportRun {
  id: string;
  importType: DataImportType;
  importedBy: string | null;
  importedAt: string;
  pastedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  conflictCount: number;
  weekStartDate: string | null;
  weekEndDate: string | null;
  dryRun: boolean;
  summary: Record<string, unknown>;
  errorDetails: unknown[];
  importedByUser?: { id: string; name: string; email: string } | null;
}
