import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, Platform } from 'react-native';
import { X, BookOpen, BarChart3, Coins, Zap, Clock, TrendingUp, CheckCircle, XCircle, Navigation, Crosshair } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { BUILDINGS, RESEARCH, SHIPS, DEFENSES } from '@/constants/gameData';
import { BUILDING_LORE, RESEARCH_LORE, SHIP_LORE, DEFENSE_LORE } from '@/constants/lore';
import { calculateCost, calculateUpgradeTime, calculateResearchTime, calculateShipBuildTime, formatNumber, formatTime, formatSpeed, getBoostedShipStats, getBoostedDefenseStats, getCombatBoosts, getCargoBoost, getBuildingProductionAtLevel, getPlasmaProductionBonus, getNeuralMeshLabBonus } from '@/utils/gameCalculations';
import { getShipDriveType, getShipSpeed, RAPIDFIRE_TABLE } from '@/utils/fleetCalculations';
import { getPrereqLabel } from '@/utils/prereqLabels';
import { Prerequisite, Colony } from '@/types/game';

interface InfoDetailModalProps {
  visible: boolean;
  onClose: () => void;
  itemId: string;
  itemType: 'building' | 'research' | 'ship' | 'defense';
  currentLevel: number;
  buildings: Record<string, number>;
  research: Record<string, number>;
  ships?: Record<string, number>;
  colonies?: Colony[];
}

function PrereqItem({ prereq, buildings, research }: { prereq: Prerequisite; buildings: Record<string, number>; research: Record<string, number> }) {
  const currentLevel = prereq.type === 'building' ? (buildings[prereq.id] ?? 0) : (research[prereq.id] ?? 0);
  const isMet = currentLevel >= prereq.level;
  return (
    <View style={infoStyles.prereqRow}>
      {isMet ? <CheckCircle size={12} color={Colors.success} /> : <XCircle size={12} color={Colors.danger} />}
      <Text style={[infoStyles.prereqText, { color: isMet ? Colors.success : Colors.danger }]}>
        {getPrereqLabel(prereq)} {isMet ? `(Nv.${currentLevel})` : `(${currentLevel}/${prereq.level})`}
      </Text>
    </View>
  );
}

