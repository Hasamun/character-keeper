CREATE OR REPLACE FUNCTION public.shared_item_image_access(_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.account_active() AND EXISTS(SELECT 1 FROM public.character_members m JOIN public.characters c ON c.id=m.character_id JOIN public.profiles p ON p.id=c.owner_id WHERE m.user_id=auth.uid() AND m.permissions->>'inventory' IN ('read','edit') AND NOT p.is_blocked AND split_part(_path,'/',1)=c.owner_id::text AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.data->'inventory'->'items') i WHERE i->>'image'=_path OR i->>'thumb'=_path)) $$;
CREATE INDEX IF NOT EXISTS character_invites_character_idx ON public.character_invites(character_id);
CREATE OR REPLACE FUNCTION public.character_invitation(_id uuid DEFAULT NULL,_token text DEFAULT '',_action text DEFAULT 'preview') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r public.character_invites; result jsonb; cid text; BEGIN
IF NOT public.account_active() THEN RAISE EXCEPTION 'Доступ закрыт'; END IF;
SELECT character_id INTO cid FROM public.character_invites WHERE ((_token<>'' AND token_hash=encode(sha256(convert_to(_token,'UTF8')),'hex')) OR (_token='' AND id=_id AND recipient_id=auth.uid()));
IF cid IS NULL THEN RAISE EXCEPTION 'Приглашение недействительно'; END IF;
PERFORM 1 FROM public.characters WHERE id=cid FOR UPDATE;
SELECT * INTO r FROM public.character_invites WHERE character_id=cid AND ((_token<>'' AND token_hash=encode(sha256(convert_to(_token,'UTF8')),'hex')) OR (_token='' AND id=_id AND recipient_id=auth.uid())) FOR UPDATE;
IF NOT FOUND OR r.status<>'pending' OR r.expires_at<=now() OR r.owner_id=auth.uid() OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=r.owner_id AND NOT is_blocked) THEN RAISE EXCEPTION 'Приглашение недействительно'; END IF;
result=jsonb_build_object('id',r.id,'characterId',r.character_id,'ownerName',(SELECT display_name FROM public.profiles WHERE id=r.owner_id),'permissions',r.permissions,'expiresAt',r.expires_at);
IF _action='accept' THEN INSERT INTO public.character_members(character_id,user_id,permissions) VALUES(r.character_id,auth.uid(),r.permissions) ON CONFLICT(character_id,user_id) DO NOTHING; UPDATE public.character_invites SET status='accepted',recipient_id=auth.uid() WHERE id=r.id;
ELSIF _action='decline' THEN UPDATE public.character_invites SET status='declined',recipient_id=auth.uid() WHERE id=r.id;
ELSIF _action<>'preview' THEN RAISE EXCEPTION 'Неизвестное действие'; END IF;
RETURN result; END $$;