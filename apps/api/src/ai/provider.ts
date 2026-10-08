import { createHash } from 'node:crypto';
import { aiClassificationSchema, type AiClassification } from '@civicfix/shared';
import type { Env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export interface AiProvider {
  name: string;
  classify(input: {
    description: string;
    title: string;
    address?: string;
  }): Promise<AiClassification>;
}

class NoneProvider implements AiProvider {
  name = 'none';
  async classify(): Promise<AiClassification> {
    throw new Error('AI disabled');
  }
}

class MockProvider implements AiProvider {
  name = 'mock';
  async classify(input: { description: string; title: string }): Promise<AiClassification> {
    const text = `${input.title} ${input.description}`.toLowerCase();
    let category = 'OTHER';
    let subcategory = 'GENERAL';
    let severity: AiClassification['severity'] = 'MEDIUM';
    const hazards: string[] = [];

    if (text.includes('garbage') || text.includes('waste') || text.includes('trash')) {
      category = 'WASTE_MANAGEMENT';
      subcategory = 'GARBAGE_COLLECTION';
      hazards.push('public_health');
    } else if (text.includes('pothole') || text.includes('road')) {
      category = 'ROADS';
      subcategory = 'POTHOLE';
      hazards.push('obstruction');
    } else if (text.includes('light')) {
      category = 'STREETLIGHT';
      subcategory = 'BROKEN_LIGHT';
      hazards.push('public_safety');
    } else if (text.includes('drain') || text.includes('flood')) {
      category = 'DRAINAGE';
      subcategory = 'OVERFLOW';
      hazards.push('public_health');
    } else if (text.includes('water') || text.includes('leak')) {
      category = 'WATER_LEAKAGE';
      subcategory = 'PIPE_LEAK';
      hazards.push('obstruction');
    }

    if (text.includes('5 day') || text.includes('five day') || hazards.includes('public_health')) {
      severity = 'HIGH';
    }
    if (text.includes('urgent') || text.includes('accident')) severity = 'CRITICAL';

    return aiClassificationSchema.parse({
      category,
      subcategory,
      severity,
      confidence: 0.86,
      summary: input.description.slice(0, 180),
      suggested_department: category === 'WASTE_MANAGEMENT' ? 'SANITATION' : category,
      possible_hazards: hazards,
      duplicate_search_terms: [category.toLowerCase(), subcategory.toLowerCase()],
    });
  }
}

class OpenAiProvider implements AiProvider {
  name = 'openai';
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  async classify(input: { description: string; title: string; address?: string }): Promise<AiClassification> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'Classify civic complaints. Return JSON with category, subcategory, severity (LOW|MEDIUM|HIGH|CRITICAL), confidence (0-1), summary, suggested_department, possible_hazards[], duplicate_search_terms[]. Do not include personal names or contact details.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                title: input.title,
                description: input.description.slice(0, 1500),
                location_type: input.address ? 'provided' : 'unknown',
              }),
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`openai_http_${res.status}`);
      const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      const parsed = JSON.parse(data.choices[0]?.message.content ?? '{}');
      return aiClassificationSchema.parse(parsed);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createAiProvider(env: Env): AiProvider {
  if (env.AI_PROVIDER === 'none') return new NoneProvider();
  if (env.AI_PROVIDER === 'openai' && env.AI_API_KEY) {
    return new OpenAiProvider(env.AI_API_KEY, env.AI_MODEL, env.AI_TIMEOUT_MS);
  }
  return new MockProvider();
}

export function classifySafe(provider: AiProvider, input: Parameters<AiProvider['classify']>[0]) {
  return provider.classify(input).catch((err: unknown) => {
    logger.warn({ err, provider: provider.name }, 'ai_classify_failed');
    return null;
  });
}

export function inputHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
