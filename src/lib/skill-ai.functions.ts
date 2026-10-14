import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/** Generates a 25-level skill proposal. Nothing is saved: the client reviews and selectively accepts it in the editor. */
export const generateSkill = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(v => z.object({ prompt: z.string().trim().min(3).max(2000), type: z.enum(['active', 'passive']).nullable(), current: z.unknown().nullable() }).parse(v))
  .handler(async ({ data, context }) => {
    const a = await context.supabase.rpc('account_active'); if (a.error || !a.data) throw new Error('Доступ закрыт');
    const key = process.env.LOVABLE_API_KEY; if (!key) throw new Error('ИИ не настроен');
    if (JSON.stringify(data.current ?? null).length > 60000) throw new Error('Навык слишком большой для доработки ИИ');
    const { generateSkillDraft } = await import('@/lib/ai/skill-gen.server');
    try { return { draft: await generateSkillDraft(key, data.prompt, data.type, data.current) }; }
    catch (e: any) {
      const status = e?.statusCode ?? e?.cause?.statusCode;
      console.error('skill ai failed', status, e?.message);
      if (status === 402) throw new Error('Закончились кредиты ИИ. Пополните их в настройках рабочего пространства.');
      if (status === 429) throw new Error('ИИ перегружен запросами. Попробуйте позже.');
      if (status === 403) throw new Error('Доступ к ИИ запрещён настройками рабочего пространства.');
      throw new Error('ИИ не смог подготовить навык. Попробуйте изменить запрос.');
    }
  });
