export type ParameterValueType = 'boolean' | 'integer' | 'number' | 'ordinal' | 'single_choice' | 'multi_choice' | 'datetime' | 'duration_minutes' | 'percentage' | 'short_text' | 'tag_set';
export type ParameterLayer = 'base' | 'hypothesis_dependent' | 'sensitive';
export type ParameterSourceType = 'user' | 'system' | 'device' | 'external_app' | 'derived' | 'ai_inferred';
export type Certainty = 'high' | 'medium' | 'low';

export type ParameterValueInput =
  | { valueType: 'boolean'; value: boolean }
  | { valueType: 'integer'; value: number }
  | { valueType: 'number'; value: number }
  | { valueType: 'ordinal'; value: number }
  | { valueType: 'single_choice'; value: string }
  | { valueType: 'multi_choice'; value: string[] }
  | { valueType: 'datetime'; value: string }
  | { valueType: 'duration_minutes'; value: number }
  | { valueType: 'percentage'; value: number }
  | { valueType: 'short_text'; value: string }
  | { valueType: 'tag_set'; value: string[] };

export type ParameterDefinition = { id: string; name_ja: string; description_ja: string; value_type: ParameterValueType; minimum_value: number | null; maximum_value: number | null; unit: string | null; parameter_layer: ParameterLayer; temporal_type: string; askable: number; usable_as_condition: number; usable_as_outcome: number; usable_as_explanation: number; sensitivity: string; enabled_by_default: number; is_active: number; definition_version: string; };
export type AllowedValue = { parameter_id: string; value_key: string; label_ja: string; sort_order: number; numeric_value: number | null; is_active: number; definition_version: string };

export function validateParameterValue(definition: ParameterDefinition, input: ParameterValueInput, allowed: AllowedValue[] = []) {
  if (definition.value_type !== input.valueType) throw new Error(`parameter type mismatch: ${definition.id}`);
  const value = input.value;
  if (input.valueType === 'boolean' && typeof value !== 'boolean') throw new Error('boolean value required');
  if (['integer', 'ordinal', 'duration_minutes', 'percentage'].includes(input.valueType) && (!Number.isFinite(value) || !Number.isInteger(value) && input.valueType === 'integer')) throw new Error('numeric value required');
  if (typeof value === 'number') {
    if (definition.minimum_value !== null && value < definition.minimum_value) throw new Error('value below minimum');
    if (definition.maximum_value !== null && value > definition.maximum_value) throw new Error('value above maximum');
    if (input.valueType === 'percentage' && (value < 0 || value > 100)) throw new Error('percentage must be 0..100');
  }
  if (input.valueType === 'single_choice' && !allowed.some((item) => item.is_active && item.value_key === String(value))) throw new Error('unknown allowed value');
  if ((input.valueType === 'multi_choice' || input.valueType === 'tag_set') && (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))) throw new Error('array of strings required');
  if (input.valueType === 'datetime' && Number.isNaN(Date.parse(String(value)))) throw new Error('invalid datetime');
  return input;
}

export function parseJsonArray(raw: string) { const parsed: unknown = JSON.parse(raw); if (!Array.isArray(parsed)) throw new Error('expected JSON array'); return parsed; }
export function fallbackQuestionText(definition: ParameterDefinition, allowed: AllowedValue[] = []) {
  const target = definition.name_ja;
  if (definition.value_type === 'boolean') return `現在、「${target}」に当てはまりますか？`;
  if (definition.value_type === 'single_choice' || definition.value_type === 'multi_choice') return `現在の「${target}」を選んでください。${allowed.length ? `（${allowed.map((item) => item.label_ja).join('、')}）` : ''}`;
  if (definition.value_type === 'ordinal') return `現在の「${target}」を数値で選んでください。`;
  if (definition.value_type === 'short_text') return `現在の「${target}」を短く入力してください。`;
  return `現在の「${target}」を入力してください。`;
}
