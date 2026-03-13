import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface PlanetVisualProps {
  size?: number;
}

export default React.memo(function PlanetVisual({ size = 140 }: PlanetVisualProps) {
  const halfSize = size / 2;

  return (
    <View style={[styles.container, { width: size * 1.4, height: size * 1.2 }]}>
      <View
        style={[
          styles.glow,
          {
            width: size * 1.3,
            height: size * 1.3,
            borderRadius: size * 0.65,
            top: (size * 1.2 - size * 1.3) / 2,
            left: (size * 1.4 - size * 1.3) / 2,
          },
        ]}
      />
      <LinearGradient
        colors={['#1A0A04', '#6B3A1F', '#C2884A', '#D4A847', '#E8C97A']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[
          styles.planet,
          {
            width: size,
            height: size,
            borderRadius: halfSize,
            top: (size * 1.2 - size) / 2,
            left: (size * 1.4 - size) / 2,
          },
        ]}
      >
        <View
          style={[
            styles.atmosphere,
            {
              width: size * 0.6,
              height: size * 0.12,
              borderRadius: size * 0.08,
              top: size * 0.22,
              left: size * 0.15,
            },
          ]}
        />
        <View
          style={[
            styles.sandStorm,
            {
              width: size * 0.35,
              height: size * 0.08,
              borderRadius: size * 0.04,
              top: size * 0.42,
              left: size * 0.4,
            },
          ]}
        />
        <View
          style={[
            styles.atmosphereDark,
            {
              width: size * 0.4,
              height: size * 0.1,
              borderRadius: size * 0.05,
              top: size * 0.6,
              left: size * 0.3,
            },
          ]}
        />
        <View
          style={[
            styles.crater,
            {
              width: size * 0.12,
              height: size * 0.12,
              borderRadius: size * 0.06,
              top: size * 0.35,
              left: size * 0.18,
            },
          ]}
        />
      </LinearGradient>
      <View
        style={[
          styles.ring,
          {
            width: size * 1.35,
            height: size * 0.28,
            borderRadius: size * 0.7,
            top: size * 1.2 / 2 - size * 0.14,
            left: (size * 1.4 - size * 1.35) / 2,
          },
        ]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  glow: {
    position: 'absolute',
    backgroundColor: 'rgba(212, 168, 71, 0.1)',
  },
  planet: {
    position: 'absolute',
    overflow: 'hidden',
    zIndex: 2,
  },
  atmosphere: {
    position: 'absolute',
    backgroundColor: 'rgba(232, 201, 122, 0.12)',
  },
  sandStorm: {
    position: 'absolute',
    backgroundColor: 'rgba(212, 168, 71, 0.15)',
  },
  atmosphereDark: {
    position: 'absolute',
    backgroundColor: 'rgba(26, 10, 4, 0.2)',
  },
  crater: {
    position: 'absolute',
    backgroundColor: 'rgba(107, 58, 31, 0.3)',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(212, 168, 71, 0.25)',
    zIndex: 3,
  },
});
