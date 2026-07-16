import type { NavItem } from '@/lib/navigation-types';

export const adminNavItems: NavItem[] = [
  { label: 'Home', href: '/assignments' },
  {
    label: 'Workforce',
    children: [
      { label: 'Employees', href: '/employees' },
      { label: 'Customers', href: '/customers' },
      { label: 'Job Sites', href: '/job-sites' },
      { label: 'Assignments', href: '/assignments' },
    ],
  },
  {
    label: 'Operations',
    children: [
      { label: 'Attendance', href: '/attendance' },
      { label: 'Job Orders', href: '/job-orders' },
      { label: 'Timesheets', href: '/timesheets' },
      { label: 'Reports', href: '/reports' },
    ],
  },
  {
    label: 'Resources',
    children: [
      { label: 'Safety Bulletins', href: '/safety-bulletins' },
      { label: 'Documents', href: '/documents' },
      { label: 'Notifications', href: '/notifications' },
    ],
  },
  {
    label: 'Admin',
    children: [
      { label: 'Data Import', href: '/data-import' },
      { label: 'Supervisors', href: '/supervisors' },
      { label: 'Settings', href: '/settings' },
    ],
  },
];

export const customerNavItems: NavItem[] = [
  { label: 'Home', href: '/customer/dashboard' },
  { label: 'Job Sites', href: '/customer/job-sites' },
  { label: 'Attendance', href: '/customer/attendance' },
  { label: 'Timesheets', href: '/customer/timesheets' },
];

export const supervisorNavItems: NavItem[] = [
  { label: 'Home', href: '/supervisor/dashboard' },
  { label: 'Job Sites', href: '/supervisor/job-sites' },
  { label: 'Attendance', href: '/supervisor/attendance' },
  { label: 'Timesheets', href: '/supervisor/timesheets' },
  { label: 'Reports', href: '/supervisor/reports' },
];

export const BRAND_HERO_IMAGES = {
  default: '/brand/placement-header.jpg',
  inner: '/brand/innerpage-header.jpg',
  contact: '/brand/contact-header.png',
  homepage: '/brand/homepage_header.png',
  attendance: '/brand/attendance_header.png',
  timesheets: '/brand/timesheet_header.png',
} as const;
