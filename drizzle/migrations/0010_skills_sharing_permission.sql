CREATE OR REPLACE FUNCTION public.valid_character_permissions(p jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT jsonb_typeof(p)='object' AND NOT EXISTS(SELECT 1 FROM jsonb_each_text(p) e WHERE e.key NOT IN ('bio','primary','secondary','inventory','notes','history','skills') OR e.value NOT IN ('none','read','edit') OR (e.key='history' AND e.value='edit')) AND EXISTS(SELECT 1 FROM jsonb_each_text(p) e WHERE e.value IN ('read','edit')) $$;

CREATE OR REPLACE FUNCTION public.skill_effects_of(_effects jsonb, _skill boolean) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$
SELECT coalesce(jsonb_agg(e),'[]'::jsonb) FROM jsonb_array_elements(coalesce(_effects,'[]'::jsonb)) e WHERE (coalesce(e->>'sourceType','item')='skill')=_skill $$;

CREATE OR REPLACE FUNCTION public.commit_character_section(_id text,_actor uuid,_expected timestamptz,_data jsonb,_sections text[],_log text) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE c public.characters; p jsonb; k text; stamp timestamptz=clock_timestamp(); j jsonb; BEGIN
IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=_actor AND NOT is_blocked) THEN RAISE EXCEPTION 'Доступ закрыт'; END IF;
SELECT * INTO c FROM public.characters WHERE id=_id FOR UPDATE;
IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=c.owner_id AND NOT is_blocked) THEN RAISE EXCEPTION 'Персонаж недоступен'; END IF;
IF c.updated_at<>_expected THEN RAISE EXCEPTION 'CONFLICT'; END IF;
IF c.owner_id<>_actor THEN
SELECT permissions INTO p FROM public.character_members WHERE character_id=_id AND user_id=_actor;
IF p IS NULL THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
FOREACH k IN ARRAY _sections LOOP IF k NOT IN ('bio','primary','secondary','inventory','notes','skills') OR p->>k IS DISTINCT FROM 'edit' THEN RAISE EXCEPTION 'Недостаточно прав'; END IF; END LOOP;
END IF;
j=c.data;
FOREACH k IN ARRAY _sections LOOP
IF k='bio' THEN j=j||jsonb_build_object('name',_data->'name','race',_data->'race','characterClass',_data->'characterClass','avatar',_data->'avatar');
ELSIF k='primary' THEN j=jsonb_set(j,'{primary}',_data->'primary');
ELSIF k='secondary' THEN j=jsonb_set(j,'{secondary}',_data->'secondary');
-- Item effects come from the caller, skill effects stay as stored (and vice versa below): one section never overwrites the other's effects.
ELSIF k='inventory' THEN j=jsonb_set(j,'{inventory}',_data->'inventory')||jsonb_build_object('activeEffects',public.skill_effects_of(_data->'activeEffects',false)||public.skill_effects_of(j->'activeEffects',true));
ELSIF k='skills' THEN j=j||jsonb_build_object('skills',coalesce(_data->'skills','[]'::jsonb),'exhaustion',coalesce(_data->'exhaustion','0'::jsonb),'activeEffects',public.skill_effects_of(j->'activeEffects',false)||public.skill_effects_of(_data->'activeEffects',true));
ELSIF k='notes' THEN j=jsonb_set(j,'{notes}',_data->'notes'); ELSE RAISE EXCEPTION 'Недопустимый раздел'; END IF;
END LOOP;
IF _log<>'' THEN j=jsonb_set(j,'{log}',coalesce(j->'log','[]'::jsonb)||jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'at',stamp,'text',_log,'actorId',_actor))); END IF;
j=j||jsonb_build_object('updatedAt',stamp,'id',c.id);
UPDATE public.characters SET data=j,name=j->>'name',updated_at=stamp WHERE id=_id;
RETURN stamp; END $$;

-- Member skill actions: only skills/exhaustion/skill effects/log are taken from the computed data.
CREATE OR REPLACE FUNCTION public.commit_skill_action_member(_id text, _actor uuid, _op uuid, _expected timestamptz, _data jsonb, _entries jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.characters; p jsonb; stamp timestamptz = clock_timestamp(); e jsonb; j jsonb; BEGIN
IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=_actor AND NOT is_blocked) THEN RAISE EXCEPTION 'Доступ закрыт'; END IF;
SELECT * INTO c FROM public.characters WHERE id=_id FOR UPDATE;
IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=c.owner_id AND NOT is_blocked) THEN RAISE EXCEPTION 'Персонаж недоступен'; END IF;
SELECT permissions INTO p FROM public.character_members WHERE character_id=_id AND user_id=_actor;
IF p IS NULL OR p->>'skills' IS DISTINCT FROM 'edit' THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
IF EXISTS (SELECT 1 FROM public.skill_action_log WHERE op_id=_op AND character_id=_id) THEN RETURN jsonb_build_object('duplicate', true, 'version', c.updated_at, 'data', c.data); END IF;
IF c.updated_at <> _expected THEN RAISE EXCEPTION 'CONFLICT'; END IF;
IF jsonb_typeof(_entries) <> 'array' OR jsonb_array_length(_entries) = 0 THEN RAISE EXCEPTION 'Пустая операция'; END IF;
j = c.data || jsonb_build_object('skills', coalesce(_data->'skills','[]'::jsonb), 'exhaustion', coalesce(_data->'exhaustion','0'::jsonb),
  'activeEffects', public.skill_effects_of(c.data->'activeEffects',false)||public.skill_effects_of(_data->'activeEffects',true),
  'log', coalesce(_data->'log', c.data->'log'), 'id', c.id, 'updatedAt', stamp);
UPDATE public.characters SET data=j, updated_at=stamp WHERE id=_id;
FOR e IN SELECT value FROM jsonb_array_elements(_entries) LOOP
  INSERT INTO public.skill_action_log(op_id, character_id, actor_id, skill_id, action, details, compensates)
  VALUES (_op, _id, _actor, nullif(e->>'skillId',''), e->>'action', coalesce(e->'details','{}'::jsonb), nullif(e->>'compensates','')::uuid);
END LOOP;
RETURN jsonb_build_object('duplicate', false, 'version', stamp, 'data', j); END $$;
REVOKE ALL ON FUNCTION public.commit_skill_action_member(text, uuid, uuid, timestamptz, jsonb, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_skill_action_member(text, uuid, uuid, timestamptz, jsonb, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.skill_effects_of(jsonb, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.skill_effects_of(jsonb, boolean) TO authenticated, service_role;