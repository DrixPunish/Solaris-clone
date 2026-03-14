import React, { useRef, useCallback, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Modal, TouchableOpacity, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Clock, Zap, Lock, X, AlertTriangle, Info, GitBranch } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { formatTime } from '@/utils/gameCalculations';

interface CostItem {
  label: string;
  value: string;
  affordable: boolean;
}

interface StatItem {
  label: string;
  value: string;
}

interface ProductionItem {
  label: string;
  value: string;
  positive: boolean;
}

interface QueueInfo {
  remainingQuantity: number;
  totalQuantity: number;
  currentUnitStartTime: number;
  currentUnitEndTime: number;
  buildTimePerUnit: number;
}

interface GameCardProps {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  level?: number;
  count?: number;
  subtitle?: string;
  description: string;
  stats?: StatItem[];
  costs?: CostItem[];
  nextProduction?: ProductionItem[];
  actionLabel: string;
  actionDisabled?: boolean;
  disabledReason?: string;
  timerStartTime?: number;
  timerEndTime?: number;
  timerTargetLevel?: number;
  queueInfo?: QueueInfo;
  solarBalance?: number;
  missingPrereqs?: string[];
  onAction: () => void;
  onRush?: () => void;
  rushCooldownEnd?: number;
  onCancel?: () => void;
  cancelRefundInfo?: string;
  onInfo?: () => void;
  onPrereqTree?: () => void;
}

