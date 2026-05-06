import React, { useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, Platform } from 'react-native';
import { X, Zap, Pickaxe, Gem, Droplets, ChevronLeft, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useGame } from '@/contexts/GameContext';
import {
  calculateEnergyProduced,
  calculateEnergyConsumption,
  formatNumber,
  getMineEnergyConsumption,
  getPlasmaProductionBonus,
  getXenogasTempFactor,
} from '@/utils/gameCalculations';
import { ProductionPercentages } from '@/types/game';

const PERCENTAGE_STEPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

interface ProductionModalProps {
  visible: boolean;
  onClose: () => void;
}

interface ProducerRow {
  key: keyof ProductionPercentages;
  label: string;
  icon: React.ComponentType<{ size: number; color: string }>;
  color: string;
  level: number;
  baseProductionLabel: string;
  energyConsumption: number;
  isEnergyProducer: boolean;
}

export default function ProductionModal({ visible, onClose }: ProductionModalProps) {
  const { state, activePlanet, activeProductionPercentages, setActiveProductionPercentages } = useGame();
  const [localPct, setLocalPct] = useState<ProductionPercentages>(activeProductionPercentages);
  const [hasChanges, setHasChanges] = useState(false);
  const wasVisible = useRef(false);

  React.useEffect(() => {
    if (visible && !wasVisible.current) {
      setLocalPct(activeProductionPercentages);
      setHasChanges(false);
    }
    wasVisible.current = visible;
  }, [visible, activeProductionPercentages]);

  const buildings = activePlanet.buildings;
  const research = state.research;
  const ships = activePlanet.ships;

  const plasmaLevel = research?.plasmaOverdrive ?? 0;
  const plasmaBonus = useMemo(() => getPlasmaProductionBonus(plasmaLevel), [plasmaLevel]);

  const activePlanetSlotData = useMemo(() => {
    if (!activePlanet) return undefined;
    const colony = (state.colonies ?? []).find(c => c.id === (activePlanet as { id?: string | null }).id);
    if ((activePlanet as { isColony?: boolean }).isColony && colony) {
      return colony.temperatureMax;
    }
    return state.temperatureMax;
  }, [activePlanet, state.colonies, state.temperatureMax]);

  const producers = useMemo((): ProducerRow[] => {
    const ferLevel = buildings.ferMine ?? 0;
    const siliceLevel = buildings.siliceMine ?? 0;
    const xenogasLevel = buildings.xenogasRefinery ?? 0;
    const rows: ProducerRow[] = [];

    if (ferLevel > 0) {
      const baseProd = Math.floor(30 * ferLevel * Math.pow(1.1, ferLevel) * (1 + plasmaBonus.fer));
      rows.push({
        key: 'ferMine',
        label: 'Ferro Mine',
        icon: Pickaxe,
        color: Colors.fer,
        level: ferLevel,
        baseProductionLabel: `+${formatNumber(baseProd)}/h Fer`,
        energyConsumption: getMineEnergyConsumption('ferMine', ferLevel),
        isEnergyProducer: false,
      });
    }

    if (siliceLevel > 0) {
      const baseProd = Math.floor(20 * siliceLevel * Math.pow(1.1, siliceLevel) * (1 + plasmaBonus.silice));
      rows.push({
        key: 'siliceMine',
        label: 'Silica Mine',
        icon: Gem,
        color: Colors.silice,
        level: siliceLevel,
        baseProductionLabel: `+${formatNumber(baseProd)}/h Silice`,
        energyConsumption: getMineEnergyConsumption('siliceMine', siliceLevel),
        isEnergyProducer: false,
      });
    }

    if (xenogasLevel > 0) {
      const xenoTempFactor = getXenogasTempFactor(activePlanetSlotData);
      const baseProd = Math.floor(10 * xenogasLevel * Math.pow(1.1, xenogasLevel) * (1 + plasmaBonus.xenogas) * xenoTempFactor);
      rows.push({
        key: 'xenogasRefinery',
        label: 'Xeno Well',
        icon: Droplets,
        color: Colors.xenogas,
        level: xenogasLevel,
        baseProductionLabel: `+${formatNumber(baseProd)}/h Xenogas`,
        energyConsumption: getMineEnergyConsumption('xenogasRefinery', xenogasLevel),
        isEnergyProducer: false,
      });
    }

    return rows;
  }, [buildings, plasmaBonus, activePlanetSlotData]);

  const energySummary = useMemo(() => {
    const produced = calculateEnergyProduced(buildings, research, ships, localPct, activePlanetSlotData);
    const consumed = calculateEnergyConsumption(buildings, localPct);
    return { produced, consumed, balance: produced - consumed };
  }, [buildings, research, ships, localPct, activePlanetSlotData]);

  const adjustPercentage = useCallback((key: keyof ProductionPercentages, direction: 1 | -1) => {
    setLocalPct(prev => {
      const currentIdx = PERCENTAGE_STEPS.indexOf(prev[key]);
      const idx = currentIdx === -1 ? PERCENTAGE_STEPS.length - 1 : currentIdx;
      const newIdx = Math.max(0, Math.min(PERCENTAGE_STEPS.length - 1, idx + direction));
      if (PERCENTAGE_STEPS[newIdx] === prev[key]) return prev;
      if (Platform.OS !== 'web') {
        void Haptics.selectionAsync();
      }
      setHasChanges(true);
      return { ...prev, [key]: PERCENTAGE_STEPS[newIdx] };
    });
  }, []);

  const handleApply = useCallback(() => {
    setActiveProductionPercentages(localPct);
    setHasChanges(false);
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onClose();
  }, [localPct, setActiveProductionPercentages, onClose]);

  const handleReset = useCallback(() => {
    const allMax: ProductionPercentages = {
      ferMine: 100,
      siliceMine: 100,
      xenogasRefinery: 100,
      solarPlant: 100,
      heliosRemorqueur: 100,
    };
    setLocalPct(allMax);
    setHasChanges(true);
  }, []);

  const isDeficit = energySummary.balance < 0;
  const efficiencyPct = energySummary.consumed > 0
    ? Math.min(100, Math.round((energySummary.produced / energySummary.consumed) * 100))
    : 100;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.modalContainer} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Zap size={18} color={isDeficit ? Colors.danger : Colors.energy} />
              <Text style={styles.headerTitle}>Gestion de Production</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <X size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <View style={[styles.energyBar, isDeficit && styles.energyBarDeficit]}>
            <View style={styles.energyBarRow}>
              <Text style={[styles.energyLabel, isDeficit && styles.energyLabelDeficit]}>
                Énergie
              </Text>
              <Text style={[styles.energyValue, isDeficit && styles.energyValueDeficit]}>
                {formatNumber(energySummary.produced)} / {formatNumber(energySummary.consumed)}
              </Text>
            </View>
            <View style={styles.energyBarTrack}>
              <View
                style={[
                  styles.energyBarFill,
                  {
                    width: `${Math.min(100, efficiencyPct)}%`,
                    backgroundColor: isDeficit ? Colors.danger : Colors.energy,
                  },
                ]}
              />
            </View>
            <View style={styles.energyBarRow}>
              <Text style={[styles.energySubtext, isDeficit && { color: Colors.danger }]}>
                {isDeficit ? `Déficit : ${formatNumber(Math.abs(energySummary.balance))}` : `Surplus : +${formatNumber(energySummary.balance)}`}
              </Text>
              <Text style={[styles.energySubtext, isDeficit && { color: Colors.danger }]}>
                {efficiencyPct}% efficacité
              </Text>
            </View>
          </View>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {producers.map(producer => {
              const pctVal = localPct[producer.key];
              const Icon = producer.icon;
              const actualProd = producer.isEnergyProducer
                ? `+${formatNumber(Math.floor(parseFloat(producer.baseProductionLabel.replace(/[^\d]/g, '')) * pctVal / 100))} énergie`
                : producer.baseProductionLabel.replace(/\+[\d\s]+/, (m) => `+${formatNumber(Math.floor(parseInt(m.replace(/\D/g, ''), 10) * pctVal / 100))}`);
              const actualEnergy = !producer.isEnergyProducer
                ? Math.floor(producer.energyConsumption * pctVal / 100)
                : 0;

              return (
                <View key={producer.key} style={styles.producerRow}>
                  <View style={styles.producerInfo}>
                    <View style={[styles.producerIcon, { backgroundColor: producer.color + '20' }]}>
                      <Icon size={16} color={producer.color} />
                    </View>
                    <View style={styles.producerDetails}>
                      <Text style={styles.producerName}>
                        {producer.label}
                        <Text style={styles.producerLevel}> Nv.{producer.level}</Text>
                      </Text>
                      <Text style={[styles.producerProd, { color: producer.color }]}>
                        {pctVal === 100 ? producer.baseProductionLabel : actualProd}
                      </Text>
                      {!producer.isEnergyProducer && (
                        <Text style={styles.producerEnergy}>
                          -{formatNumber(actualEnergy)} énergie
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.pctControl}>
                    <Pressable
                      onPress={() => adjustPercentage(producer.key, -1)}
                      style={[styles.pctArrow, pctVal <= 0 && styles.pctArrowDisabled]}
                      disabled={pctVal <= 0}
                      hitSlop={8}
                    >
                      <ChevronLeft size={18} color={pctVal <= 0 ? Colors.border : Colors.textSecondary} />
                    </Pressable>
                    <View style={[
                      styles.pctBadge,
                      pctVal === 0 && styles.pctBadgeZero,
                      pctVal < 100 && pctVal > 0 && styles.pctBadgeReduced,
                    ]}>
                      <Text style={[
                        styles.pctText,
                        pctVal === 0 && styles.pctTextZero,
                        pctVal < 100 && pctVal > 0 && styles.pctTextReduced,
                      ]}>
                        {pctVal}%
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => adjustPercentage(producer.key, 1)}
                      style={[styles.pctArrow, pctVal >= 100 && styles.pctArrowDisabled]}
                      disabled={pctVal >= 100}
                      hitSlop={8}
                    >
                      <ChevronRight size={18} color={pctVal >= 100 ? Colors.border : Colors.textSecondary} />
                    </Pressable>
                  </View>
                </View>
              );
            })}

            {producers.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Aucun bâtiment de production construit.</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable style={styles.resetBtn} onPress={handleReset}>
              <Text style={styles.resetBtnText}>Tout à 100%</Text>
            </Pressable>
            <Pressable
              style={[styles.applyBtn, !hasChanges && styles.applyBtnDisabled]}
              onPress={handleApply}
              disabled={!hasChanges}
            >
              <Text style={[styles.applyBtnText, !hasChanges && styles.applyBtnTextDisabled]}>
                Appliquer
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  closeBtn: {
    padding: 4,
  },
  energyBar: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  energyBarDeficit: {
    borderColor: Colors.danger + '60',
    backgroundColor: Colors.danger + '10',
  },
  energyBarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  energyLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.energy,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  energyLabelDeficit: {
    color: Colors.danger,
  },
  energyValue: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.text,
    fontVariant: ['tabular-nums'] as const,
  },
  energyValueDeficit: {
    color: Colors.danger,
  },
  energyBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
    marginVertical: 6,
    overflow: 'hidden',
  },
  energyBarFill: {
    height: 6,
    borderRadius: 3,
  },
  energySubtext: {
    fontSize: 10,
    color: Colors.textMuted,
    fontVariant: ['tabular-nums'] as const,
  },
  scrollArea: {
    paddingHorizontal: 16,
    marginTop: 8,
    maxHeight: 360,
  },
  producerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  producerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  producerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  producerDetails: {
    flex: 1,
  },
  producerName: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  producerLevel: {
    fontSize: 11,
    fontWeight: '400' as const,
    color: Colors.textMuted,
  },
  producerProd: {
    fontSize: 11,
    fontWeight: '600' as const,
    marginTop: 2,
  },
  producerEnergy: {
    fontSize: 10,
    color: Colors.warning,
    marginTop: 1,
  },
  pctControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  pctArrow: {
    padding: 6,
  },
  pctArrowDisabled: {
    opacity: 0.3,
  },
  pctBadge: {
    minWidth: 48,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.success + '20',
    alignItems: 'center',
  },
  pctBadgeZero: {
    backgroundColor: Colors.danger + '20',
  },
  pctBadgeReduced: {
    backgroundColor: Colors.warning + '20',
  },
  pctText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.success,
    fontVariant: ['tabular-nums'] as const,
  },
  pctTextZero: {
    color: Colors.danger,
  },
  pctTextReduced: {
    color: Colors.warning,
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: 28,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  resetBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  applyBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  applyBtnDisabled: {
    backgroundColor: Colors.border,
  },
  applyBtnText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#000',
  },
  applyBtnTextDisabled: {
    color: Colors.textMuted,
  },
});
