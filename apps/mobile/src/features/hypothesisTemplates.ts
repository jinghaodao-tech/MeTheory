import type { HypothesisSpec } from '@/domain';

export type HypothesisTemplate = {
  key: 'night_completion' | 'day_completion';
  label: string;
  selfBeliefStatement: string;
  hypothesisStatement: string;
  spec: HypothesisSpec;
  supportedMessage: string;
  challengedMessage: string;
  inconclusiveMessage: string;
};

const policy: HypothesisSpec['evaluationPolicy'] = { captureModes: ['momentary_observation'], acceptedSources: ['user_confirmed', 'system'], minimumSamplesPerCohort: 3, maximumCohortRatio: 2, windowDays: 30, excludeLowCertainty: true, maximumMissingRate: 0.2 };
function spec(relation: HypothesisSpec['expectation']['relation']): HypothesisSpec { return { schemaVersion: '1', unit: 'response', scope: [{ field: 'time_period', operator: 'in', value: ['day', 'night'] }], cohorts: [{ key: 'day', conditions: [{ field: 'time_period', operator: 'equals', value: 'day' }] }, { key: 'night', conditions: [{ field: 'time_period', operator: 'equals', value: 'night' }] }], outcome: { field: 'completed', metric: 'binary_rate_difference', positiveValues: [true] }, expectation: { relation, minimumEffect: 0.2 }, evaluationPolicy: policy }; }

export const HYPOTHESIS_TEMPLATES: HypothesisTemplate[] = [
  { key: 'night_completion', label: '夜の方が完了しやすい', selfBeliefStatement: '私は夜の方が活動を完了しやすい', hypothesisStatement: '夜は昼より活動完了率が高い', spec: spec('cohort_a_less_than_b'), supportedMessage: '現在の観測では、夜の方が活動を完了しやすい傾向が見られます。ただし、現在の記録範囲に基づく暫定的な結果です。', challengedMessage: '現在の観測は、「夜の方が活動を完了しやすい」という自己認識とは異なる方向を示しています。原因や性格を断定するものではありません。', inconclusiveMessage: '現在は昼または夜の観測数が不足しているため、まだ判断できません。' },
  { key: 'day_completion', label: '昼の方が完了しやすい', selfBeliefStatement: '私は昼の方が活動を完了しやすい', hypothesisStatement: '昼は夜より活動完了率が高い', spec: spec('cohort_a_greater_than_b'), supportedMessage: '現在の観測では、昼の方が活動を完了しやすい傾向が見られます。ただし、現在の記録範囲に基づく暫定的な結果です。', challengedMessage: '現在の観測は、「昼の方が活動を完了しやすい」という自己認識とは異なる方向を示しています。原因や性格を断定するものではありません。', inconclusiveMessage: '現在は昼または夜の観測数が不足しているため、まだ判断できません。' },
];
export function templateByKey(key: string) { return HYPOTHESIS_TEMPLATES.find((template) => template.key === key) ?? HYPOTHESIS_TEMPLATES[0]; }
