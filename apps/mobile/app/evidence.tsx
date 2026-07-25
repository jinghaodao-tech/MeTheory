import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Text } from 'react-native';
import { Button } from '@/components/Button';
import { Card, CardTitle, CardValue } from '@/components/Card';
import { Screen, Section } from '@/components/Screen';
import { latestSelfBelief } from '@/storage/repositories/selfBeliefRepository';
import { latestHypothesis } from '@/storage/repositories/hypothesisRepository';
import { latestEvaluation, evaluationSamples } from '@/storage/repositories/evaluationRepository';
import { recentCheckins } from '@/storage/repositories/checkinRepository';
import { colors } from '@/theme';

function resultLabel(result?: string) { return ({ supports: 'Supported', challenges: 'Challenged', inconclusive: 'Inconclusive', insufficient_data: 'Inconclusive' } as Record<string, string>)[result ?? ''] ?? 'Not evaluated'; }
function percentage(value: number, total: number) { return total ? `${Math.round(value / total * 100)}%` : '-'; }
function parsedArray(value: unknown): any[] { try { const parsed = JSON.parse(String(value ?? '[]')); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }

export default function Evidence() {
  const [belief, setBelief] = useState<any>(null);
  const [hypothesis, setHypothesis] = useState<any>(null);
  const [evaluation, setEvaluation] = useState<any>(null);
  const [samples, setSamples] = useState<any[]>([]);
  const [checkins, setCheckins] = useState<any[]>([]);
  useFocusEffect(useCallback(() => {
    Promise.all([latestSelfBelief(), latestHypothesis(), latestEvaluation(), recentCheckins()]).then(async ([nextBelief, nextHypothesis, nextEvaluation, nextCheckins]) => {
      setBelief(nextBelief); setHypothesis(nextHypothesis); setEvaluation(nextEvaluation); setCheckins(nextCheckins);
      setSamples(nextEvaluation ? await evaluationSamples(nextEvaluation.id) : []);
    });
  }, []));
  const records = samples.map((sample) => ({ ...sample, payload: JSON.parse(sample.payload_json ?? '{}'), period: sample.cohort_key }));
  return (
    <Screen eyebrow="EVIDENCE" title="Observation and Evaluation">
      <Section>
        <Card><CardTitle>Self Belief</CardTitle><CardValue>{belief?.statement ?? 'Not registered'}</CardValue></Card>
        <Card tone="teal"><CardTitle>Testable Hypothesis</CardTitle><CardValue>{hypothesis?.statement ?? 'Not registered'}</CardValue></Card>
        <Card><CardTitle>Observed Facts</CardTitle>{['day', 'night'].map((period) => { const rows = records.filter((record) => record.period === period && record.included); const started = rows.filter((record) => record.payload.started === true).length; const completed = rows.filter((record) => record.payload.completed === true).length; return <Text key={period} style={{ color: colors.ink }}>{period === 'day' ? 'Day' : 'Night'}: {rows.length} observations / started {percentage(started, rows.length)} / completed {percentage(completed, rows.length)}</Text>; })}<Text style={{ color: colors.muted }}>The hypothesis evaluation uses completed rate only. Started rate is reference information.</Text></Card>
        <Card><CardTitle>Evaluation</CardTitle><CardValue>{resultLabel(evaluation?.result)}</CardValue><Text style={{ color: colors.ink }}>Observed effect: {evaluation?.observed_effect == null ? '-' : Number(evaluation.observed_effect).toFixed(2)}</Text><Text style={{ color: colors.ink }}>Required effect: {evaluation?.required_effect == null ? '-' : Number(evaluation.required_effect).toFixed(2)}</Text><Text style={{ color: colors.muted }}>Evaluator: {evaluation?.evaluator_version ?? 'comparison-v1'} / Spec: {evaluation?.hypothesis_spec_version ?? '1'}</Text><Text style={{ color: colors.muted }}>Observation period: {evaluation?.window_start ? `${evaluation.window_start} - ${evaluation.window_end}` : '-'}</Text></Card>
        <Card><CardTitle>Cohort results</CardTitle>{parsedArray(evaluation?.cohort_metrics_json).map((metric: any) => <Text key={metric.key} style={{ color: colors.ink }}>{metric.key}: {metric.metricValue == null ? '-' : Number(metric.metricValue).toFixed(2)} / valid {metric.eligibleSamples ?? 0} / missing {metric.missingSamples ?? 0}</Text>)}</Card>
        <Card tone="amber"><CardTitle>Data Quality</CardTitle><Text style={{ color: colors.ink }}>Missing: {evaluation?.missing_count ?? 0} / Excluded: {evaluation?.excluded_count ?? 0}</Text><Text style={{ color: colors.muted }}>{parsedArray(evaluation?.data_quality_json).join(', ') || (evaluation ? 'No quality flags' : 'No evaluation yet')}</Text></Card>
        <Card><CardTitle>Evidence Records</CardTitle>{(samples.length ? samples : checkins).slice(0, 12).map((record: any) => { const payload = record.payload ?? JSON.parse(record.payload_json ?? '{}'); return <Text key={record.id} style={{ color: colors.ink, lineHeight: 21 }}>{new Date(record.scheduled_at).toLocaleString()} / {record.cohort_key ?? 'not evaluated'} / {payload.activity_type ?? '-'} / started {payload.started ? 'yes' : 'no'} / completed {payload.completed ? 'yes' : 'no'} / energy {payload.energy ?? '-'} / {record.included === false ? `excluded: ${record.exclusion_reason ?? record.response_status ?? 'unanswered'}` : 'included'}</Text>; })}</Card>
        <Button label="Open Self Model" onPress={() => router.push('/self-model')} />
      </Section>
    </Screen>
  );
}
