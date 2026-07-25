import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Button } from '@/components/Button';
import { Card, CardTitle } from '@/components/Card';
import { Screen, Section } from '@/components/Screen';
import { adoptHypothesisCandidate, dismissHypothesisCandidate, generateHypothesisCandidatesForUser, listHypothesisCandidates } from '@/storage/repositories';
import { latestSelfBelief } from '@/storage/repositories/selfBeliefRepository';
import { colors } from '@/theme';

const USER_ID = 'local-user';

export default function Hypotheses() {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => { try { await generateHypothesisCandidatesForUser({ userId: USER_ID }); setCandidates(await listHypothesisCandidates({ userId: USER_ID, status: 'discovered', limit: 10 })); } catch (error) { setMessage(error instanceof Error ? error.message : '候補を読み込めませんでした'); } }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  async function adopt(candidate: any) { const belief = await latestSelfBelief(); if (!belief) { setMessage('先にSelf Beliefを登録してください'); return; } Alert.alert('仮説を採用しますか？', '採用後はtracking中の仮説として新しい観測を集めます。', [{ text: 'キャンセル', style: 'cancel' }, { text: '採用', onPress: async () => { try { await adoptHypothesisCandidate({ userId: USER_ID, candidateId: String(candidate.id), selfBeliefId: belief.id }); router.replace('/home'); } catch (error) { setMessage(error instanceof Error ? error.message : '仮説を採用できませんでした'); } } }]); }
  async function dismiss(candidate: any) { await dismissHypothesisCandidate({ userId: USER_ID, candidateId: String(candidate.id) }); await load(); }
  return <Screen eyebrow="HYPOTHESES" title="仮説候補"><Section><Text style={styles.intro}>観測データから見つかった比較を確認し、追跡する仮説を選びます。候補の表示だけでは仮説は変更されません。</Text>{message ? <Text style={styles.message}>{message}</Text> : null}{candidates.length === 0 ? <Card><CardTitle>候補はまだありません</CardTitle><Text style={styles.muted}>もう少し観測を続けると、条件と結果の組み合わせを比較できます。</Text></Card> : candidates.map((candidate) => <Card key={String(candidate.id)} tone="teal"><CardTitle>{candidate.condition_name_ja ?? candidate.condition_parameter_id} の違い</CardTitle><Text style={styles.text}>{candidate.outcome_name_ja ?? candidate.outcome_parameter_id}への差: {Number(candidate.effect_value).toFixed(2)}</Text><Text style={styles.text}>A: {candidate.cohort_a_key} ({candidate.cohort_a_sample_count - Math.round(Number(candidate.cohort_a_sample_count) * Number(candidate.missing_rate))} valid)</Text><Text style={styles.text}>B: {candidate.cohort_b_key} ({candidate.cohort_b_sample_count - Math.round(Number(candidate.cohort_b_sample_count) * Number(candidate.missing_rate))} valid)</Text><Text style={styles.muted}>score {Number(candidate.candidate_score).toFixed(2)} / missing {Math.round(Number(candidate.missing_rate) * 100)}% / stability {Number(candidate.temporal_stability ?? 0).toFixed(2)}</Text><Button label="この仮説を採用" onPress={() => void adopt(candidate)} /><Pressable onPress={() => void dismiss(candidate)}><Text style={styles.dismiss}>今回は表示しない</Text></Pressable></Card>)}<Button label="Evidenceを見る" onPress={() => router.push('/evidence')} secondary /></Section></Screen>;
}

const styles = StyleSheet.create({ intro: { color: colors.ink, lineHeight: 22 }, text: { color: colors.ink, lineHeight: 22 }, muted: { color: colors.muted, lineHeight: 20 }, message: { color: colors.amber, fontWeight: '700' }, dismiss: { color: colors.muted, textAlign: 'center', paddingVertical: 8, fontWeight: '700' } });
