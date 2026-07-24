import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen, Section, Label } from '@/components/Screen';
import { saveSetup } from '@/storage/repositories';
import { useApp } from '@/storage/AppProvider';
import { HYPOTHESIS_TEMPLATES } from '@/features/hypothesisTemplates';
import { colors } from '@/theme';

export default function Onboarding() { const [selected, setSelected] = useState(HYPOTHESIS_TEMPLATES[0].key); const [memo, setMemo] = useState(''); const { refresh } = useApp(); async function submit() { await saveSetup(selected, memo); await refresh(); router.replace('/home'); } return <Screen eyebrow="METHEORY" title="仮説テンプレートを選ぶ"><Section><Label>Self Belief / Hypothesis</Label>{HYPOTHESIS_TEMPLATES.map((template) => <Pressable key={template.key} onPress={() => setSelected(template.key)}><Card tone={selected === template.key ? 'teal' : 'surface'}><Text style={styles.title}>{template.label}</Text><Text style={styles.text}>Self Belief: {template.selfBeliefStatement}</Text><Text style={styles.text}>Hypothesis: {template.hypothesisStatement}</Text><Text style={styles.muted}>Evaluation: completed rate / day vs night</Text></Card></Pressable>)}<Label>補足メモ（評価方向には使用しません）</Label><TextInput value={memo} onChangeText={setMemo} multiline placeholder="任意" placeholderTextColor={colors.muted} style={styles.input} /><Button label="このテンプレートで開始" onPress={submit} /></Section></Screen>; }
const styles = StyleSheet.create({ title: { color: colors.ink, fontSize: 16, fontWeight: '800' }, text: { color: colors.ink, lineHeight: 22 }, muted: { color: colors.muted, fontSize: 13 }, input: { minHeight: 80, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 8, padding: 14, color: colors.ink, textAlignVertical: 'top' } });
