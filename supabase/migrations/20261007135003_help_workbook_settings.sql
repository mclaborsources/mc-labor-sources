CREATE TABLE public.help_workbook_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  workbook_url text,
  storage_url text,
  workbook_name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT help_workbook_settings_has_target CHECK (
    (workbook_url IS NOT NULL AND storage_url IS NULL)
    OR (workbook_url IS NULL AND storage_url IS NOT NULL)
    OR (workbook_url IS NULL AND storage_url IS NULL)
  )
);

ALTER TABLE public.help_workbook_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.help_workbook_settings TO authenticated;

CREATE POLICY help_workbook_settings_read
  ON public.help_workbook_settings FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY help_workbook_settings_admin_write
  ON public.help_workbook_settings FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
