-- Raymond import email compat: internal domains (ray@mclabor) and normalized contact lists

CREATE OR REPLACE FUNCTION public.is_valid_email(p_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.nullif_import_text(p_email) IS NULL
    OR public.nullif_import_text(p_email) ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+(\.[A-Z0-9.-]*)*$';
$$;

CREATE OR REPLACE FUNCTION public.normalize_import_email(p_email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := public.nullif_import_text(p_email);
  v_part text;
BEGIN
  IF v IS NULL THEN RETURN NULL; END IF;
  FOREACH v_part IN ARRAY regexp_split_to_array(v, '[;,]') LOOP
    v_part := trim(v_part);
    IF v_part <> '' AND public.is_valid_email(v_part) THEN
      RETURN v_part;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
