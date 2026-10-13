CREATE OR REPLACE FUNCTION public.account_active() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND NOT is_blocked) $$;
GRANT EXECUTE ON FUNCTION public.account_active() TO authenticated;
CREATE TABLE public.catalog_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL, data jsonb NOT NULL, name text NOT NULL, category text NOT NULL, rank text NOT NULL DEFAULT 'F', slot text NOT NULL DEFAULT '', subtype text NOT NULL DEFAULT '', archived boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.catalog_items TO authenticated; GRANT ALL ON public.catalog_items TO service_role;
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalog_read ON public.catalog_items FOR SELECT TO authenticated USING (public.account_active() AND (NOT archived OR owner_id=auth.uid() OR public.has_role(auth.uid(),'admin')));
CREATE INDEX catalog_filter_idx ON public.catalog_items(archived,category,rank,slot,subtype,updated_at DESC);
CREATE INDEX catalog_name_idx ON public.catalog_items(lower(name));
CREATE TABLE public.catalog_submissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), catalog_id uuid REFERENCES public.catalog_items(id), owner_id uuid NOT NULL, data jsonb NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), reason text NOT NULL DEFAULT '', revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.catalog_submissions TO authenticated; GRANT ALL ON public.catalog_submissions TO service_role;
ALTER TABLE public.catalog_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY submission_read ON public.catalog_submissions FOR SELECT TO authenticated USING(public.account_active() AND (owner_id=auth.uid() OR public.has_role(auth.uid(),'admin')));
CREATE INDEX submission_queue_idx ON public.catalog_submissions(status,created_at);
CREATE TABLE public.admin_audit (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL, action text NOT NULL, target_id text NOT NULL, reason text NOT NULL DEFAULT '', details jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.admin_audit TO authenticated; GRANT ALL ON public.admin_audit TO service_role;
ALTER TABLE public.admin_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_admin_read ON public.admin_audit FOR SELECT TO authenticated USING(public.account_active() AND public.has_role(auth.uid(),'admin'));
CREATE INDEX audit_time_idx ON public.admin_audit(created_at DESC);
CREATE OR REPLACE FUNCTION public.submit_catalog(_data jsonb, _submission_id uuid DEFAULT NULL, _catalog_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v_id uuid; v_row public.catalog_submissions; BEGIN
IF NOT public.account_active() THEN RAISE EXCEPTION 'Доступ ограничен'; END IF;
IF length(trim(coalesce(_data->>'name','')))=0 OR length(_data::text)>200000 OR coalesce(_data->>'category','') NOT IN ('gear','consumable','misc') OR coalesce(_data->>'rank','F') NOT IN ('F','E','D','C','B','A','S') THEN RAISE EXCEPTION 'Некорректный предмет'; END IF;
IF _data ? 'notes' OR _data ? 'history' THEN RAISE EXCEPTION 'Личные данные запрещены'; END IF;
IF _submission_id IS NOT NULL THEN SELECT * INTO v_row FROM public.catalog_submissions WHERE id=_submission_id FOR UPDATE; IF NOT FOUND OR v_row.owner_id<>auth.uid() OR v_row.status='approved' THEN RAISE EXCEPTION 'Предложение недоступно'; END IF;
UPDATE public.catalog_submissions SET data=_data,status='pending',reason='',revision=revision+1,updated_at=now() WHERE id=_submission_id RETURNING id INTO v_id;
ELSE IF _catalog_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.catalog_items WHERE id=_catalog_id AND (owner_id=auth.uid() OR public.has_role(auth.uid(),'admin'))) THEN RAISE EXCEPTION 'Недоступный предмет'; END IF;
INSERT INTO public.catalog_submissions(owner_id,data,catalog_id) VALUES(auth.uid(),_data,_catalog_id) RETURNING id INTO v_id; END IF;
INSERT INTO public.admin_audit(actor_id,action,target_id) VALUES(auth.uid(),'submission_sent',v_id::text); RETURN v_id; END $$;
CREATE OR REPLACE FUNCTION public.review_catalog(_id uuid,_revision integer,_approve boolean,_reason text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r public.catalog_submissions; cid uuid; BEGIN
IF NOT public.account_active() OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
SELECT * INTO r FROM public.catalog_submissions WHERE id=_id FOR UPDATE;
IF NOT FOUND OR r.status<>'pending' OR r.revision<>_revision THEN RAISE EXCEPTION 'Предложение уже изменено или рассмотрено'; END IF;
IF NOT _approve AND length(trim(_reason))=0 THEN RAISE EXCEPTION 'Укажите причину'; END IF;
cid=r.catalog_id;
IF _approve THEN
IF cid IS NULL THEN INSERT INTO public.catalog_items(owner_id,data,name,category,rank,slot,subtype) VALUES(r.owner_id,r.data,r.data->>'name',r.data->>'category',coalesce(r.data->>'rank','F'),coalesce(r.data->>'slot',''),coalesce(r.data->>'subtype','')) RETURNING id INTO cid;
ELSE PERFORM 1 FROM public.catalog_items WHERE id=cid FOR UPDATE; UPDATE public.catalog_items SET data=r.data,name=r.data->>'name',category=r.data->>'category',rank=coalesce(r.data->>'rank','F'),slot=coalesce(r.data->>'slot',''),subtype=coalesce(r.data->>'subtype',''),updated_at=now(),archived=false WHERE id=cid; END IF; END IF;
UPDATE public.catalog_submissions SET status=CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,reason=_reason,catalog_id=cid,updated_at=now(),revision=revision+1 WHERE id=_id;
INSERT INTO public.admin_audit(actor_id,action,target_id,reason,details) VALUES(auth.uid(),CASE WHEN _approve THEN 'submission_approved' ELSE 'submission_rejected' END,_id::text,_reason,jsonb_build_object('catalog_id',cid)); RETURN cid; END $$;
CREATE OR REPLACE FUNCTION public.archive_catalog(_id uuid,_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NOT public.account_active() OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
IF length(trim(_reason))=0 THEN RAISE EXCEPTION 'Укажите причину'; END IF;
UPDATE public.catalog_items SET archived=true,updated_at=now() WHERE id=_id AND NOT archived; IF NOT FOUND THEN RAISE EXCEPTION 'Предмет уже архивирован'; END IF;
INSERT INTO public.admin_audit(actor_id,action,target_id,reason) VALUES(auth.uid(),'catalog_archived',_id::text,_reason); END $$;
CREATE OR REPLACE FUNCTION public.set_account_block(_id uuid,_blocked boolean,_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
PERFORM pg_advisory_xact_lock(827164);
IF NOT public.account_active() OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
IF _id=auth.uid() AND _blocked THEN RAISE EXCEPTION 'Нельзя заблокировать себя'; END IF;
IF length(trim(_reason))=0 THEN RAISE EXCEPTION 'Укажите причину'; END IF;
IF _blocked AND public.has_role(_id,'admin') AND NOT EXISTS(SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id=r.user_id WHERE r.role='admin' AND r.user_id<>_id AND NOT p.is_blocked) THEN RAISE EXCEPTION 'Нельзя заблокировать последнего администратора'; END IF;
UPDATE public.profiles SET is_blocked=_blocked WHERE id=_id; IF NOT FOUND THEN RAISE EXCEPTION 'Аккаунт не найден'; END IF;
INSERT INTO public.admin_audit(actor_id,action,target_id,reason) VALUES(auth.uid(),CASE WHEN _blocked THEN 'account_blocked' ELSE 'account_unblocked' END,_id::text,_reason); END $$;
REVOKE ALL ON FUNCTION public.submit_catalog(jsonb,uuid,uuid), public.review_catalog(uuid,integer,boolean,text),public.archive_catalog(uuid,text),public.set_account_block(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_catalog(jsonb,uuid,uuid),public.review_catalog(uuid,integer,boolean,text),public.archive_catalog(uuid,text),public.set_account_block(uuid,boolean,text) TO authenticated;
CREATE POLICY active_characters ON public.characters AS RESTRICTIVE FOR ALL TO authenticated USING(public.account_active()) WITH CHECK(public.account_active());
CREATE POLICY active_profile_update ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.account_active()) WITH CHECK(public.account_active());
CREATE POLICY active_item_storage ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated USING(bucket_id<>'item-images' OR public.account_active()) WITH CHECK(bucket_id<>'item-images' OR public.account_active());
CREATE POLICY catalog_image_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='catalog-images' AND public.account_active() AND (EXISTS(SELECT 1 FROM public.catalog_items c WHERE NOT c.archived AND ((c.data->>'image')='catalog:'||name OR (c.data->>'thumb')='catalog:'||name)) OR EXISTS(SELECT 1 FROM public.catalog_submissions s WHERE s.owner_id=auth.uid() AND ((s.data->>'image')='catalog:'||name OR (s.data->>'thumb')='catalog:'||name)) OR public.has_role(auth.uid(),'admin')));