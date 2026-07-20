import { ReactNode } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme';

export function Screen({ children, title, eyebrow }: { children: ReactNode; title?: string; eyebrow?: string }) {
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content}>{eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}{title && <Text style={styles.title}>{title}</Text>}{children}</ScrollView></SafeAreaView>;
}
export function Section({ children }: { children: ReactNode }) { return <View style={styles.section}>{children}</View>; }
export function Label({ children }: { children: ReactNode }) { return <Text style={styles.label}>{children}</Text>; }
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.paper }, content: { padding: 22, gap: 14, paddingBottom: 44 }, eyebrow: { color: colors.teal, fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }, title: { color: colors.ink, fontSize: 30, fontWeight: '800', lineHeight: 36 }, section: { gap: 10 }, label: { color: colors.muted, fontSize: 13, fontWeight: '700' } });
