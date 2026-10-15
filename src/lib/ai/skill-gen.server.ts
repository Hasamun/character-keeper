import { createOpenAI } from '@ai-sdk/openai';
import { Output, streamText } from 'ai';
import { z } from 'zod';
import { createLovableAiGatewayRunIdFetch } from './run-id.server';
import type { AiSkillDraft } from '@/lib/rules/skills';

const effect = z.object({
  key: z.string(), kind: z.enum(['stat', 'skill', 'ac', 'attack', 'damage', 'resistance', 'vulnerability', 'extra_damage', 'condition', 'ability']),
  target: z.string(), value: z.number().int(), automation: z.enum(['auto', 'confirm', 'manual']), lifecycle: z.enum(['instant', 'sustained', 'gm']),
  damageType: z.string().nullable(), condition: z.string().nullable(), duration: z.string().nullable(), description: z.string().nullable(),
});
export const draftSchema = z.object({
  name: z.string(), type: z.enum(['active', 'passive']), description: z.string(),
  levels: z.array(z.object({ level: z.number().int(), exhaustionCost: z.number().int().nullable(), effects: z.array(effect) })),
});

const RULES = `Ты помогаешь мастеру домашней настольной RPG проектировать навык. Пиши по-русски.
Навык имеет 25 уровней: 5 рангов (Новичок, Любитель, Специалист, Эксперт, Мастер) по 5 уровней.
Верни ВСЕ 25 уровней (level 1..25). Для каждого уровня перечисли ПОЛНЫЙ список действующих на нём эффектов (не только изменения).
Один и тот же эффект на разных уровнях обязан иметь одинаковый key (короткий латинский идентификатор), чтобы прогрессия была прослеживаемой.
kind: stat (target — одна из: Сила, Ловкость, Телосложение, Интеллект, Мудрость, Харизма или как указано), skill (target — вторичный навык), ac, attack, damage, resistance, vulnerability, extra_damage, condition, ability. Для ac/attack/damage target = "".
automation: auto — только простые числовые бонусы; confirm — числовые, но ситуативные; manual — игровые решения мастера (способности, состояния, условия). Никаких бросков кубиков, таймеров и автоматического восстановления.
Для active указывай exhaustionCost (целое ≥0) — стоимость истощения при применении, обычно растущую с рангом; null = как на прошлом уровне. Для passive exhaustionCost = null.
lifecycle: instant — разовый результат применения (урон, лечение, рывок); sustained — длящееся состояние героя после применения (бафф/дебафф до ручного завершения); gm — решает ведущий. Для пассивных навыков используй sustained только для постоянных бонусов. Не путай lifecycle с automation.
Если даны примеры навыков из каталога — используй их как ориентир баланса (величины бонусов и истощения по рангам), но не копируй.
Значения умеренные и сбалансированные; рост силы плавный, заметные скачки — на 5, 10, 15, 20, 25 уровнях.`;

export async function generateSkillDraft(apiKey: string, prompt: string, type: 'active' | 'passive' | null, current: unknown | null, examples: unknown[] = [], signal?: AbortSignal): Promise<AiSkillDraft> {
  const runId = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({ baseURL: 'https://ai.gateway.lovable.dev/v1', apiKey, headers: { 'Lovable-API-Key': apiKey, 'X-Lovable-AIG-SDK': 'vercel-ai-sdk' }, fetch: runId.fetch });
  const result = streamText({
    model: provider.responses('openai/gpt-6-astra'),
    instructions: RULES,
    prompt: `${examples.length ? `Похожие навыки из каталога (ориентир баланса, JSON):\n${JSON.stringify(examples)}\n\n` : ''}${current ? `Текущая версия навыка (развёрнутые уровни, JSON):\n${JSON.stringify(current)}\n\nДоработай её по запросу, сохраняя key существующих эффектов.\n` : ''}${type ? `Тип навыка: ${type}.\n` : ''}Запрос: ${prompt}`,
    output: Output.object({ schema: draftSchema }),
    ...(signal ? { abortSignal: signal } : {}),
    providerOptions: { openai: { forceReasoning: true, reasoningEffort: 'medium', reasoningSummary: 'auto', store: false, include: ['reasoning.encrypted_content'] } },
  });
  return (await result.output) as AiSkillDraft;
}
