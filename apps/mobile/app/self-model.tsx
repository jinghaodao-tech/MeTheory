import { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Button } from '@/components/Button';
import { Card, CardTitle, CardValue } from '@/components/Card';
import { Screen, Section } from '@/components/Screen';
import { latestSelfBelief } from '@/storage/repositories/selfBeliefRepository';
import { latestHypothesis } from '@/storage/repositories/hypothesisRepository';
import { latestEvaluation, listEvaluations } from '@/storage/repositories/evaluationRepository';
import { getSetting, setSetting } from '@/storage/repositories/settingsRepository';
import { colors } from '@/theme';
import { templateByKey } from '@/features/hypothesisTemplates';

function status(result?: string) { return ({ supports: 'Supported', challenges: 'Challenged', inconclusive: 'Inconclusive', insufficient_data: 'Inconclusive' } as Record<string, string>)[result ?? ''] ?? '未評価'; }
function interpretation(result: string | undefined, template: ReturnType<typeof templateByKey>) { if (result === 'supports') return template.supportedMessage; if (result === 'challenges') return template.challengedMessage; if (result === 'inconclusive' || result === 'insufficient_data') return template.inconclusiveMessage; return '評価が蓄積されると、暫定的な解釈を表示します。'; }

export default function SelfModel() {
  const [belief, setBelief] = useState<any>(null); const [hypothesis, setHypothesis] = useState<any>(null); const [evaluation, setEvaluation] = useState<any>(null); const [history, setHistory] = useState<any[]>([]); const [decision, setDecision] = useState<string | null>(null);
  useFocusEffect(useCallback(() => { Promise.all([latestSelfBelief(), latestHypothesis(), latestEvaluation(), listEvaluations()]).then(async ([b, h, e, items]) => { setBelief(b); setHypothesis(h); setEvaluation(e); setHistory(items); setDecision(e ? await getSetting<string | null>(`self_model_decision:${e.id}`, null) : null); }); }, []));
  const template = templateByKey(hypothesis?.template_key ?? 'night_completion'); const message = interpretation(evaluation?.result, template);
  async function decide(next: 'reflected' | 'held') { if (!evaluation?.id) return; await setSetting(`self_model_decision:${evaluation.id}`, next); setDecision(next); }
  return <Screen eyebrow="SELF MODEL" title="暫定的な自己理解"><Section><Card><CardTitle>Self Belief</CardTitle><CardValue>{belief?.statement ?? '未登録'}</CardValue></Card><Card tone="teal"><CardTitle>Tracking Hypothesis</CardTitle><CardValue>{hypothesis?.statement ?? '未登録'}</CardValue><Text style={{ color: colors.muted }}>Lifecycle: {hypothesis?.state ?? 'unknown'}</Text></Card><Card><CardTitle>Latest Evaluation</CardTitle><CardValue>{status(evaluation?.result)}</CardValue><Text style={{ color: colors.ink }}>{message}</Text><Text style={{ color: colors.muted }}>評価結果は自動でSelf Modelへ反映されません。ユーザーが判断します。</Text><Button label="Self Modelに反映する" onPress={() => void decide('reflected')} secondary={decision !== 'reflected'} /><Button label="今回は保留する" onPress={() => void decide('held')} secondary={decision !== 'held'} />{decision ? <Text style={{ color: colors.teal }}>判断: {decision === 'reflected' ? '反映済み' : '保留中'}</Text> : null}</Card><Card><CardTitle>Evaluation History</CardTitle>{history.map((item) => <Text key={item.id} style={{ color: colors.muted }}>{new Date(item.evaluated_at).toLocaleString()} / {status(item.result)} / effect {item.observed_effect === null ? '-' : Number(item.observed_effect).toFixed(2)}</Text>)}</Card></Section></Screen>;
}
