export type AiGenerationInput = { generationType: 'question' | 'hypothesis_explanation' | 'self_model'; structuredInput: Record<string, unknown>; promptVersion: string; locale: string; model?: string };
export type AiGenerationResult = { output: unknown; provider: string; model: string; inputTokens: number; outputTokens: number; latencyMs: number; cacheHit: boolean; fallbackUsed: boolean };
export type AiProvider = { providerKey: string; generate(input: AiGenerationInput): Promise<AiGenerationResult> };
export class DeterministicFallbackProvider implements AiProvider { readonly providerKey = 'deterministic_fallback'; async generate(input: AiGenerationInput) { const parameter = String(input.structuredInput.parameterName ?? 'この項目'); const output = { text: `現在の「${parameter}」を入力してください。`, answerSchema: input.structuredInput.answerSchema ?? {} }; return { output, provider: this.providerKey, model: 'fallback-v1', inputTokens: 0, outputTokens: 0, latencyMs: 0, cacheHit: false, fallbackUsed: true }; } }
export class MockAiProvider implements AiProvider {
  readonly providerKey = 'mock';
  private readonly output: unknown;
  constructor(output: unknown = { text: 'mock' }) { this.output = output; }
  async generate(input: AiGenerationInput) { return { output: this.output, provider: this.providerKey, model: input.model ?? 'mock-v1', inputTokens: 1, outputTokens: 1, latencyMs: 0, cacheHit: false, fallbackUsed: false }; }
}
export class AiProviderRegistry { private readonly providers = new Map<string, AiProvider>(); register(provider: AiProvider) { this.providers.set(provider.providerKey, provider); } get(providerKey: string) { return this.providers.get(providerKey); } }
export function validateAiGenerationOutput(output: unknown) { if (!output || typeof output !== 'object') return { valid: false, errors: ['invalid_json'] }; const value = output as Record<string, unknown>; if (typeof value.text !== 'string' || !value.text.trim() || value.text.length > 240) return { valid: false, errors: ['invalid_text'] }; if (/仮説|正しい|きっと|当然/.test(value.text)) return { valid: false, errors: ['leading_or_disclosing_text'] }; return { valid: true, errors: [] }; }
