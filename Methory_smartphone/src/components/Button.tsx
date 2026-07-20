import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '@/theme';

export function Button({ label, onPress, secondary = false }: { label: string; onPress: () => void; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary, pressed && styles.pressed]}><Text style={[styles.text, secondary && styles.secondaryText]}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({ button: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: colors.teal, paddingHorizontal: 18 }, secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }, pressed: { opacity: 0.72 }, text: { color: '#FFF', fontSize: 15, fontWeight: '800' }, secondaryText: { color: colors.ink } });
