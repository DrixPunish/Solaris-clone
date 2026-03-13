import React, { useMemo, useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  twinkle: boolean;
}

interface StarFieldProps {
  starCount?: number;
  height?: number;
}

export default React.memo(function StarField({ starCount = 40, height = 220 }: StarFieldProps) {
  const stars = useMemo<Star[]>(() => {
    const result: Star[] = [];
    for (let i = 0; i < starCount; i++) {
      result.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.5 + 0.15,
        twinkle: Math.random() > 0.65,
      });
    }
    return result;
  }, [starCount]);

  const twinkleAnims = useRef(
    stars.filter(s => s.twinkle).map((_s) => new Animated.Value(1))
  ).current;

  useEffect(() => {
    const animations = twinkleAnims.map((anim, _i) => {
      const delay = Math.random() * 3000;
      const duration = 1500 + Math.random() * 2000;
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 0.3,
            duration,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 1,
            duration,
            useNativeDriver: true,
          }),
        ]),
      );
    });
    animations.forEach(a => a.start());
    return () => {
      animations.forEach(a => a.stop());
    };
  }, [twinkleAnims]);

  let twinkleIdx = 0;

  return (
    <View style={[styles.container, { height }]} pointerEvents="none">
      {stars.map((star) => {
        if (star.twinkle) {
          const anim = twinkleAnims[twinkleIdx];
          twinkleIdx++;
          return (
            <Animated.View
              key={star.id}
              style={[
                styles.star,
                {
                  left: `${star.x}%` as unknown as number,
                  top: `${star.y}%` as unknown as number,
                  width: star.size,
                  height: star.size,
                  borderRadius: star.size / 2,
                  opacity: anim ? Animated.multiply(anim, star.opacity) : star.opacity,
                },
              ]}
            />
          );
        }
        return (
          <View
            key={star.id}
            style={[
              styles.star,
              {
                left: `${star.x}%` as unknown as number,
                top: `${star.y}%` as unknown as number,
                width: star.size,
                height: star.size,
                borderRadius: star.size / 2,
                opacity: star.opacity,
              },
            ]}
          />
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  star: {
    position: 'absolute',
    backgroundColor: '#E8DFD0',
  },
});
