import React from 'react';
import { Text, TouchableOpacity, StyleSheet, TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';

interface ClickableCoordsProps {
  coords: [number, number, number];
  style?: TextStyle;
  center?: boolean;
}

export default function ClickableCoords({ coords, style, center }: ClickableCoordsProps) {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={[styles.touchable, center && styles.centered]}
      activeOpacity={0.6}
      onPress={() =>
        router.replace({
          pathname: '/(tabs)/galaxy',
          params: { g: String(coords[0]), ss: String(coords[1]) },
        })
      }
    >
      <Text style={[styles.coords, style]}>
        [{coords[0]}:{coords[1]}:{coords[2]}]
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touchable: {
    alignSelf: 'flex-start' as const,
  },
  centered: {
    alignSelf: 'center' as const,
  },
  coords: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600' as const,
    textDecorationLine: 'underline' as const,
  },
});
