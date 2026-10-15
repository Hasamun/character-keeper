CREATE TABLE public.skill_catalog_versions (
  catalog_id uuid NOT NULL REFERENCES public.skill_catalog(id) ON DELETE CASCADE,
  version integer NOT NULL, name text NOT NULL, type text NOT NULL, data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (catalog_id, version));
GRANT SELECT ON public.skill_catalog_versions TO authenticated;
GRANT ALL ON public.skill_catalog_versions TO service_role;
ALTER TABLE public.skill_catalog_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "active users read catalog versions" ON public.skill_catalog_versions FOR SELECT TO authenticated USING (public.account_active());

CREATE OR REPLACE FUNCTION public.snapshot_skill_catalog() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.skill_catalog_versions(catalog_id, version, name, type, data) VALUES (NEW.id, NEW.version, NEW.name, NEW.type, NEW.data)
  ON CONFLICT (catalog_id, version) DO UPDATE SET name=EXCLUDED.name, type=EXCLUDED.type, data=EXCLUDED.data;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.snapshot_skill_catalog() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER skill_catalog_snapshot AFTER INSERT OR UPDATE OF data, version, name, type ON public.skill_catalog FOR EACH ROW EXECUTE FUNCTION public.snapshot_skill_catalog();

INSERT INTO public.skill_catalog_versions(catalog_id, version, name, type, data, created_at)
SELECT id, version, name, type, data, updated_at FROM public.skill_catalog ON CONFLICT DO NOTHING;