export default React.memo(function GameCard({
  icon,
  iconColor,
  title,
  level,
  count,
  subtitle,
  description,
  stats,
  costs,
  nextProduction,
  actionLabel,
  actionDisabled,
  disabledReason,
  timerStartTime,
  timerEndTime,
  timerTargetLevel,
  queueInfo,
  solarBalance,
  missingPrereqs,
  onAction,
  onRush,
  rushCooldownEnd,
  onCancel,
  cancelRefundInfo,
  onInfo,
  onPrereqTree,
}: GameCardProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  useEffect(() => {
    if (!timerEndTime || !timerStartTime) {
      setRemainingSeconds(0);
      progressAnim.setValue(0);
      return;
    }
    const totalDuration = timerEndTime - timerStartTime;
    const now = Date.now();
    const currentProgress = totalDuration > 0 ? Math.min(1, Math.max(0, (now - timerStartTime) / totalDuration)) : 1;
    progressAnim.setValue(currentProgress);

    const remainingMs = Math.max(0, timerEndTime - now);
    if (remainingMs > 0) {
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: remainingMs,
        useNativeDriver: false,
        easing: (t: number) => t,
      }).start();
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((timerEndTime - Date.now()) / 1000));
      setRemainingSeconds(remaining);
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => {
      clearInterval(interval);
      progressAnim.stopAnimation();
    };
  }, [timerEndTime, timerStartTime, progressAnim]);

  const isTimerActive = timerEndTime !== undefined && remainingSeconds > 0;
  const isQueueActive = !!queueInfo && queueInfo.remainingQuantity > 0;

  const [queueRemainingSeconds, setQueueRemainingSeconds] = useState<number>(0);
  const queueProgressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!queueInfo || queueInfo.remainingQuantity <= 0) {
      setQueueRemainingSeconds(0);
      queueProgressAnim.setValue(0);
      return;
    }
    const totalDuration = queueInfo.currentUnitEndTime - queueInfo.currentUnitStartTime;
    const now = Date.now();
    const currentProgress = totalDuration > 0 ? Math.min(1, Math.max(0, (now - queueInfo.currentUnitStartTime) / totalDuration)) : 1;
    queueProgressAnim.setValue(currentProgress);

    const remainingMs = Math.max(0, queueInfo.currentUnitEndTime - now);
    if (remainingMs > 0) {
      Animated.timing(queueProgressAnim, {
        toValue: 1,
        duration: remainingMs,
        useNativeDriver: false,
        easing: (t: number) => t,
      }).start();
    }

    const tick = () => {
      if (!queueInfo) return;
      const nowT = Date.now();
      const currentUnitRemaining = Math.max(0, Math.ceil((queueInfo.currentUnitEndTime - nowT) / 1000));
      const futureUnitsTime = (queueInfo.remainingQuantity - 1) * queueInfo.buildTimePerUnit;
      setQueueRemainingSeconds(currentUnitRemaining + futureUnitsTime);
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => {
      clearInterval(interval);
      queueProgressAnim.stopAnimation();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueInfo?.currentUnitEndTime, queueInfo?.currentUnitStartTime, queueInfo?.remainingQuantity, queueInfo?.buildTimePerUnit, queueProgressAnim]);

  const solarCost = isTimerActive
    ? Math.max(1, Math.ceil(remainingSeconds / 30))
    : isQueueActive
      ? Math.max(1, Math.ceil(queueRemainingSeconds / 30))
      : 0;
  const [rushCooldownRemaining, setRushCooldownRemaining] = useState<number>(0);

  useEffect(() => {
    if (!rushCooldownEnd || rushCooldownEnd <= Date.now()) {
      setRushCooldownRemaining(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((rushCooldownEnd - Date.now()) / 1000));
      setRushCooldownRemaining(remaining);
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [rushCooldownEnd]);

  const isRushOnCooldown = rushCooldownRemaining > 0;
  const canRush = (isTimerActive || isQueueActive) && !!onRush && (solarBalance ?? 0) >= solarCost && !isRushOnCooldown;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const handlePress = useCallback(() => {
    if (!actionDisabled && !isTimerActive && !isQueueActive) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onAction();
    }
  }, [actionDisabled, isTimerActive, isQueueActive, onAction]);

  const handleRush = useCallback(() => {
    if (onRush && canRush) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onRush();
    }
  }, [onRush, canRush]);

  const [showCancelModal, setShowCancelModal] = useState(false);

  const handleCancelPress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowCancelModal(true);
  }, []);

  const handleCancelConfirm = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setShowCancelModal(false);
    onCancel?.();
  }, [onCancel]);

  const handleCancelDismiss = useCallback(() => {
    setShowCancelModal(false);
  }, []);

  return (
    <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }, isTimerActive && styles.cardActive]}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: iconColor + '18' }]}>
          {icon}
        </View>
        <View style={styles.titleWrap}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {level !== undefined && (
              <View style={styles.levelBadge}>
                <Text style={styles.levelText}>Nv.{level}</Text>
              </View>
            )}
            {count !== undefined && (
              <View style={styles.countBadge}>
                <Text style={styles.countText}>x{count}</Text>
              </View>
            )}
          </View>
          {subtitle ? (
            <Text style={styles.subtitle}>{subtitle}</Text>
          ) : null}
          <Text style={styles.description} numberOfLines={2}>{description}</Text>
        </View>
        {onInfo && (
          <Pressable
            style={styles.infoBtn}
            onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onInfo(); }}
            hitSlop={8}
          >
            <Info size={16} color={Colors.textSecondary} />
          </Pressable>
        )}
      </View>

      {isTimerActive && (
        <View style={styles.timerSection}>
          <View style={styles.timerHeader}>
            <Clock size={14} color={Colors.primary} />
            <Text style={styles.timerLabel}>
              En construction → Nv.{timerTargetLevel}
            </Text>
            <Text style={styles.timerValue}>{formatTime(remainingSeconds)}</Text>
          </View>
          <View style={styles.progressBarBg}>
            <Animated.View
              style={[
                styles.progressBarFill,
                { width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
              ]}
            />
          </View>
          <View style={styles.timerActions}>
            {onRush && (
              <Pressable
                onPress={handleRush}
                style={[styles.rushButton, !canRush && styles.rushButtonDisabled, { flex: 1 }]}
                disabled={!canRush}
              >
                <Zap size={13} color={canRush ? Colors.solar : Colors.textMuted} />
                <Text style={[styles.rushText, !canRush && styles.rushTextDisabled]}>
                  {isRushOnCooldown ? `Accélérer (${rushCooldownRemaining}s)` : `Terminer : ${solarCost} Solar`}
                </Text>
              </Pressable>
            )}
            {onCancel && (
              <Pressable
                onPress={handleCancelPress}
                style={styles.cancelButton}
              >
                <X size={13} color={Colors.danger} />
                <Text style={styles.cancelText}>Annuler</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {isQueueActive && queueInfo && (
        <View style={styles.timerSection}>
          <View style={styles.timerHeader}>
            <Clock size={14} color={Colors.accent} />
            <Text style={[styles.timerLabel, { color: Colors.accent }]}>
              Construction : {queueInfo.remainingQuantity} restant{queueInfo.remainingQuantity > 1 ? 's' : ''}
            </Text>
            <Text style={styles.timerValue}>{formatTime(queueRemainingSeconds)}</Text>
          </View>
          <View style={styles.progressBarBg}>
            <Animated.View
              style={[
                styles.progressBarFill,
                { backgroundColor: Colors.accent, width: queueProgressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
              ]}
            />
          </View>
          <Text style={styles.queueSubtext}>
            Unité en cours : {formatTime(Math.max(0, Math.ceil(((queueInfo.currentUnitEndTime ?? 0) - Date.now()) / 1000)))}
          </Text>
          <View style={styles.timerActions}>
            {onRush && (
              <Pressable
                onPress={handleRush}
                style={[styles.rushButton, !canRush && styles.rushButtonDisabled, { flex: 1 }]}
                disabled={!canRush}
              >
                <Zap size={13} color={canRush ? Colors.solar : Colors.textMuted} />
                <Text style={[styles.rushText, !canRush && styles.rushTextDisabled]}>
                  {isRushOnCooldown ? `Accélérer (${rushCooldownRemaining}s)` : `Tout terminer : ${solarCost} Solar`}
                </Text>
              </Pressable>
            )}
            {onCancel && (
              <Pressable
                onPress={handleCancelPress}
                style={styles.cancelButton}
              >
                <X size={13} color={Colors.danger} />
                <Text style={styles.cancelText}>Annuler</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {missingPrereqs && missingPrereqs.length > 0 && (
        <Pressable
          style={styles.prereqSection}
          onPress={() => {
            if (onPrereqTree) {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onPrereqTree();
            }
          }}
        >
          <View style={styles.prereqHeader}>
            <Lock size={12} color={Colors.warning} />
            <Text style={styles.prereqTitle}>Prérequis manquants</Text>
            {onPrereqTree && <GitBranch size={12} color={Colors.warning} />}
          </View>
          {missingPrereqs.map((p, i) => (
            <Text key={i} style={styles.prereqItem}>• {p}</Text>
          ))}
          {onPrereqTree && (
            <Text style={styles.prereqHint}>Appuyez pour voir l'arbre complet</Text>
          )}
        </Pressable>
      )}

      {stats && stats.length > 0 && (
        <View style={styles.statsRow}>
          {stats.map((s, i) => (
            <View key={i} style={styles.stat}>
              <Text style={styles.statLabel}>{s.label}</Text>
              <Text style={styles.statValue}>{s.value}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.footer}>
        {!isTimerActive && (costs || nextProduction) && (
          <View style={styles.costProductionRow}>
            {costs && costs.length > 0 && (
              <View style={styles.costColumn}>
                <Text style={styles.costLabel}>Coût</Text>
                <View style={styles.costItems}>
                  {costs.map((c, i) => (
                    <Text
                      key={i}
                      style={[
                        styles.costItem,
                        { color: c.affordable ? Colors.textSecondary : Colors.danger },
                      ]}
                    >
                      {c.label}: {c.value}
                    </Text>
                  ))}
                </View>
              </View>
            )}
            {nextProduction && nextProduction.length > 0 && (
              <View style={styles.prodColumn}>
                <Text style={styles.prodLabel}>Nv. suivant</Text>
                <View style={styles.costItems}>
                  {nextProduction.map((p, i) => (
                    <Text
                      key={i}
                      style={[
                        styles.prodItem,
                        { color: p.positive ? Colors.success : Colors.energy },
                      ]}
                    >
                      {p.value}
                    </Text>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        <Pressable
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={[
            styles.button,
            (actionDisabled || isTimerActive || isQueueActive) && styles.buttonDisabled,
          ]}
          disabled={actionDisabled || isTimerActive || isQueueActive}
        >
          <Text style={[styles.buttonText, (actionDisabled || isTimerActive || isQueueActive) && styles.buttonTextDisabled]}>
            {isTimerActive || isQueueActive
              ? 'En cours...'
              : actionDisabled && disabledReason
                ? disabledReason
                : actionLabel}
          </Text>
        </Pressable>
      </View>
      {showCancelModal && (
        <Modal
          transparent
          animationType="fade"
          visible={showCancelModal}
          onRequestClose={handleCancelDismiss}
        >
          <Pressable style={styles.modalOverlay} onPress={handleCancelDismiss}>
            <Pressable style={styles.modalContent} onPress={() => {}}>
              <View style={styles.modalIconWrap}>
                <AlertTriangle size={28} color={Colors.warning} />
              </View>
              <Text style={styles.modalTitle}>Annuler la construction ?</Text>
              <Text style={styles.modalDesc}>
                {cancelRefundInfo ?? 'Seulement 80% des ressources dépensées seront remboursées.'}
              </Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalBtnSecondary}
                  onPress={handleCancelDismiss}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalBtnSecondaryText}>Non, continuer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalBtnDanger}
                  onPress={handleCancelConfirm}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalBtnDangerText}>Oui, annuler</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    ...(Platform.OS !== 'web' ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 6,
      elevation: 3,
    } : {}),
  },
  cardActive: {
    borderColor: Colors.primary + '50',
    backgroundColor: '#101D32',
  },
  header: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  titleWrap: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700' as const,
    flexShrink: 1,
  },
  levelBadge: {
    backgroundColor: Colors.primaryGlow,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary + '35',
  },
  levelText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
  countBadge: {
    backgroundColor: Colors.accent + '18',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.accent + '30',
  },
  countText: {
    color: Colors.accent,
    fontSize: 11,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
  subtitle: {
    color: Colors.success,
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500' as const,
  },
  description: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
  },
  timerSection: {
    backgroundColor: Colors.primary + '0A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.primary + '20',
  },
  timerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  timerLabel: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600' as const,
    flex: 1,
  },
  timerValue: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700' as const,
    fontVariant: ['tabular-nums'],
  },
  progressBarBg: {
    height: 5,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
    ...(Platform.OS !== 'web' ? {
      shadowColor: Colors.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.6,
      shadowRadius: 4,
    } : {}),
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  stat: {
    alignItems: 'center',
    minWidth: 50,
  },
  statLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    textTransform: 'uppercase' as const,
  },
  statValue: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600' as const,
    marginTop: 2,
  },
  footer: {
    gap: 10,
  },
  costProductionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  costColumn: {
    flex: 1,
  },
  prodColumn: {
    alignItems: 'flex-end',
  },
  costLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  prodLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  costItems: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  costItem: {
    fontSize: 11,
    fontWeight: '500' as const,
  },
  prodItem: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  button: {
    backgroundColor: Colors.primary + '1A',
    borderWidth: 1,
    borderColor: Colors.primary + '45',
    borderRadius: 11,
    paddingVertical: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  buttonDisabled: {
    backgroundColor: Colors.border + '30',
    borderColor: Colors.border,
  },
  buttonText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
  },
  buttonTextDisabled: {
    color: Colors.textMuted,
  },
  rushButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: Colors.solar + '15',
    borderWidth: 1,
    borderColor: Colors.solar + '40',
    borderRadius: 8,
    paddingVertical: 8,
  },
  rushButtonDisabled: {
    backgroundColor: Colors.border + '30',
    borderColor: Colors.border,
  },
  rushText: {
    color: Colors.solar,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  rushTextDisabled: {
    color: Colors.textMuted,
  },
  prereqSection: {
    backgroundColor: Colors.warning + '0C',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.warning + '25',
  },
  prereqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  prereqTitle: {
    color: Colors.warning,
    fontSize: 11,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  prereqItem: {
    color: Colors.warning,
    fontSize: 11,
    fontWeight: '500' as const,
    marginTop: 2,
    marginLeft: 18,
  },
  queueSubtext: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 6,
    fontVariant: ['tabular-nums'] as const,
  },
  timerActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: Colors.danger + '12',
    borderWidth: 1,
    borderColor: Colors.danger + '35',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  cancelText: {
    color: Colors.danger,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.warning + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700' as const,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  modalBtnSecondary: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalBtnSecondaryText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  modalBtnDanger: {
    flex: 1,
    backgroundColor: Colors.danger + '18',
    borderWidth: 1,
    borderColor: Colors.danger + '40',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalBtnDangerText: {
    color: Colors.danger,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  infoBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  prereqHint: {
    color: Colors.warning,
    fontSize: 10,
    fontWeight: '600' as const,
    fontStyle: 'italic' as const,
    marginTop: 6,
    textAlign: 'center' as const,
    opacity: 0.7,
  },
});
