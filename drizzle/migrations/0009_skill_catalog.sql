CREATE TABLE public.skill_catalog (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL, name text NOT NULL, type text NOT NULL CHECK(type IN ('active','passive')), data jsonb NOT NULL, archived boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.skill_catalog TO authenticated; GRANT ALL ON public.skill_catalog TO service_role;
ALTER TABLE public.skill_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY skill_catalog_read ON public.skill_catalog FOR SELECT TO authenticated USING(public.account_active() AND (NOT archived OR public.has_role(auth.uid(),'admin')));
CREATE INDEX skill_catalog_list_idx ON public.skill_catalog(archived, updated_at DESC);
CREATE TABLE public.skill_catalog_submissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), catalog_id uuid REFERENCES public.skill_catalog(id), owner_id uuid NOT NULL, data jsonb NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), reason text NOT NULL DEFAULT '', revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.skill_catalog_submissions TO authenticated; GRANT ALL ON public.skill_catalog_submissions TO service_role;
ALTER TABLE public.skill_catalog_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY skill_submission_read ON public.skill_catalog_submissions FOR SELECT TO authenticated USING(public.account_active() AND (owner_id=auth.uid() OR public.has_role(auth.uid(),'admin')));
CREATE INDEX skill_submission_queue_idx ON public.skill_catalog_submissions(status, created_at);

CREATE OR REPLACE FUNCTION public.submit_skill(_data jsonb, _submission_id uuid DEFAULT NULL, _catalog_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v_id uuid; v_row public.skill_catalog_submissions; BEGIN
IF auth.uid() IS NULL OR NOT public.account_active() THEN RAISE EXCEPTION 'Доступ ограничен'; END IF;
IF length(trim(coalesce(_data->>'name','')))=0 OR length(_data::text)>200000 OR coalesce(_data->>'type','') NOT IN ('active','passive') OR jsonb_typeof(_data->'levels')<>'array' OR jsonb_array_length(_data->'levels')<>25 THEN RAISE EXCEPTION 'Некорректный навык'; END IF;
IF _submission_id IS NOT NULL THEN
  SELECT * INTO v_row FROM public.skill_catalog_submissions WHERE id=_submission_id FOR UPDATE;
  IF NOT FOUND OR v_row.owner_id<>auth.uid() OR v_row.status='approved' THEN RAISE EXCEPTION 'Предложение недоступно'; END IF;
  UPDATE public.skill_catalog_submissions SET data=_data,status='pending',reason='',revision=revision+1,updated_at=now() WHERE id=_submission_id RETURNING id INTO v_id;
ELSE
  IF _catalog_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.skill_catalog WHERE id=_catalog_id AND (owner_id=auth.uid() OR public.has_role(auth.uid(),'admin'))) THEN RAISE EXCEPTION 'Недоступный навык'; END IF;
  INSERT INTO public.skill_catalog_submissions(owner_id,data,catalog_id) VALUES(auth.uid(),_data,_catalog_id) RETURNING id INTO v_id;
END IF;
INSERT INTO public.admin_audit(actor_id,action,target_id) VALUES(auth.uid(),'skill_submission_sent',v_id::text); RETURN v_id; END $$;

CREATE OR REPLACE FUNCTION public.review_skill(_id uuid,_revision integer,_approve boolean,_reason text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r public.skill_catalog_submissions; cid uuid; BEGIN
IF auth.uid() IS NULL OR NOT public.account_active() OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
SELECT * INTO r FROM public.skill_catalog_submissions WHERE id=_id FOR UPDATE;
IF NOT FOUND OR r.status<>'pending' OR r.revision<>_revision THEN RAISE EXCEPTION 'Предложение уже изменено или рассмотрено'; END IF;
IF NOT _approve AND length(trim(coalesce(_reason,'')))=0 THEN RAISE EXCEPTION 'Укажите причину'; END IF;
IF _approve THEN
  IF r.catalog_id IS NULL THEN
    INSERT INTO public.skill_catalog(owner_id,name,type,data) VALUES(r.owner_id,r.data->>'name',r.data->>'type',r.data) RETURNING id INTO cid;
  ELSE
    UPDATE public.skill_catalog SET name=r.data->>'name',type=r.data->>'type',data=r.data,version=version+1,updated_at=now() WHERE id=r.catalog_id RETURNING id INTO cid;
  END IF;
  UPDATE public.skill_catalog_submissions SET status='approved',catalog_id=cid,reason=coalesce(_reason,''),updated_at=now() WHERE id=_id;
ELSE
  UPDATE public.skill_catalog_submissions SET status='rejected',reason=_reason,updated_at=now() WHERE id=_id;
END IF;
INSERT INTO public.admin_audit(actor_id,action,target_id,reason) VALUES(auth.uid(),CASE WHEN _approve THEN 'skill_submission_approved' ELSE 'skill_submission_rejected' END,_id::text,coalesce(_reason,''));
RETURN cid; END $$;

CREATE OR REPLACE FUNCTION public.archive_skill(_id uuid,_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF auth.uid() IS NULL OR NOT public.account_active() OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
UPDATE public.skill_catalog SET archived=true,updated_at=now() WHERE id=_id AND NOT archived; IF NOT FOUND THEN RAISE EXCEPTION 'Навык не найден'; END IF;
INSERT INTO public.admin_audit(actor_id,action,target_id,reason) VALUES(auth.uid(),'skill_archived',_id::text,coalesce(_reason,'')); END $$;

REVOKE ALL ON FUNCTION public.submit_skill(jsonb,uuid,uuid) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.submit_skill(jsonb,uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.review_skill(uuid,integer,boolean,text) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.review_skill(uuid,integer,boolean,text) TO authenticated;
REVOKE ALL ON FUNCTION public.archive_skill(uuid,text) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.archive_skill(uuid,text) TO authenticated;