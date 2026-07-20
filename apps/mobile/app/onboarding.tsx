import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, TextInput } from 'react-native';
import { Button } from '@/components/Button';
import { Screen, Section, Label } from '@/components/Screen';
import { saveSetup } from '@/storage/repositories';
import { useApp } from '@/storage/AppProvider';
import { colors } from '@/theme';

export default function Onboarding() {
  const [belief, setBelief] = useState(''); const [target, setTarget] = useState('活動の生産性'); const [comparison, setComparison] = useState('day vs night'); const [metric, setMetric] = useState('started rate and completed rate'); const { refresh } = useApp();
  async function submit() { if (!belief.trim()) return; await saveSetup(belief.trim(), target.trim(), comparison.trim(), metric.trim()); await refresh(); router.replace('/home'); }
  return <Screen eyebrow="METHEORY" title="自分についての仮説を、観察できる形にする"><Section><Label>Self Belief</Label><TextInput value={belief} onChangeText={setBelief} multiline placeholder="例: 私は夜の方が集中しやすい" placeholderTextColor={colors.muted} style={styles.input} /><Label>観測対象</Label><TextInput value={target} onChangeText={setTarget} style={styles.single} /><Label>比較条件</Label><TextInput value={comparison} onChangeText={setComparison} style={styles.single} /><Label>結果指標</Label><TextInput value={metric} onChangeText={setMetric} style={styles.single} /><Button label="テンプレートから仮説を作る" onPress={submit} /></Section></Screen>;
}
const styles = StyleSheet.create({ input: { minHeight: 112, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 8, padding: 16, color: colors.ink, fontSize: 17, textAlignVertical: 'top' }, single: { minHeight: 48, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 14, color: colors.ink, fontSize: 16 } });
