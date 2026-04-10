import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform, Pressable, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ShieldCheck, Swords, MapPin } from 'lucide-react-native';
import { useGame } from '@/contexts/GameContext';
import { useFleet } from '@/contexts/FleetContext';
import { useNotificationSettings } from '@/contexts/NotificationSettingsContext';
import { trpc } from '@/lib/trpc';
import { formatNumber, calculateEnergyProduced, calculateEnergyConsumption, getResourceStorageCapacity } from '@/utils/gameCalculations';
import Colors from '@/constants/colors';
import ProductionModal from '@/components/ProductionPanel';

interface ResourceItemProps {
  label: string;
  color: string;
  value: number;
  rate?: number;
  storagePercent?: number;
  storageCap?: number;
}

function getStorageColor(percent: number): string {
  if (percent >= 1) return Colors.danger;
  if (percent >= 0.8) return Colors.warning;
  return '';
}

const ResourceItem = React.memo(function ResourceItem({ label, color, value, rate, storagePercent, storageCap }: ResourceItemProps) {
  const storageColor = storagePercent !== undefined ? getStorageColor(storagePercent) : '';
  const valueColor = storageColor || Colors.text;
  const showStorageBar = storagePercent !== undefined && storageCap !== undefined;

  return (
    <View style={styles.item}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={styles.itemContent}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, { color: valueColor }]}>{formatNumber(value)}</Text>
        {showStorageBar && (
          <View style={styles.storageBarOuter}>
            <View
              style={[
                styles.storageBarInner,
                {
                  width: `${Math.min(100, Math.round(storagePercent * 100))}%` as unknown as number,
                  backgroundColor: storageColor || Colors.primary + '60',
                },
              ]}
            />
          </View>
        )}
        {rate !== undefined && rate > 0 && storagePercent !== undefined && storagePercent >= 1 ? (
          <Text style={[styles.rate, { color: Colors.danger }]}>FULL</Text>
        ) : rate !== undefined && rate > 0 ? (
          <Text style={[styles.rate, { color }]}>+{formatNumber(rate)}/h</Text>
        ) : null}
      </View>
    </View>
  );
});

interface GlobalAttack {
  arrival_time: number;
  sender_username: string | null;
  target_coords: [number, number, number];
  target_planet: string | null;
}

function formatCoords(c: [number, number, number]): string {
  return `[${c[0]}:${c[1]}:${c[2]}]`;
}

