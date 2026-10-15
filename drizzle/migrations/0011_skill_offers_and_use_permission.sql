CREATE OR REPLACE FUNCTION public.valid_character_permissions(p jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
SELECT jsonb_typeof(p)='object' AND NOT EXISTS(SELECT 1 FROM jsonb_each_text(p) e WHERE e.key NOT IN ('bio','primary','secondary','inventory','notes','history','skills') OR e.value NOT IN ('none','read','use','edit') OR (e.key='history' AND e.value='edit') OR (e.value='use' AND e.key<>'skills')) AND EXISTS(SELECT 1 FROM jsonb_each_text(p) e WHERE e.value IN ('read','use','edit')) $$;

CREATE OR REPLACE FUNCTION public.commit_skill_action_member(_id text, _actor uuid, _op uuid, _expected timestamptz, _data jsonb, _entries jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.characters; p jsonb; stamp timestamptz = clock_timestamp(); e jsonb; j jsonb; BEGIN
IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=_actor AND NOT is_blocked) THEN RAISE EXCEPTION 'Доступ закрыт'; END IF;
SELECT * INTO c FROM public.characters WHERE id=_id FOR UPDATE;
IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=c.owner_id AND NOT is_blocked) THEN RAISE EXCEPTION 'Персонаж недоступен'; END IF;
SELECT permissions INTO p FROM public.character_members WHERE character_id=_id AND user_id=_actor;
IF jsonb_typeof(_entries) <> 'array' OR jsonb_array_length(_entries) = 0 THEN RAISE EXCEPTION 'Пустая операция'; END IF;
IF p IS NULL OR NOT (p->>'skills'='edit' OR (p->>'skills'='use' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(_entries) x WHERE x->>'action' NOT IN ('apply','undo')))) THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
IF EXISTS (SELECT 1 FROM public.skill_action_log WHERE op_id=_op AND character_id=_id) THEN RETURN jsonb_build_object('duplicate', true, 'version', c.updated_at, 'data', c.data); END IF;
IF c.updated_at <> _expected THEN RAISE EXCEPTION 'CONFLICT'; END IF;
j = c.data || jsonb_build_object('skills', coalesce(_data->'skills','[]'::jsonb), 'exhaustion', coalesce(_data->'exhaustion','0'::jsonb),
  'activeEffects', public.skill_effects_of(c.data->'activeEffects',false)||public.skill_effects_of(_data->'activeEffects',true),
  'log', coalesce(_data->'log', c.data->'log'), 'id', c.id, 'updatedAt', stamp);
UPDATE public.characters SET data=j, updated_at=stamp WHERE id=_id;
FOR e IN SELECT value FROM jsonb_array_elements(_entries) LOOP
  INSERT INTO public.skill_action_log(op_id, character_id, actor_id, skill_id, action, details, compensates)
  VALUES (_op, _id, _actor, nullif(e->>'skillId',''), e->>'action', coalesce(e->'details','{}'::jsonb), nullif(e->>'compensates','')::uuid);
END LOOP;
RETURN jsonb_build_object('duplicate', false, 'version', stamp, 'data', j); END $$;
REVOKE ALL ON FUNCTION public.commit_skill_action_member(text,uuid,uuid,timestamptz,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_skill_action_member(text,uuid,uuid,timestamptz,jsonb,jsonb) TO service_role;

CREATE TABLE public.skill_transfer_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user uuid NOT NULL, from_character_id text NOT NULL, from_character_name text NOT NULL DEFAULT '', from_user_name text NOT NULL DEFAULT '',
  to_user uuid NOT NULL, skill_name text NOT NULL, mode text NOT NULL CHECK (mode IN ('teach_novice','teach_current')),
  payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  to_character_id text, created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz);
GRANT SELECT ON public.skill_transfer_offers TO authenticated;
GRANT ALL ON public.skill_transfer_offers TO service_role;
ALTER TABLE public.skill_transfer_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parties read offers" ON public.skill_transfer_offers FOR SELECT TO authenticated USING (public.account_active() AND (from_user=auth.uid() OR to_user=auth.uid()));
CREATE INDEX ON public.skill_transfer_offers(to_user, status);
CREATE INDEX ON public.skill_transfer_offers(from_user, status);

