import { z } from 'zod';
import {
  AssignmentStatus,
  AttendanceStatus,
  CustomerStatus,
  DocumentCategory,
  EmployeeStatus,
  JobOrderStatus,
  JobSiteStatus,
  SafetyAudience,
  TimesheetStatus,
  UserRole,
  UserStatus,
} from './enums';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  phone: z.string().optional(),
  role: z.nativeEnum(UserRole),
  status: z.nativeEnum(UserStatus).optional(),
  customerId: z.string().optional(),
  employeeId: z.string().optional(),
});

export const updateUserSchema = createUserSchema.partial().omit({ password: true }).extend({
  password: z.string().min(8).optional(),
});

export const createEmployeeSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  position: z.string().optional(),
  hourlyRate: z.number().positive().optional(),
  billRate: z.number().positive().optional(),
  status: z.nativeEnum(EmployeeStatus).optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

export const createCustomerSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  contactPhone: z.string().optional(),
  officeEmail: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  salesman: z.string().optional(),
  customerType: z.string().optional(),
  status: z.nativeEnum(CustomerStatus).optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const createCustomerUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  phone: z.string().optional(),
});

export const createWorkerUserSchema = createCustomerUserSchema;

export const createJobSiteSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  name: z.string().min(1, 'Name is required'),
  address: z.string().min(1, 'Address is required'),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  foremanName: z.string().optional(),
  foremanPhone: z.string().optional(),
  foremanEmail: z.string().email().optional().or(z.literal('')),
  status: z.nativeEnum(JobSiteStatus).optional(),
});

export const updateJobSiteSchema = createJobSiteSchema.partial();

export const createAssignmentSchema = z.object({
  employeeId: z.string().min(1, 'Employee is required'),
  customerId: z.string().min(1, 'Customer is required'),
  jobSiteId: z.string().min(1, 'Job site is required'),
  assignedDate: z.string().min(1, 'Assigned date is required'),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  status: z.nativeEnum(AssignmentStatus).optional(),
  notes: z.string().optional(),
});

export const updateAssignmentSchema = createAssignmentSchema.partial();

export const endAssignmentSchema = z.object({
  status: z.enum(['COMPLETED', 'CANCELLED']),
});

export const clockInSchema = z.object({
  employeeId: z.string().min(1),
  customerId: z.string().min(1),
  jobSiteId: z.string().min(1),
  assignmentId: z.string().optional(),
  clockInLatitude: z.number().optional(),
  clockInLongitude: z.number().optional(),
});

export const clockOutSchema = z.object({
  attendanceLogId: z.string().min(1),
  clockOutLatitude: z.number().optional(),
  clockOutLongitude: z.number().optional(),
});

export const createJobOrderSchema = z.object({
  orderNumber: z.string().min(1),
  customerId: z.string().min(1),
  jobSiteId: z.string().min(1),
  employeeId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  startDate: z.string().min(1),
  startTime: z.string().optional(),
  requiredPosition: z.string().optional(),
  instructions: z.string().optional(),
  safetyNotes: z.string().optional(),
  status: z.nativeEnum(JobOrderStatus).optional(),
});

export const updateJobOrderSchema = createJobOrderSchema.partial();

export const createTimesheetSchema = z.object({
  employeeId: z.string().min(1),
  customerId: z.string().min(1),
  jobSiteId: z.string().min(1),
  assignmentId: z.string().optional(),
  workDate: z.string().optional(),
  weekStartDate: z.string().optional(),
  weekEndDate: z.string().optional(),
  totalHours: z.number().min(0),
  notes: z.string().optional(),
  status: z.nativeEnum(TimesheetStatus).optional(),
});

export const signTimesheetSchema = z.object({
  foremanName: z.string().min(1),
  foremanEmail: z.string().email().optional().or(z.literal('')),
  signatureDataUrl: z.string().min(1),
});

