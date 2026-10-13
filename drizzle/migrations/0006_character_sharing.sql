CREATE TABLE public.character_members (character_id text NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, permissions jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(character_id,user_id));
GRANT SELECT ON public.character_members TO authenticated; GRANT ALL ON public.character_members TO service_role;
ALTER TABLE public.character_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON public.character_members FOR SELECT TO authenticated USING(public.account_active() AND (user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.characters c WHERE c.id=character_id AND c.owner_id=auth.uid())));
CREATE TABLE public.character_invites (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), character_id text NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE, owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, recipient_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE, token_hash text UNIQUE, permissions jsonb NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','revoked')), expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days', created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT(id,character_id,owner_id,recipient_id,permissions,status,expires_at,created_at) ON public.character_invites TO authenticated; GRANT ALL ON public.character_invites TO service_role;
ALTER TABLE public.character_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY invites_read ON public.character_invites FOR SELECT TO authenticated USING(public.account_active() AND (owner_id=auth.uid() OR recipient_id=auth.uid()));
CREATE INDEX character_members_user_idx ON public.character_members(user_id);
CREATE INDEX character_invites_recipient_idx ON public.character_invites(recipient_id,status);
CREATE OR REPLACE FUNCTION public.valid_character_permissions(p jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT jsonb_typeof(p)='object' AND NOT EXISTS(SELECT 1 FROM jsonb_each_text(p) e WHERE e.key NOT IN ('bio','primary','secondary','inventory','notes','history') OR e.value NOT IN ('none','read','edit') OR (e.key='history' AND e.value='edit')) AND EXISTS(SELECT 1 FROM jsonb_each_text(p) e WHERE e.value IN ('read','edit')) $$;
CREATE OR REPLACE FUNCTION public.character_permission(_id text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE c public.characters; p jsonb; BEGIN
IF NOT public.account_active() THEN RAISE EXCEPTION 'Доступ закрыт'; END IF;
SELECT * INTO c FROM public.characters WHERE id=_id; IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=c.owner_id AND NOT is_blocked) THEN RAISE EXCEPTION 'Персонаж недоступен'; END IF;
IF c.owner_id=auth.uid() THEN RETURN jsonb_build_object('owner',true,'ownerId',c.owner_id,'ownerName',(SELECT display_name FROM public.profiles WHERE id=c.owner_id),'permissions','{"bio":"edit","primary":"edit","secondary":"edit","inventory":"edit","notes":"edit","history":"read"}'::jsonb); END IF;
SELECT permissions INTO p FROM public.character_members WHERE character_id=_id AND user_id=auth.uid(); IF p IS NULL THEN RAISE EXCEPTION 'Персонаж недоступен'; END IF;
RETURN jsonb_build_object('owner',false,'ownerId',c.owner_id,'ownerName',(SELECT display_name FROM public.profiles WHERE id=c.owner_id),'permissions',p); END $$;
CREATE OR REPLACE FUNCTION public.manage_character_access(_id text,_action text,_permissions jsonb DEFAULT '{}'::jsonb,_email text DEFAULT '',_token text DEFAULT '',_target uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE owner uuid; recipient uuid; result uuid; BEGIN
IF NOT public.account_active() THEN RAISE EXCEPTION 'Доступ закрыт'; END IF;
SELECT owner_id INTO owner FROM public.characters WHERE id=_id FOR UPDATE; IF owner IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Только владелец управляет доступом'; END IF;
IF _action IN ('account','link','permissions') AND NOT public.valid_character_permissions(_permissions) THEN RAISE EXCEPTION 'Выберите разрешения'; END IF;
IF _action='account' THEN
SELECT id INTO recipient FROM auth.users WHERE lower(email)=lower(trim(_email)); IF recipient IS NULL OR recipient=owner OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=recipient AND NOT is_blocked) THEN RAISE EXCEPTION 'Приглашение недоступно для этого адреса'; END IF;
IF EXISTS(SELECT 1 FROM public.character_members WHERE character_id=_id AND user_id=recipient) THEN RAISE EXCEPTION 'Участник уже имеет доступ'; END IF;
IF EXISTS(SELECT 1 FROM public.character_invites WHERE character_id=_id AND recipient_id=recipient AND status='pending' AND expires_at>now()) THEN RAISE EXCEPTION 'Приглашение уже отправлено'; END IF;
INSERT INTO public.character_invites(character_id,owner_id,recipient_id,permissions) VALUES(_id,owner,recipient,_permissions) RETURNING id INTO result;
ELSIF _action='link' THEN
IF length(_token)<40 OR length(_token)>128 THEN RAISE EXCEPTION 'Некорректная ссылка'; END IF;
INSERT INTO public.character_invites(character_id,owner_id,token_hash,permissions) VALUES(_id,owner,encode(sha256(convert_to(_token,'UTF8')),'hex'),_permissions) RETURNING id INTO result;
ELSIF _action='permissions' THEN UPDATE public.character_members SET permissions=_permissions WHERE character_id=_id AND user_id=_target;
ELSIF _action='remove' THEN DELETE FROM public.character_members WHERE character_id=_id AND user_id=_target;
ELSIF _action='revoke' THEN UPDATE public.character_invites SET status='revoked' WHERE character_id=_id AND id=_target AND status='pending';
ELSE RAISE EXCEPTION 'Неизвестное действие'; END IF;
RETURN result; END $$;
CREATE OR REPLACE FUNCTION public.character_invitation(_id uuid DEFAULT NULL,_token text DEFAULT '',_action text DEFAULT 'preview') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r public.character_invites; result jsonb; BEGIN
IF NOT public.account_active() THEN RAISE EXCEPTION 'Доступ закрыт'; END IF;
SELECT * INTO r FROM public.character_invites WHERE ((_token<>'' AND token_hash=encode(sha256(convert_to(_token,'UTF8')),'hex')) OR (_token='' AND id=_id AND recipient_id=auth.uid())) FOR UPDATE;
IF NOT FOUND OR r.status<>'pending' OR r.expires_at<=now() OR r.owner_id=auth.uid() OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=r.owner_id AND NOT is_blocked) THEN RAISE EXCEPTION 'Приглашение недействительно'; END IF;
result=jsonb_build_object('id',r.id,'characterId',r.character_id,'ownerName',(SELECT display_name FROM public.profiles WHERE id=r.owner_id),'permissions',r.permissions,'expiresAt',r.expires_at);
IF _action='accept' THEN INSERT INTO public.character_members(character_id,user_id,permissions) VALUES(r.character_id,auth.uid(),r.permissions) ON CONFLICT(character_id,user_id) DO NOTHING; UPDATE public.character_invites SET status='accepted',recipient_id=auth.uid() WHERE id=r.id;
ELSIF _action='decline' THEN UPDATE public.character_invites SET status='declined',recipient_id=auth.uid() WHERE id=r.id;
ELSIF _action<>'preview' THEN RAISE EXCEPTION 'Неизвестное действие'; END IF;
RETURN result; END $$;
CREATE OR REPLACE FUNCTION public.commit_character_section(_id text,_actor uuid,_expected timestamptz,_data jsonb,_sections text[],_log text) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE c public.characters; p jsonb; k text; stamp timestamptz=clock_timestamp(); j jsonb; BEGIN
IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=_actor AND NOT is_blocked) THEN RAISE EXCEPTION 'Доступ закрыт'; END IF;
SELECT * INTO c FROM public.characters WHERE id=_id FOR UPDATE;
IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=c.owner_id AND NOT is_blocked) THEN RAISE EXCEPTION 'Персонаж недоступен'; END IF;
IF c.updated_at<>_expected THEN RAISE EXCEPTION 'CONFLICT'; END IF;
IF c.owner_id<>_actor THEN
SELECT permissions INTO p FROM public.character_members WHERE character_id=_id AND user_id=_actor;
IF p IS NULL THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
FOREACH k IN ARRAY _sections LOOP IF k NOT IN ('bio','primary','secondary','inventory','notes') OR p->>k IS DISTINCT FROM 'edit' THEN RAISE EXCEPTION 'Недостаточно прав'; END IF; END LOOP;
END IF;
j=c.data;
FOREACH k IN ARRAY _sections LOOP
IF k='bio' THEN j=j||jsonb_build_object('name',_data->'name','race',_data->'race','characterClass',_data->'characterClass','avatar',_data->'avatar');
ELSIF k='primary' THEN j=jsonb_set(j,'{primary}',_data->'primary');
ELSIF k='secondary' THEN j=jsonb_set(j,'{secondary}',_data->'secondary');
ELSIF k='inventory' THEN j=jsonb_set(j,'{inventory}',_data->'inventory')||jsonb_build_object('activeEffects',coalesce(_data->'activeEffects','[]'::jsonb));
ELSIF k='notes' THEN j=jsonb_set(j,'{notes}',_data->'notes'); ELSE RAISE EXCEPTION 'Недопустимый раздел'; END IF;
END LOOP;
IF _log<>'' THEN j=jsonb_set(j,'{log}',coalesce(j->'log','[]'::jsonb)||jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'at',stamp,'text',_log,'actorId',_actor))); END IF;
j=j||jsonb_build_object('updatedAt',stamp,'id',c.id);
UPDATE public.characters SET data=j,name=j->>'name',updated_at=stamp WHERE id=_id;
RETURN stamp; END $$;
REVOKE ALL ON FUNCTION public.valid_character_permissions(jsonb),public.character_permission(text),public.manage_character_access(text,text,jsonb,text,text,uuid),public.character_invitation(uuid,text,text),public.commit_character_section(text,uuid,timestamptz,jsonb,text[],text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.valid_character_permissions(jsonb),public.character_permission(text),public.manage_character_access(text,text,jsonb,text,text,uuid),public.character_invitation(uuid,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.commit_character_section(text,uuid,timestamptz,jsonb,text[],text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.commit_character_section(text,uuid,timestamptz,jsonb,text[],text) TO service_role;
CREATE OR REPLACE FUNCTION public.shared_item_image_access(_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.account_active() AND EXISTS(SELECT 1 FROM public.character_members m JOIN public.characters c ON c.id=m.character_id JOIN public.profiles p ON p.id=c.owner_id WHERE m.user_id=auth.uid() AND m.permissions->>'inventory' IN ('read','edit') AND NOT p.is_blocked AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.data->'inventory'->'items') i WHERE i->>'image'=_path OR i->>'thumb'=_path)) $$;
REVOKE ALL ON FUNCTION public.shared_item_image_access(text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.shared_item_image_access(text) TO authenticated;
CREATE POLICY shared_item_image_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='item-images' AND public.shared_item_image_access(name));