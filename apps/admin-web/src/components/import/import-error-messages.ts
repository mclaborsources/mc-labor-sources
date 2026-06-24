export type ImportErrorPresentation = {
  title: string;
  message: string;
  guidance?: string;
  technicalDetail?: string;
};

export function mapImportErrorMessage(raw: string): ImportErrorPresentation {
  const text = raw.trim();
  const lower = text.toLowerCase();

  if (lower.includes('job_assignments_one_open_per_employee')) {
    return {
      title: 'Employee already has an open assignment',
      message:
        'This import tried to create a new assignment while the employee still has an open assignment from a prior week.',
      guidance:
        'End the employee\'s existing assignment in Admin (or use Move with end/start dates during conflict resolution), then retry. Cross-week auto-end is deferred to the pilot.',
      technicalDetail: text,
    };
  }

  if (lower.includes('duplicate key') || lower.includes('unique constraint')) {
    return {
      title: 'Duplicate record conflict',
      message: 'One or more rows conflict with existing data in the portal.',
      guidance: 'Review the preview for failed rows, resolve duplicates, or update existing records before retrying.',
      technicalDetail: text,
    };
  }

  if (lower.includes('not found') || lower.includes('not authorized')) {
    return {
      title: 'Import validation failed',
      message: text,
      guidance: 'Check that required IDs exist in the workbook or portal and that you have admin access.',
      technicalDetail: text,
    };
  }

  return {
    title: 'Import failed',
    message: 'Something went wrong while saving the import.',
    guidance: 'Review the preview, fix any failed rows, and try again. Contact support if the issue persists.',
    technicalDetail: text,
  };
}