function IncomingAttackBanner({ missions }: { missions: GlobalAttack[] }) {
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const scanAnim = useRef(new Animated.Value(0)).current;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    );
    pulse.start();

    const scan = Animated.loop(
      Animated.timing(scanAnim, { toValue: 1, duration: 3000, useNativeDriver: true }),
    );
    scan.start();

    return () => { pulse.stop(); scan.stop(); };
  }, [pulseAnim, scanAnim]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const nearest = missions[0];
  const diffMs = nearest.arrival_time - now;
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  const hours = Math.floor(diffSec / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  const secs = diffSec % 60;
  const timeStr = hours > 0
    ? `${hours}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`
    : `${mins}m ${String(secs).padStart(2, '0')}s`;

  const borderOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.9],
  });

  const scanTranslate = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 400],
  });

  const planetLabel = nearest.target_planet
    ? nearest.target_planet
    : formatCoords(nearest.target_coords);

  return (
    <View style={attackStyles.outerWrap}>
      <Animated.View style={[attackStyles.borderGlow, { opacity: borderOpacity }]} />
      <LinearGradient
        colors={['#1A0A00', '#2A0C08', '#1A0A00']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={attackStyles.banner}
      >
        <Animated.View
          style={[
            attackStyles.scanLine,
            { transform: [{ translateX: scanTranslate }] },
          ]}
        />
        <View style={attackStyles.iconWrap}>
          <Swords size={14} color="#D4A847" />
        </View>
        <View style={attackStyles.textWrap}>
          <View style={attackStyles.titleRow}>
            <Text style={attackStyles.title}>
              ALERTE MENACE{missions.length > 1 ? ` \u00D7${missions.length}` : ''}
            </Text>
          </View>
          <View style={attackStyles.detailRow}>
            <MapPin size={9} color="#C9872A" />
            <Text style={attackStyles.planetText}>{planetLabel}</Text>
            <Text style={attackStyles.separator}>{'\u2022'}</Text>
            {nearest.sender_username && (
              <>
                <Text style={attackStyles.senderText}>{nearest.sender_username}</Text>
                <Text style={attackStyles.separator}>{'\u2022'}</Text>
              </>
            )}
            <Text style={attackStyles.countdown}>{timeStr}</Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

function ShieldBanner({ remaining }: { remaining: number }) {
  const pulseAnim = useRef(new Animated.Value(0.7)).current;
  const [localSec, setLocalSec] = useState(remaining);

  useEffect(() => { setLocalSec(remaining); }, [remaining]);

  useEffect(() => {
    const interval = setInterval(() => setLocalSec(p => Math.max(0, p - 1)), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.7, duration: 1200, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulseAnim]);

  const h = Math.floor(localSec / 3600);
  const m = Math.floor((localSec % 3600) / 60);
  const s = localSec % 60;
  const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  return (
    <Animated.View style={[shieldStyles.banner, { opacity: pulseAnim }]}>
      <ShieldCheck size={14} color="#22D3EE" />
      <Text style={shieldStyles.text}>Bouclier Quantique actif</Text>
      <Text style={shieldStyles.timer}>{timeStr}</Text>
    </Animated.View>
  );
}

export default function ResourceBar() {
  const { state, activePlanet, activeProduction, activeProductionPercentages } = useGame();
  const { activeMissions, userId } = useFleet();
  const [modalVisible, setModalVisible] = useState(false);
  const insets = useSafeAreaInsets();

  const shieldQuery = trpc.world.getQuantumShieldStatus.useQuery(
    undefined,
    { enabled: !!userId, refetchInterval: 45000, staleTime: 30000 },
  );
  const shieldActive = shieldQuery.data?.shield_active === true && (shieldQuery.data?.remaining_seconds ?? 0) > 0;
  const shieldRemaining = shieldQuery.data?.remaining_seconds ?? 0;

  const { settings: notifSettings } = useNotificationSettings();

  const allPlayerCoords = useMemo(() => {
    const coordsList: [number, number, number][] = [];
    if (state.coordinates) coordsList.push(state.coordinates);
    for (const colony of (state.colonies ?? [])) {
      if (colony.coordinates) coordsList.push(colony.coordinates);
    }
    return coordsList;
  }, [state.coordinates, state.colonies]);

  const incomingAttacks = useMemo((): GlobalAttack[] => {
    if (!userId) return [];
    return activeMissions
      .filter(m =>
        m.mission_type === 'attack' &&
        m.mission_phase === 'en_route' &&
        m.sender_id !== userId &&
        m.target_coords &&
        allPlayerCoords.some(c =>
          c[0] === m.target_coords[0] &&
          c[1] === m.target_coords[1] &&
          c[2] === m.target_coords[2]
        )
      )
      .map(m => ({
        arrival_time: m.arrival_time,
        sender_username: m.sender_username ?? m.sender_id,
        target_coords: m.target_coords,
        target_planet: m.target_planet,
      }))
      .sort((a, b) => a.arrival_time - b.arrival_time);
  }, [activeMissions, allPlayerCoords, userId]);

  const energyProduced = calculateEnergyProduced(activePlanet.buildings, state.research, activePlanet.ships, activeProductionPercentages);
  const energyConsumed = calculateEnergyConsumption(activePlanet.buildings, activeProductionPercentages);
  const energyBalance = energyProduced - energyConsumed;
  const energyColor = energyBalance < 0 ? Colors.danger : Colors.energy;

  const storageCap = useMemo(() => getResourceStorageCapacity(activePlanet.buildings), [activePlanet.buildings]);
  const storagePct = useMemo(() => ({
    fer: storageCap.fer > 0 ? activePlanet.resources.fer / storageCap.fer : 0,
    silice: storageCap.silice > 0 ? activePlanet.resources.silice / storageCap.silice : 0,
    xenogas: storageCap.xenogas > 0 ? activePlanet.resources.xenogas / storageCap.xenogas : 0,
  }), [activePlanet.resources.fer, activePlanet.resources.silice, activePlanet.resources.xenogas, storageCap]);

  const openModal = useCallback(() => setModalVisible(true), []);
  const closeModal = useCallback(() => setModalVisible(false), []);

  return (
    <>
      <View style={[styles.notchSpacer, { height: insets.top }]} />
      <Pressable onPress={openModal}>
        <LinearGradient
          colors={['#0C1628', '#0A1220', '#0E1424']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.container}
        >
          <ResourceItem label="Fer" color={Colors.fer} value={activePlanet.resources.fer} rate={activeProduction.fer} storagePercent={storagePct.fer} storageCap={storageCap.fer} />
          <View style={styles.divider} />
          <ResourceItem label="Silice" color={Colors.silice} value={activePlanet.resources.silice} rate={activeProduction.silice} storagePercent={storagePct.silice} storageCap={storageCap.silice} />
          <View style={styles.divider} />
          <ResourceItem label="Xenogas" color={Colors.xenogas} value={activePlanet.resources.xenogas} rate={activeProduction.xenogas} storagePercent={storagePct.xenogas} storageCap={storageCap.xenogas} />
          <View style={styles.divider} />
          <View style={styles.stackedSection}>
            <View style={styles.stackedItem}>
              <View style={[styles.dot, { backgroundColor: Colors.solar }]} />
              <View style={styles.itemContent}>
                <Text style={styles.label}>Solar</Text>
                <Text style={[styles.value, { color: Colors.text }]}>{formatNumber(state.solar)}</Text>
              </View>
            </View>
            <View style={styles.stackedDivider} />
            <View style={styles.stackedItem}>
              <View style={[styles.dot, { backgroundColor: energyColor }]} />
              <View style={styles.itemContent}>
                <Text style={styles.label}>{"\u00C9nergie"}</Text>
                <Text style={[styles.value, { color: energyColor }]}>{formatNumber(energyBalance)}</Text>
              </View>
            </View>
          </View>
        </LinearGradient>
      </Pressable>
      {shieldActive && (
        <ShieldBanner remaining={shieldRemaining} />
      )}
      {incomingAttacks.length > 0 && notifSettings.attackBanner && (
        <IncomingAttackBanner missions={incomingAttacks} />
      )}
      <ProductionModal visible={modalVisible} onClose={closeModal} />
    </>
  );
}

const shieldStyles = StyleSheet.create({
  banner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#0A2A30',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#22D3EE25',
  },
  text: {
    color: '#22D3EE',
    fontSize: 11,
    fontWeight: '700' as const,
    flex: 1,
    letterSpacing: 0.5,
  },
  timer: {
    color: '#22D3EE',
    fontSize: 12,
    fontWeight: '800' as const,
    fontVariant: ['tabular-nums'] as const,
  },
});

const attackStyles = StyleSheet.create({
  outerWrap: {
    position: 'relative' as const,
    overflow: 'hidden' as const,
  },
  borderGlow: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#D4A847',
  },
  banner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 37, 37, 0.5)',
    overflow: 'hidden' as const,
  },
  scanLine: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    width: 60,
    opacity: 0.06,
    backgroundColor: '#D4A847',
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(212, 168, 71, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212, 168, 71, 0.25)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  textWrap: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  title: {
    color: '#D4A847',
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 1.8,
    textTransform: 'uppercase' as const,
  },
  detailRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    marginTop: 2,
  },
  planetText: {
    color: '#E8C47A',
    fontSize: 11,
    fontWeight: '600' as const,
  },
  separator: {
    color: '#5C3A1A',
    fontSize: 8,
  },
  senderText: {
    color: '#C9872A',
    fontSize: 11,
    fontWeight: '500' as const,
  },
  countdown: {
    color: '#C23B3B',
    fontSize: 11,
    fontWeight: '700' as const,
    fontVariant: ['tabular-nums'] as const,
  },
});

const styles = StyleSheet.create({
  notchSpacer: {
    backgroundColor: '#060D1B',
  },
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    ...(Platform.OS !== 'web' ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    } : {}),
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
    backgroundColor: Colors.border,
  },
  item: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  itemContent: {
    minWidth: 40,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  label: {
    color: Colors.textMuted,
    fontSize: 8,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
  },
  value: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  storageBarOuter: {
    height: 3,
    backgroundColor: Colors.border,
    borderRadius: 2,
    marginTop: 2,
    overflow: 'hidden',
  },
  storageBarInner: {
    height: 3,
    borderRadius: 2,
  },
  rate: {
    fontSize: 9,
  },
  stackedSection: {
    flex: 1.2,
    paddingHorizontal: 4,
  },
  stackedItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 4,
  },
  stackedDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: 3,
    marginHorizontal: 4,
  },
});
