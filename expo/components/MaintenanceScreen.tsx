import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Shield, Wrench, Zap } from 'lucide-react-native';
import Colors from '@/constants/colors';

const { width, height } = Dimensions.get('window');

function FloatingParticle({ delay, startX, duration }: { delay: number; startX: number; duration: number }) {
  const translateY = useRef(new Animated.Value(height + 20)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = () => {
      translateY.setValue(height + 20);
      opacity.setValue(0);

      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -20,
            duration,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(opacity, {
              toValue: 0.6,
              duration: duration * 0.2,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0.6,
              duration: duration * 0.6,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: duration * 0.2,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]).start(() => animate());
    };
    animate();
  }, [delay, duration, translateY, opacity]);

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          left: startX,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    />
  );
}

export default function MaintenanceScreen() {
  const insets = useSafeAreaInsets();
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const iconRotate = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(40)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.timing(iconRotate, {
        toValue: 1,
        duration: 8000,
        useNativeDriver: true,
      })
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.parallel([
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
      Animated.timing(slideUp, {
        toValue: 0,
        duration: 1200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [pulseAnim, iconRotate, glowAnim, fadeIn, slideUp]);

  const spin = iconRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const particles = Array.from({ length: 12 }, (_, i) => ({
    delay: i * 800,
    startX: Math.random() * width,
    duration: 6000 + Math.random() * 4000,
  }));

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {particles.map((p, i) => (
        <FloatingParticle key={i} {...p} />
      ))}

      <View style={styles.topAccent}>
        <View style={styles.topLine} />
      </View>

      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeIn,
            transform: [{ translateY: slideUp }],
          },
        ]}
      >
        <View style={styles.iconContainer}>
          <Animated.View style={[styles.glowRing, { opacity: pulseAnim }]} />
          <Animated.View style={[styles.glowRingOuter, { opacity: glowAnim }]} />
          <View style={styles.iconInner}>
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <Wrench size={38} color={Colors.primary} strokeWidth={1.5} />
            </Animated.View>
          </View>
        </View>

        <View style={styles.titleBlock}>
          <View style={styles.dividerLeft} />
          <Text style={styles.titleLabel}>PROTOCOLE</Text>
          <View style={styles.dividerRight} />
        </View>

        <Text style={styles.title}>Maintenance Impériale</Text>

        <Text style={styles.subtitle}>
          Les ingénieurs du Landsraad procèdent à une mise à niveau des systèmes galactiques.
        </Text>

        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Shield size={16} color={Colors.primary} strokeWidth={1.5} />
            <Text style={styles.statusText}>Boucliers planétaires actifs</Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusRow}>
            <Zap size={16} color={Colors.warning} strokeWidth={1.5} />
            <Text style={styles.statusText}>Systèmes en recalibration</Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusRow}>
            <Animated.View style={{ opacity: pulseAnim }}>
              <View style={styles.statusDot} />
            </Animated.View>
            <Text style={styles.statusTextHighlight}>Reprise imminente…</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Vos ressources et flottes sont en sécurité.{'\n'}
          L'Épice continuera de couler.
        </Text>
      </Animated.View>

      <View style={styles.bottomAccent}>
        <View style={styles.bottomLine} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  particle: {
    position: 'absolute',
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.primary,
  },
  topAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    alignItems: 'center',
  },
  topLine: {
    width: '60%',
    height: 1,
    backgroundColor: Colors.primaryDim,
    opacity: 0.3,
  },
  bottomAccent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    alignItems: 'center',
  },
  bottomLine: {
    width: '60%',
    height: 1,
    backgroundColor: Colors.primaryDim,
    opacity: 0.3,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
    maxWidth: 420,
  },
  iconContainer: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  glowRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  glowRingOuter: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 0.5,
    borderColor: Colors.primaryDim,
  },
  iconInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(212, 168, 71, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212, 168, 71, 0.15)',
  },
  titleBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  dividerLeft: {
    width: 32,
    height: 1,
    backgroundColor: Colors.primaryDim,
  },
  dividerRight: {
    width: 32,
    height: 1,
    backgroundColor: Colors.primaryDim,
  },
  titleLabel: {
    fontSize: 11,
    letterSpacing: 4,
    color: Colors.primaryDim,
    fontWeight: '600' as const,
  },
  title: {
    fontSize: 26,
    fontWeight: '300' as const,
    color: Colors.primary,
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 22,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  statusCard: {
    width: '100%',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 32,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  statusDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 4,
  },
  statusText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  statusTextHighlight: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '500' as const,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    marginHorizontal: 4,
  },
  footer: {
    fontSize: 12,
    lineHeight: 20,
    color: Colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