CREATE OR REPLACE FUNCTION public.create_skill_offer(_char text, _email text, _mode text, _name text, _payload jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.characters; r uuid; res uuid; BEGIN
IF NOT public.account_active() THEN RAISE EXCEPTION 'Доступ закрыт'; END IF;
SELECT * INTO c FROM public.characters WHERE id=_char AND owner_id=auth.uid(); IF NOT FOUND THEN RAISE EXCEPTION 'Передавать может только владелец'; END IF;
SELECT id INTO r FROM auth.users WHERE lower(email)=lower(trim(_email));
IF r IS NULL OR r=auth.uid() OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=r AND NOT is_blocked) THEN RAISE EXCEPTION 'Передача недоступна для этого адреса'; END IF;
IF _mode NOT IN ('teach_novice','teach_current') OR jsonb_typeof(_payload)<>'object' OR length(_payload::text)>200000 THEN RAISE EXCEPTION 'Некорректное предложение'; END IF;
IF (SELECT count(*) FROM public.skill_transfer_offers WHERE from_user=auth.uid() AND status='pending')>=50 THEN RAISE EXCEPTION 'Слишком много ожидающих предложений'; END IF;
INSERT INTO public.skill_transfer_offers(from_user,from_character_id,from_character_name,from_user_name,to_user,skill_name,mode,payload)
VALUES(auth.uid(),_char,coalesce(c.data->>'name',''),coalesce((SELECT display_name FROM public.profiles WHERE id=auth.uid()),''),r,left(_name,120),_mode,_payload) RETURNING id INTO res;
RETURN res; END $$;

CREATE OR REPLACE FUNCTION public.accept_skill_offer(_offer uuid, _char text, _expected timestamptz, _data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.skill_transfer_offers; c public.characters; stamp timestamptz = clock_timestamp(); BEGIN
IF NOT public.account_active() THEN RAISE EXCEPTION 'Доступ закрыт'; END IF;
SELECT * INTO o FROM public.skill_transfer_offers WHERE id=_offer AND to_user=auth.uid() FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Предложение не найдено'; END IF;
IF o.status='accepted' AND o.to_character_id=_char THEN RETURN jsonb_build_object('duplicate',true); END IF;
IF o.status<>'pending' THEN RAISE EXCEPTION 'Предложение уже закрыто'; END IF;
SELECT * INTO c FROM public.characters WHERE id=_char AND owner_id=auth.uid() FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Выберите своего героя'; END IF;
IF c.updated_at<>_expected THEN RAISE EXCEPTION 'CONFLICT'; END IF;
UPDATE public.characters SET data=_data || jsonb_build_object('id',c.id,'updatedAt',stamp), updated_at=stamp WHERE id=_char;
UPDATE public.skill_transfer_offers SET status='accepted', to_character_id=_char, decided_at=now() WHERE id=_offer;
RETURN jsonb_build_object('duplicate',false,'version',stamp); END $$;

CREATE OR REPLACE FUNCTION public.decide_skill_offer(_offer uuid, _action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
IF NOT public.account_active() THEN RAISE EXCEPTION 'Доступ закрыт'; END IF;
IF _action='decline' THEN UPDATE public.skill_transfer_offers SET status='declined', decided_at=now() WHERE id=_offer AND to_user=auth.uid() AND status='pending';
ELSIF _action='cancel' THEN UPDATE public.skill_transfer_offers SET status='cancelled', decided_at=now() WHERE id=_offer AND from_user=auth.uid() AND status='pending';
ELSE RAISE EXCEPTION 'Неизвестное действие'; END IF;
IF NOT FOUND THEN RAISE EXCEPTION 'Предложение уже закрыто'; END IF; END $$;

REVOKE ALL ON FUNCTION public.create_skill_offer(text,text,text,text,jsonb), public.accept_skill_offer(uuid,text,timestamptz,jsonb), public.decide_skill_offer(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_skill_offer(text,text,text,text,jsonb), public.accept_skill_offer(uuid,text,timestamptz,jsonb), public.decide_skill_offer(uuid,text) TO authenticated, service_role;