export default function InfoDetailModal({ visible, onClose, itemId, itemType, currentLevel, buildings, research, ships, colonies }: InfoDetailModalProps) {
  const data = useMemo(() => {
    if (itemType === 'building') return BUILDINGS.find(b => b.id === itemId);
    if (itemType === 'research') return RESEARCH.find(r => r.id === itemId);
    if (itemType === 'ship') return SHIPS.find(s => s.id === itemId);
    if (itemType === 'defense') return DEFENSES.find(d => d.id === itemId);
    return null;
  }, [itemId, itemType]);

  const lore = useMemo(() => {
    if (itemType === 'building') return BUILDING_LORE[itemId] ?? '';
    if (itemType === 'research') return RESEARCH_LORE[itemId] ?? '';
    if (itemType === 'ship') return SHIP_LORE[itemId] ?? '';
    if (itemType === 'defense') return DEFENSE_LORE[itemId] ?? '';
    return '';
  }, [itemId, itemType]);

  const roboticsLevel = buildings.roboticsFactory ?? 0;
  const naniteLevel = buildings.naniteFactory ?? 0;
  const shipyardLevel = buildings.shipyard ?? 1;

  const labLevel = buildings.researchLab ?? 0;
  const neuralMeshLevel = research.neuralMesh ?? 0;
  const effectiveLabLevel = getNeuralMeshLabBonus(neuralMeshLevel, labLevel, colonies);

  const costTable = useMemo(() => {
    if (!data) return [];
    const rows: { level: number; fer: number; silice: number; xenogas: number; time: number; bonus: string }[] = [];

    if (itemType === 'building' || itemType === 'research') {
      const def = data as { baseCost: any; costFactor: number; baseTime: number; timeFactor: number };
      const startLevel = Math.max(0, currentLevel - 1);
      const endLevel = startLevel + 5;
      for (let lvl = startLevel; lvl < endLevel; lvl++) {
        const cost = calculateCost(def.baseCost, def.costFactor, lvl);
        const time = itemType === 'research'
          ? calculateResearchTime(def.baseTime, def.timeFactor, lvl, effectiveLabLevel, naniteLevel)
          : calculateUpgradeTime(def.baseTime, def.timeFactor, lvl, roboticsLevel, naniteLevel);
        let bonus = '';
        if (itemType === 'building') {
          const prod = getBuildingProductionAtLevel(itemId, lvl + 1, buildings, research, ships);
          if (prod) bonus = prod;
          if (itemId === 'naniteFactory') bonus = `÷${Math.pow(2, lvl + 1)} temps`;
          if (itemId === 'roboticsFactory') bonus = `-${((lvl + 1) * 10)}% temps`;
          if (itemId === 'shipyard') bonus = `-${(lvl) * 10}% temps unités`;
          if (itemId === 'researchLab') bonus = `-${Math.round((1 - 1 / (1 + (lvl + 1) * 0.1)) * 100)}% temps rech.`;
        }
        if (itemType === 'research') {
          if (itemId === 'weaponsTech') bonus = `+${(lvl + 1) * 10}% ATK`;
          else if (itemId === 'shieldTech') bonus = `+${(lvl + 1) * 10}% SHD`;
          else if (itemId === 'armorTech') bonus = `+${(lvl + 1) * 10}% HULL`;
          else if (itemId === 'computerTech') bonus = `${lvl + 2} flottes`;
          else if (itemId === 'quantumFlux') bonus = `+${(lvl + 1) * 5}% énergie`;
          else if (itemId === 'subspacialNodes') bonus = `+${(lvl + 1) * 5}% cargo`;
          else if (itemId === 'plasmaOverdrive') {
            const pb = getPlasmaProductionBonus(lvl + 1);
            bonus = `+${((pb.fer) * 100).toFixed(0)}%F / +${((pb.silice) * 100).toFixed(1)}%S / +${((pb.xenogas) * 100).toFixed(1)}%X`;
          }
          else if (itemId === 'chemicalDrive') bonus = `+${(lvl + 1) * 10}% vit.`;
          else if (itemId === 'impulseReactor') bonus = `+${(lvl + 1) * 20}% vit.`;
          else if (itemId === 'voidDrive') bonus = `+${(lvl + 1) * 30}% vit.`;
          else if (itemId === 'astrophysics') bonus = `${Math.floor((lvl + 2) / 2)} colonies`;
          else if (itemId === 'neuralMesh') bonus = `+${lvl + 1} labo(s)`;
        }
        rows.push({ level: lvl + 1, fer: cost.fer, silice: cost.silice, xenogas: cost.xenogas, time, bonus });
      }
    }
    return rows;
  }, [data, itemType, itemId, currentLevel, roboticsLevel, naniteLevel, effectiveLabLevel, buildings, research, ships]);

  const currentStats = useMemo(() => {
    if (!data) return null;
    if (itemType === 'ship') {
      const ship = data as typeof SHIPS[0];
      const boosted = getBoostedShipStats(ship.stats, research);
      return { type: 'ship' as const, stats: boosted, base: ship.stats };
    }
    if (itemType === 'defense') {
      const def = data as typeof DEFENSES[0];
      const boosted = getBoostedDefenseStats(def.stats, research);
      return { type: 'defense' as const, stats: boosted, base: def.stats };
    }
    return null;
  }, [data, itemType, research]);

  const rapidfireData = useMemo(() => {
    if (itemType !== 'ship' && itemType !== 'defense') return null;

    const allUnits = [
      ...SHIPS.map(s => ({ id: s.id, name: s.name, type: 'ship' as const })),
      ...DEFENSES.map(d => ({ id: d.id, name: d.name, type: 'defense' as const })),
    ];
    const unitNameMap: Record<string, string> = {};
    for (const u of allUnits) unitNameMap[u.id] = u.name;

    const rfAgainst: { id: string; name: string; value: number }[] = [];
    const rfTable = RAPIDFIRE_TABLE[itemId];
    if (rfTable) {
      for (const [targetId, value] of Object.entries(rfTable)) {
        rfAgainst.push({ id: targetId, name: unitNameMap[targetId] ?? targetId, value });
      }
    }
    rfAgainst.sort((a, b) => b.value - a.value);

    const rfFrom: { id: string; name: string; value: number }[] = [];
    for (const [attackerId, targets] of Object.entries(RAPIDFIRE_TABLE)) {
      if (targets[itemId]) {
        rfFrom.push({ id: attackerId, name: unitNameMap[attackerId] ?? attackerId, value: targets[itemId] });
      }
    }
    rfFrom.sort((a, b) => b.value - a.value);

    if (rfAgainst.length === 0 && rfFrom.length === 0) return null;
    return { rfAgainst, rfFrom };
  }, [itemId, itemType]);

  const quantumReactorBonus = useMemo(() => {
    if (naniteLevel > 0) {
      return `Quantum Reactor Nv.${naniteLevel} : temps ÷${Math.pow(2, naniteLevel)}`;
    }
    return null;
  }, [naniteLevel]);

  if (!data || !visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <View style={infoStyles.overlay}>
        <View style={infoStyles.container}>
          <View style={infoStyles.header}>
            <Text style={infoStyles.headerTitle}>{(data as any).name}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <X size={22} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={infoStyles.scroll} showsVerticalScrollIndicator={false}>
            {lore ? (
              <View style={infoStyles.section}>
                <View style={infoStyles.sectionHeader}>
                  <BookOpen size={14} color={Colors.primary} />
                  <Text style={infoStyles.sectionTitle}>Lore</Text>
                </View>
                <Text style={infoStyles.loreText}>{lore}</Text>
              </View>
            ) : null}

            {currentStats && (
              <View style={infoStyles.section}>
                <View style={infoStyles.sectionHeader}>
                  <BarChart3 size={14} color={Colors.xenogas} />
                  <Text style={infoStyles.sectionTitle}>Statistiques</Text>
                </View>
                <View style={infoStyles.statsGrid}>
                  <View style={infoStyles.statBox}>
                    <Text style={infoStyles.statLabel}>ATK</Text>
                    <Text style={infoStyles.statValue}>{formatNumber(currentStats.stats.attack)}</Text>
                    <Text style={infoStyles.statBase}>base: {formatNumber(currentStats.base.attack)}</Text>
                  </View>
                  <View style={infoStyles.statBox}>
                    <Text style={infoStyles.statLabel}>SHD</Text>
                    <Text style={infoStyles.statValue}>{formatNumber(currentStats.stats.shield)}</Text>
                    <Text style={infoStyles.statBase}>base: {formatNumber(currentStats.base.shield)}</Text>
                  </View>
                  <View style={infoStyles.statBox}>
                    <Text style={infoStyles.statLabel}>HULL</Text>
                    <Text style={infoStyles.statValue}>{formatNumber(currentStats.stats.hull)}</Text>
                    <Text style={infoStyles.statBase}>base: {formatNumber(currentStats.base.hull)}</Text>
                  </View>
                  {currentStats.type === 'ship' && (
                    <>
                      <View style={infoStyles.statBox}>
                        <Text style={infoStyles.statLabel}>SPD</Text>
                        <Text style={infoStyles.statValue}>{formatSpeed((currentStats.stats as any).speed)}</Text>
                      </View>
                      <View style={infoStyles.statBox}>
                        <Text style={infoStyles.statLabel}>CARGO</Text>
                        <Text style={infoStyles.statValue}>{formatNumber((currentStats.stats as any).cargo)}</Text>
                      </View>
                    </>
                  )}
                </View>
                {(() => {
                  const boosts = getCombatBoosts(research);
                  const parts: string[] = [];
                  if (boosts.attack > 1) parts.push(`ATK +${Math.round((boosts.attack - 1) * 100)}%`);
                  if (boosts.shield > 1) parts.push(`SHD +${Math.round((boosts.shield - 1) * 100)}%`);
                  if (boosts.hull > 1) parts.push(`HULL +${Math.round((boosts.hull - 1) * 100)}%`);
                  if (parts.length > 0) {
                    return (
                      <View style={infoStyles.boostRow}>
                        <TrendingUp size={11} color={Colors.success} />
                        <Text style={infoStyles.boostText}>Bonus recherche : {parts.join(' | ')}</Text>
                      </View>
                    );
                  }
                  return null;
                })()}
                {itemType === 'ship' && (() => {
                  const cargoBoost = getCargoBoost(research.subspacialNodes ?? 0);
                  if (cargoBoost > 1) {
                    return (
                      <View style={infoStyles.boostRow}>
                        <TrendingUp size={11} color={Colors.xenogas} />
                        <Text style={infoStyles.boostText}>Noeuds Subspatiaux : CARGO +{Math.round((cargoBoost - 1) * 100)}%</Text>
                      </View>
                    );
                  }
                  return null;
                })()}
                {itemType === 'ship' && (() => {
                  const driveType = getShipDriveType(itemId, research);
                  const driveNames = { chemical: 'Propulsion Chimique', impulse: 'Réacteur à Impulsions', void: 'Voile Hyperspatial' } as const;
                  const driveBonus = { chemical: 10, impulse: 20, void: 30 } as const;
                  const driveResearch = { chemical: research.chemicalDrive ?? 0, impulse: research.impulseReactor ?? 0, void: research.voidDrive ?? 0 } as const;
                  const speed = getShipSpeed(itemId, research);
                  return (
                    <View style={infoStyles.boostRow}>
                      <Navigation size={11} color={Colors.primary} />
                      <Text style={infoStyles.boostText}>
                        {driveNames[driveType]} Nv.{driveResearch[driveType]} : +{driveResearch[driveType] * driveBonus[driveType]}% → {formatSpeed(speed)}
                      </Text>
                    </View>
                  );
                })()}
              </View>
            )}

            {(data as any).prerequisites && (data as any).prerequisites.length > 0 && (
              <View style={infoStyles.section}>
                <View style={infoStyles.sectionHeader}>
                  <Zap size={14} color={Colors.warning} />
                  <Text style={infoStyles.sectionTitle}>Prérequis</Text>
                </View>
                {(data as any).prerequisites.map((prereq: Prerequisite, i: number) => (
                  <PrereqItem key={i} prereq={prereq} buildings={buildings} research={research} />
                ))}
              </View>
            )}

            {(itemType === 'ship' || itemType === 'defense') && (
              <View style={infoStyles.section}>
                <View style={infoStyles.sectionHeader}>
                  <Coins size={14} color={Colors.fer} />
                  <Text style={infoStyles.sectionTitle}>Coût unitaire</Text>
                </View>
                <View style={infoStyles.costRow}>
                  {((data as any).cost.fer ?? 0) > 0 && <Text style={infoStyles.costItem}>Fer: {formatNumber((data as any).cost.fer)}</Text>}
                  {((data as any).cost.silice ?? 0) > 0 && <Text style={infoStyles.costItem}>Silice: {formatNumber((data as any).cost.silice)}</Text>}
                  {((data as any).cost.xenogas ?? 0) > 0 && <Text style={infoStyles.costItem}>Xenogas: {formatNumber((data as any).cost.xenogas)}</Text>}
                </View>
                <View style={infoStyles.costRow}>
                  <Clock size={11} color={Colors.textMuted} />
                  <Text style={infoStyles.costItem}>
                    Temps : {formatTime(calculateShipBuildTime((data as any).buildTime, shipyardLevel, naniteLevel))}
                  </Text>
                </View>
                {quantumReactorBonus && (
                  <View style={infoStyles.boostRow}>
                    <TrendingUp size={11} color={Colors.success} />
                    <Text style={infoStyles.boostText}>{quantumReactorBonus}</Text>
                  </View>
                )}
              </View>
            )}

            {costTable.length > 0 && (
              <View style={infoStyles.section}>
                <View style={infoStyles.sectionHeader}>
                  <Coins size={14} color={Colors.fer} />
                  <Text style={infoStyles.sectionTitle}>Coûts par niveau</Text>
                </View>
                {quantumReactorBonus && (
                  <View style={[infoStyles.boostRow, { marginBottom: 8 }]}>
                    <TrendingUp size={11} color={Colors.success} />
                    <Text style={infoStyles.boostText}>{quantumReactorBonus}</Text>
                  </View>
                )}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View>
                    <View style={infoStyles.tableHeaderRow}>
                      <Text style={[infoStyles.tableCell, infoStyles.tableCellHeader, { width: 40 }]}>Nv.</Text>
                      <Text style={[infoStyles.tableCell, infoStyles.tableCellHeader, { width: 70 }]}>Fer</Text>
                      <Text style={[infoStyles.tableCell, infoStyles.tableCellHeader, { width: 70 }]}>Silice</Text>
                      <Text style={[infoStyles.tableCell, infoStyles.tableCellHeader, { width: 70 }]}>Xenogas</Text>
                      <Text style={[infoStyles.tableCell, infoStyles.tableCellHeader, { width: 65 }]}>Temps</Text>
                      <Text style={[infoStyles.tableCell, infoStyles.tableCellHeader, { width: 80 }]}>Bonus</Text>
                    </View>
                    {costTable.map((row, i) => {
                      const isCurrentLevel = row.level === currentLevel;
                      return (
                        <View key={i} style={[infoStyles.tableRow, isCurrentLevel && infoStyles.tableRowHighlight]}>
                          <Text style={[infoStyles.tableCell, { width: 40, color: isCurrentLevel ? Colors.primary : Colors.text }]}>{row.level}</Text>
                          <Text style={[infoStyles.tableCell, { width: 70 }]}>{row.fer > 0 ? formatNumber(row.fer) : '-'}</Text>
                          <Text style={[infoStyles.tableCell, { width: 70 }]}>{row.silice > 0 ? formatNumber(row.silice) : '-'}</Text>
                          <Text style={[infoStyles.tableCell, { width: 70 }]}>{row.xenogas > 0 ? formatNumber(row.xenogas) : '-'}</Text>
                          <Text style={[infoStyles.tableCell, { width: 65 }]}>{formatTime(row.time)}</Text>
                          <Text style={[infoStyles.tableCell, { width: 80, color: Colors.success, fontSize: 9 }]}>{row.bonus || '-'}</Text>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            )}

            {rapidfireData && (
              <View style={infoStyles.section}>
                <View style={infoStyles.sectionHeader}>
                  <Crosshair size={14} color={Colors.danger} />
                  <Text style={infoStyles.sectionTitle}>Rapidfire</Text>
                </View>

                {rapidfireData.rfAgainst.length > 0 && (
                  <View style={infoStyles.rfBlock}>
                    <Text style={infoStyles.rfSubtitle}>RF contre</Text>
                    {rapidfireData.rfAgainst.map((rf) => (
                      <View key={rf.id} style={infoStyles.rfRow}>
                        <Text style={infoStyles.rfName}>{rf.name}</Text>
                        <View style={infoStyles.rfBadge}>
                          <Text style={infoStyles.rfValue}>x{rf.value}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {rapidfireData.rfFrom.length > 0 && (
                  <View style={[infoStyles.rfBlock, rapidfireData.rfAgainst.length > 0 && { marginTop: 12 }]}>
                    <Text style={infoStyles.rfSubtitleDanger}>RF subi de</Text>
                    {rapidfireData.rfFrom.map((rf) => (
                      <View key={rf.id} style={infoStyles.rfRow}>
                        <Text style={infoStyles.rfName}>{rf.name}</Text>
                        <View style={infoStyles.rfBadgeDanger}>
                          <Text style={infoStyles.rfValueDanger}>x{rf.value}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const infoStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  scroll: {
    paddingHorizontal: 16,
  },
  section: {
    marginTop: 16,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.text,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  loreText: {
    fontSize: 13,
    lineHeight: 20,
    color: Colors.textSecondary,
    fontStyle: 'italic' as const,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statBox: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 70,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700' as const,
    color: Colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
    marginTop: 2,
  },
  statBase: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 1,
  },
  boostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    backgroundColor: Colors.success + '10',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  boostText: {
    fontSize: 11,
    color: Colors.success,
    fontWeight: '600' as const,
  },
  prereqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  prereqText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  costRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 4,
    alignItems: 'center',
  },
  costItem: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 6,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border + '40',
  },
  tableRowHighlight: {
    backgroundColor: Colors.primary + '10',
    borderRadius: 4,
  },
  tableCell: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
    textAlign: 'center' as const,
    fontVariant: ['tabular-nums'] as const,
  },
  tableCellHeader: {
    color: Colors.textMuted,
    fontWeight: '700' as const,
    fontSize: 9,
    textTransform: 'uppercase' as const,
  },
  rfBlock: {
    marginTop: 2,
  },
  rfSubtitle: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.success,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  rfSubtitleDanger: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.danger,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  rfRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border + '40',
  },
  rfName: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
    flex: 1,
  },
  rfBadge: {
    backgroundColor: Colors.success + '20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    minWidth: 40,
    alignItems: 'center' as const,
  },
  rfValue: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.success,
  },
  rfBadgeDanger: {
    backgroundColor: Colors.danger + '20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    minWidth: 40,
    alignItems: 'center' as const,
  },
  rfValueDanger: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.danger,
  },
});
