import { Platform } from 'react-native';

export const colors = {
  ink: '#162329',
  muted: '#6E7C80',
  paper: '#F7F8F5',
  surface: '#FFFFFF',
  line: '#DCE5E1',
  teal: '#1E746B',
  tealSoft: '#DDEEE9',
  amber: '#B16A2C',
  amberSoft: '#F7E8D6',
  red: '#B44F4F',
};

export const shadow = Platform.select({
  ios: { shadowColor: '#17312D', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  android: { elevation: 2 },
  default: {},
});
