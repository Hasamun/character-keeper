ALTER TABLE public.catalog_items ADD COLUMN rank_order integer GENERATED ALWAYS AS (CASE rank WHEN 'F' THEN 0 WHEN 'E' THEN 1 WHEN 'D' THEN 2 WHEN 'C' THEN 3 WHEN 'B' THEN 4 WHEN 'A' THEN 5 WHEN 'S' THEN 6 ELSE 0 END) STORED;
ALTER TABLE public.catalog_items ADD COLUMN price_value numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(data->'price')='number' THEN (data->>'price')::numeric ELSE 0 END) STORED;
CREATE OR REPLACE FUNCTION public.validate_catalog_submission() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ DECLARE f text; e jsonb; BEGIN
IF NEW.owner_id<>auth.uid() AND current_user<>'postgres' AND current_user<>'service_role' THEN RAISE EXCEPTION 'Недопустимый автор'; END IF;
FOREACH f IN ARRAY ARRAY['image','thumb'] LOOP IF NEW.data ? f AND coalesce(NEW.data->>f,'')<>'' AND NOT starts_with(NEW.data->>f,'catalog:'||NEW.owner_id::text||'/') THEN RAISE EXCEPTION 'Недоступное изображение'; END IF; END LOOP;
IF NEW.data ? 'notes' OR NEW.data ? 'history' THEN RAISE EXCEPTION 'Личные данные запрещены'; END IF;
FOR e IN SELECT value FROM jsonb_array_elements(coalesce(NEW.data->'effects','[]'::jsonb)) LOOP IF e ? 'remainingCharges' THEN RAISE EXCEPTION 'Остатки зарядов запрещены в шаблоне'; END IF; END LOOP;
RETURN NEW; END $$;
CREATE TRIGGER validate_catalog_submission BEFORE INSERT OR UPDATE OF data ON public.catalog_submissions FOR EACH ROW EXECUTE FUNCTION public.validate_catalog_submission();