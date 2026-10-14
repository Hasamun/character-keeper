CREATE TABLE public.skill_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  op_id uuid NOT NULL,
  character_id text NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  skill_id text,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  compensates uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX skill_action_log_op_idx ON public.skill_action_log(op_id, action, coalesce(skill_id,''));
CREATE INDEX skill_action_log_char_idx ON public.skill_action_log(character_id, created_at DESC);
GRANT SELECT ON public.skill_action_log TO authenticated;
GRANT ALL ON public.skill_action_log TO service_role;
ALTER TABLE public.skill_action_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY skill_log_owner_read ON public.skill_action_log FOR SELECT TO authenticated
  USING (public.account_active() AND EXISTS (SELECT 1 FROM public.characters c WHERE c.id = character_id AND c.owner_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.commit_skill_action(_id text, _op uuid, _expected timestamptz, _data jsonb, _entries jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.characters; stamp timestamptz = clock_timestamp(); e jsonb; j jsonb; BEGIN
IF NOT public.account_active() THEN RAISE EXCEPTION 'Доступ закрыт'; END IF;
SELECT * INTO c FROM public.characters WHERE id=_id FOR UPDATE;
IF NOT FOUND OR c.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
IF EXISTS (SELECT 1 FROM public.skill_action_log WHERE op_id=_op AND character_id=_id) THEN
  RETURN jsonb_build_object('duplicate', true, 'version', c.updated_at, 'data', c.data);
END IF;
IF c.updated_at <> _expected THEN RAISE EXCEPTION 'CONFLICT'; END IF;
IF jsonb_typeof(_entries) <> 'array' OR jsonb_array_length(_entries) = 0 THEN RAISE EXCEPTION 'Пустая операция'; END IF;
j = _data || jsonb_build_object('id', c.id, 'updatedAt', stamp);
UPDATE public.characters SET data=j, name=coalesce(j->>'name', c.name), updated_at=stamp WHERE id=_id;
FOR e IN SELECT value FROM jsonb_array_elements(_entries) LOOP
  INSERT INTO public.skill_action_log(op_id, character_id, actor_id, skill_id, action, details, compensates)
  VALUES (_op, _id, auth.uid(), nullif(e->>'skillId',''), e->>'action', coalesce(e->'details','{}'::jsonb), nullif(e->>'compensates','')::uuid);
END LOOP;
RETURN jsonb_build_object('duplicate', false, 'version', stamp, 'data', j); END $$;
REVOKE ALL ON FUNCTION public.commit_skill_action(text, uuid, timestamptz, jsonb, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.commit_skill_action(text, uuid, timestamptz, jsonb, jsonb) TO authenticated;