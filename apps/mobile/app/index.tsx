import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useApp } from '@/storage/AppProvider';
import { colors } from '@/theme';

export default function Index() {
  const { ready, onboarded } = useApp();
  if (!ready) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }}><ActivityIndicator color={colors.teal} /></View>;
  return <Redirect href={onboarded ? '/home' : '/onboarding'} />;
}