export const createSafetyBulletinSchema = z
  .object({
    title: z.string().min(1),
    message: z.string().min(1),
    fileUrl: z.string().optional(),
    audience: z.nativeEnum(SafetyAudience),
    jobSiteId: z.string().optional(),
    employeeIds: z.array(z.string()).optional(),
  })
  .refine(
    (data) =>
      data.audience !== SafetyAudience.SPECIFIC_JOB_SITE || !!data.jobSiteId,
    { message: 'Job site is required for site-specific bulletins', path: ['jobSiteId'] },
  )
  .refine(
    (data) =>
      data.audience !== SafetyAudience.SPECIFIC_WORKERS ||
      (data.employeeIds?.length ?? 0) > 0,
    { message: 'Select at least one worker', path: ['employeeIds'] },
  );

export const createDocumentSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.nativeEnum(DocumentCategory),
});

export const updateSettingsSchema = z.object({
  companyName: z.string().optional(),
  officeEmail: z.string().email().optional().or(z.literal('')),
  dashboardSubdomain: z.string().optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.coerce.number().int().positive().optional(),
  smtpUser: z.string().optional(),
  smtpFromEmail: z.string().email().optional().or(z.literal('')),
  smtpFromName: z.string().optional(),
  emailEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
});

export const attendanceFilterSchema = z.object({
  date: z.string().optional(),
  employeeId: z.string().optional(),
  customerId: z.string().optional(),
  jobSiteId: z.string().optional(),
  status: z.nativeEnum(AttendanceStatus).optional(),
});

export const bulkCustomerRowSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  contactPhone: z.string().optional(),
  officeEmail: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  salesman: z.string().optional(),
  customerType: z.string().optional(),
  status: z.nativeEnum(CustomerStatus).optional(),
});

export const bulkEmployeeRowSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  position: z.string().optional(),
  hourlyRate: z.coerce.number().positive().optional(),
  status: z.nativeEnum(EmployeeStatus).optional(),
  createPortalAccess: z.boolean().optional(),
  password: z.string().min(8).optional().or(z.literal('')),
});

export const createSupervisorUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional(),
});

export const assignSupervisorSitesSchema = z.object({
  userId: z.string().uuid(),
  jobSiteIds: z.array(z.string().uuid()),
});

export const bulkImportResultSchema = z.object({
  imported: z.number(),
  skipped: z.number(),
  errors: z.array(
    z.object({
      row: z.number(),
      message: z.string(),
    }),
  ),
  results: z
    .array(
      z.object({
        row: z.number(),
        success: z.boolean(),
        message: z.string().optional(),
        id: z.string().optional(),
        generatedPassword: z.string().optional(),
      }),
    )
    .optional(),
});

export type BulkCustomerRow = z.infer<typeof bulkCustomerRowSchema>;
export type BulkEmployeeRow = z.infer<typeof bulkEmployeeRowSchema>;
export type BulkImportResult = z.infer<typeof bulkImportResultSchema>;

export interface ImportRowResult {
  row: number;
  status: 'ready' | 'warning' | 'error' | 'conflict';
  action: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface ImportBatchResult {
  dryRun: boolean;
  pasted: number;
  created: number;
  updated: number;
  skipped?: number;
  failed: number;
  conflicts?: number;
  results: ImportRowResult[];
  runId?: string | null;
}

export interface AssignmentImportResolution {
  row: number;
  action: 'skip' | 'move';
  oldEndDate?: string;
  newStartDate?: string;
}

export type CreateCustomerUserInput = z.infer<typeof createCustomerUserSchema>;
export type CreateWorkerUserInput = z.infer<typeof createWorkerUserSchema>;
export type CreateSupervisorUserInput = z.infer<typeof createSupervisorUserSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type CreateJobSiteInput = z.infer<typeof createJobSiteSchema>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type CreateJobOrderInput = z.infer<typeof createJobOrderSchema>;
export type CreateTimesheetInput = z.infer<typeof createTimesheetSchema>;
export type SignTimesheetInput = z.infer<typeof signTimesheetSchema>;
