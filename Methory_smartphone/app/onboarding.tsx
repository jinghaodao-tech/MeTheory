import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, TextInput } from 'react-native';
import { Button } from '@/components/Button';
import { Screen, Section, Label } from '@/components/Screen';
import { saveSetup } from '@/storage/repositories';
import { useApp } from '@/storage/AppProvider';
import { colors } from '@/theme';

export default function Onboarding() {
  const [belief, setBelief] = useState('');
  const { refresh } = useApp();
  async function submit() { if (!belief.trim()) return; await saveSetup(belief.trim()); await refresh(); router.replace('/home'); }
  return <Screen eyebrow="METHORY" title="自分についての仮説を、観察できる形にする"><Section><Label>Self Belief</Label><TextInput value={belief} onChangeText={setBelief} multiline placeholder="例: 私は午前中の方が集中しやすい" placeholderTextColor={colors.muted} style={styles.input} /><Button label="仮説を作る" onPress={submit} /></Section></Screen>;
}
const styles = StyleSheet.create({ input: { minHeight: 128, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 8, padding: 16, color: colors.ink, fontSize: 17, textAlignVertical: 'top' } });
