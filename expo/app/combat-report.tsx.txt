import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Swords, Rocket, Shield, Package, AlertCircle, ChevronDown, ChevronUp, Activity } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFleet } from '@/contexts/FleetContext';
import { useAuth } from '@/contexts/AuthContext';
import { useGame } from '@/contexts/GameContext';
import { SHIPS, DEFENSES } from '@/constants/gameData';
import { CombatRoundLog, CombatLogEntry } from '@/types/fleet';
import Colors from '@/constants/colors';
import ClickableCoords from '@/components/ClickableCoords';

function formatN(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return Math.floor(n).toString();
}

function shipName(id: string): string {
  return SHIPS.find(s => s.id === id)?.name ?? id;
}

function defenseName(id: string): string {
  return DEFENSES.find(d => d.id === id)?.name ?? id;
}

function CombatLogSection({ roundLogs, combatLog }: { roundLogs: CombatRoundLog[] | null; combatLog: CombatLogEntry[] | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!roundLogs?.length && !combatLog?.length) return null;

  const initEntry = combatLog?.find(e => e.type === 'init');
  const initData = initEntry?.data as Record<string, unknown> | undefined;
  const anomalyEntries = combatLog?.filter(e => e.type === 'anomaly') ?? [];

  return (
    <View style={styles.section}>
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => setExpanded(prev => !prev)}
        activeOpacity={0.7}
      >
        <Activity size={16} color={Colors.primary} />
        <Text style={styles.sectionTitle}>Journal de combat détaillé</Text>
        <View style={{ flex: 1 }} />
        {expanded ? (
          <ChevronUp size={16} color={Colors.textMuted} />
        ) : (
          <ChevronDown size={16} color={Colors.textMuted} />
        )}
      </TouchableOpacity>

      {expanded && (
        <View style={logStyles.logContainer}>
          {initData && (
            <View style={logStyles.initBlock}>
              <Text style={logStyles.initTitle}>Analyse des forces</Text>
              <View style={logStyles.forceRow}>
                <View style={logStyles.forceCol}>
                  <Text style={logStyles.forceLabel}>Puissance ATK</Text>
                  <Text style={logStyles.forceValue}>{formatN(initData.atkFirepower as number)}</Text>
                </View>
                <Text style={logStyles.forceVs}>vs</Text>
                <View style={logStyles.forceCol}>
                  <Text style={logStyles.forceLabel}>PV DEF</Text>
                  <Text style={logStyles.forceValue}>{formatN(initData.defHP as number)}</Text>
                </View>
                <View style={logStyles.ratioChip}>
                  <Text style={logStyles.ratioText}>×{initData.atkFireToDefHPRatio as number}</Text>
                </View>
              </View>
              <View style={logStyles.forceRow}>
                <View style={logStyles.forceCol}>
                  <Text style={logStyles.forceLabel}>Puissance DEF</Text>
                  <Text style={logStyles.forceValue}>{formatN(initData.defFirepower as number)}</Text>
                </View>
                <Text style={logStyles.forceVs}>vs</Text>
                <View style={logStyles.forceCol}>
                  <Text style={logStyles.forceLabel}>PV ATK</Text>
                  <Text style={logStyles.forceValue}>{formatN(initData.atkHP as number)}</Text>
                </View>
                <View style={logStyles.ratioChip}>
                  <Text style={logStyles.ratioText}>×{initData.defFireToAtkHPRatio as number}</Text>
                </View>
              </View>
              <Text style={logStyles.unitCountText}>
                Unités: {initData.atkUnits as number} ATK vs {initData.defUnits as number} DEF
              </Text>
            </View>
          )}

          {(roundLogs ?? []).map((r) => (
            <View key={r.round} style={logStyles.roundBlock}>
              <View style={logStyles.roundHeader}>
                <Text style={logStyles.roundTitle}>Round {r.round}</Text>
                {r.explosions > 0 && (
                  <View style={logStyles.explosionBadge}>
                    <Text style={logStyles.explosionText}>💥 {r.explosions}</Text>
                  </View>
                )}
              </View>

              <View style={logStyles.dmgGrid}>
                <View style={logStyles.dmgCol}>
                  <Text style={logStyles.dmgSide}>ATK → DEF</Text>
                  <Text style={logStyles.dmgDetail}>
                    🛡 {formatN(r.dmgOnDefShield)}  ❤️ {formatN(r.dmgOnDefHull)}
                  </Text>
                  <Text style={logStyles.dmgKills}>
                    {r.defenderKilled > 0 ? `−${r.defenderKilled} détruits` : 'Aucune perte'}
                  </Text>
                </View>
                <View style={logStyles.dmgSep} />
                <View style={logStyles.dmgCol}>
                  <Text style={logStyles.dmgSide}>DEF → ATK</Text>
                  <Text style={logStyles.dmgDetail}>
                    🛡 {formatN(r.dmgOnAtkShield)}  ❤️ {formatN(r.dmgOnAtkHull)}
                  </Text>
                  <Text style={logStyles.dmgKills}>
                    {r.attackerKilled > 0 ? `−${r.attackerKilled} détruits` : 'Aucune perte'}
                  </Text>
                </View>
              </View>

              <View style={logStyles.survivorRow}>
                <Text style={logStyles.survivorText}>
                  ATK: {r.attackerAlive}/{r.attackerTotal}
                </Text>
                <Text style={logStyles.survivorText}>
                  DEF: {r.defenderAlive}/{r.defenderTotal}
                </Text>
                {r.explosionChecks > 0 && (
                  <Text style={logStyles.explosionDetail}>
                    Checks: {r.explosionChecks}
                  </Text>
                )}
              </View>
            </View>
          ))}

          {anomalyEntries.length > 0 && (
            <View style={logStyles.anomalyBlock}>
              <Text style={logStyles.anomalyTitle}>⚠️ Anomalies détectées</Text>
              {anomalyEntries.map((a, i) => (
                <Text key={i} style={logStyles.anomalyText}>{a.message}</Text>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export default function CombatReportScreen() {
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const router = useRouter();
  const { combatReports } = useFleet();
  const { user } = useAuth();
  const { state } = useGame();

  const report = combatReports.find(r => r.id === reportId);

  if (!report) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backText}>Retour</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Rapport</Text>
            <View style={{ width: 60 }} />
          </View>
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Rapport introuvable</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const isAttacker = report.attacker_id === user?.id;
  const coords = report.target_coords;
  const date = new Date(report.created_at).toLocaleString('fr-FR');

  const resultColors: Record<string, string> = {
    attacker_wins: Colors.success,
    defender_wins: Colors.danger,
    draw: Colors.warning,
  };
  const resultLabels: Record<string, string> = {
    attacker_wins: isAttacker ? 'Victoire !' : 'Défaite...',
    defender_wins: isAttacker ? 'Défaite...' : 'Victoire !',
    draw: 'Match nul',
  };
  const resultColor = resultColors[report.result] ?? Colors.textMuted;
  const resultLabel = resultLabels[report.result] ?? 'Inconnu';

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>Retour</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Rapport de combat</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.resultCard, { borderColor: resultColor + '40' }]}>
            <Swords size={28} color={resultColor} />
            <Text style={[styles.resultText, { color: resultColor }]}>{resultLabel}</Text>
            <Text style={styles.roundsText}>{report.rounds} round{report.rounds > 1 ? 's' : ''} de combat</Text>
            <ClickableCoords coords={coords} style={styles.coordsLink} />
            <Text style={styles.dateText}>{date}</Text>
          </View>

          <View style={styles.vsRow}>
            <View style={styles.vsCard}>
              <Text style={styles.vsLabel}>Attaquant</Text>
              <Text style={styles.vsName}>{report.attacker_username ?? '?'}</Text>
              {(() => {
                const ac = isAttacker ? state.coordinates : report.attacker_coords;
                if (ac) {
                  return (
                    <ClickableCoords coords={ac as [number, number, number]} style={styles.vsCoords} />
                  );
                }
                return null;
              })()}
            </View>
            <Text style={styles.vsText}>VS</Text>
            <View style={styles.vsCard}>
              <Text style={styles.vsLabel}>Défenseur</Text>
              <Text style={styles.vsName}>{report.defender_username ?? '?'}</Text>
              <ClickableCoords coords={coords} style={styles.vsCoords} />
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Rocket size={16} color={Colors.accent} />
              <Text style={styles.sectionTitle}>Flotte attaquante</Text>
            </View>
            {report.attacker_fleet && Object.entries(report.attacker_fleet).filter(([, c]) => c > 0).map(([id, count]) => {
              const lost = report.attacker_losses?.[id] ?? 0;
              return (
                <View key={id} style={styles.unitRow}>
                  <Text style={styles.unitName}>{shipName(id)}</Text>
                  <Text style={styles.unitCount}>{count}</Text>
                  {lost > 0 && <Text style={styles.unitLost}>-{lost}</Text>}
                </View>
              );
            })}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Shield size={16} color={Colors.success} />
              <Text style={styles.sectionTitle}>Défenses & Flotte du défenseur</Text>
            </View>
            {report.defender_fleet && Object.entries(report.defender_fleet).filter(([, c]) => c > 0).map(([id, count]) => {
              const lost = report.defender_losses?.[id] ?? 0;
              return (
                <View key={`ship_${id}`} style={styles.unitRow}>
                  <Text style={styles.unitName}>{shipName(id)}</Text>
                  <Text style={styles.unitCount}>{count}</Text>
                  {lost > 0 && <Text style={styles.unitLost}>-{lost}</Text>}
                </View>
              );
            })}
            {report.defender_defenses_initial && Object.entries(report.defender_defenses_initial).filter(([, c]) => c > 0).map(([id, count]) => {
              const lost = report.defender_losses?.[id] ?? 0;
              return (
                <View key={`def_${id}`} style={styles.unitRow}>
                  <Text style={styles.unitName}>{defenseName(id)}</Text>
                  <Text style={styles.unitCount}>{count}</Text>
                  {lost > 0 && <Text style={styles.unitLost}>-{lost}</Text>}
                </View>
              );
            })}
          </View>

          {report.defense_rebuilds &&
  Object.values(report.defense_rebuilds).some((count) => Number(count) > 0) && (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Shield size={16} color={Colors.success} />
        <Text style={styles.sectionTitle}>Défenses reconstruites</Text>
      </View>

      {Object.entries(report.defense_rebuilds)
        .filter(([, count]) => Number(count) > 0)
        .map(([id, count]) => (
          <View key={`rebuilt_${id}`} style={styles.unitRow}>
            <Text style={styles.unitName}>{defenseName(id)}</Text>
            <Text style={[styles.unitCount, { color: Colors.success }]}>
              +{Number(count)}
            </Text>
          </View>
        ))}
    </View>
  )}

          {report.loot && (report.loot.fer > 0 || report.loot.silice > 0 || report.loot.xenogas > 0) && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Package size={16} color={Colors.energy} />
                <Text style={styles.sectionTitle}>Butin pillé</Text>
              </View>
              <View style={styles.lootGrid}>
                {report.loot.fer > 0 && (
                  <View style={styles.lootItem}>
                    <View style={[styles.lootDot, { backgroundColor: Colors.fer }]} />
                    <Text style={styles.lootLabel}>Fer</Text>
                    <Text style={styles.lootValue}>{formatN(report.loot.fer)}</Text>
                  </View>
                )}
                {report.loot.silice > 0 && (
                  <View style={styles.lootItem}>
                    <View style={[styles.lootDot, { backgroundColor: Colors.silice }]} />
                    <Text style={styles.lootLabel}>Silice</Text>
                    <Text style={styles.lootValue}>{formatN(report.loot.silice)}</Text>
                  </View>
                )}
                {report.loot.xenogas > 0 && (
                  <View style={styles.lootItem}>
                    <View style={[styles.lootDot, { backgroundColor: Colors.xenogas }]} />
                    <Text style={styles.lootLabel}>Xenogas</Text>
                    <Text style={styles.lootValue}>{formatN(report.loot.xenogas)}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {report.debris && (report.debris.fer > 0 || report.debris.silice > 0) && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <AlertCircle size={16} color={Colors.textMuted} />
                <Text style={styles.sectionTitle}>Champ de débris</Text>
              </View>
              <View style={styles.lootGrid}>
                {report.debris.fer > 0 && (
                  <View style={styles.lootItem}>
                    <View style={[styles.lootDot, { backgroundColor: Colors.fer }]} />
                    <Text style={styles.lootLabel}>Fer</Text>
                    <Text style={styles.lootValue}>{formatN(report.debris.fer)}</Text>
                  </View>
                )}
                {report.debris.silice > 0 && (
                  <View style={styles.lootItem}>
                    <View style={[styles.lootDot, { backgroundColor: Colors.silice }]} />
                    <Text style={styles.lootLabel}>Silice</Text>
                    <Text style={styles.lootValue}>{formatN(report.debris.silice)}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          <CombatLogSection roundLogs={report.round_logs} combatLog={report.combat_log} />

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { width: 60 },
  backText: { color: Colors.primary, fontSize: 14, fontWeight: '600' as const },
  headerTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' as const },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  resultCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center' as const,
    borderWidth: 2,
    marginBottom: 16,
  },
  resultText: { fontSize: 22, fontWeight: '800' as const, marginTop: 8 },
  roundsText: { color: Colors.textSecondary, fontSize: 13, marginTop: 4 },
  coordsLink: { color: Colors.primary, fontSize: 13, fontWeight: '600' as const, marginTop: 4, letterSpacing: 1, textDecorationLine: 'underline' as const },
  dateText: { color: Colors.textMuted, fontSize: 11, marginTop: 6 },
  vsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 16,
  },
  vsCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  vsLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '600' as const, textTransform: 'uppercase' as const },
  vsName: { color: Colors.text, fontSize: 14, fontWeight: '700' as const, marginTop: 4 },
  vsCoords: { color: Colors.primary, fontSize: 11, fontWeight: '600' as const, marginTop: 4, letterSpacing: 0.5, textDecorationLine: 'underline' as const },
  vsText: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' as const },
  section: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: { color: Colors.text, fontSize: 14, fontWeight: '600' as const },
  unitRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  unitName: { color: Colors.textSecondary, fontSize: 12, flex: 1 },
  unitCount: { color: Colors.text, fontSize: 12, fontWeight: '600' as const, marginRight: 8 },
  unitLost: { color: Colors.danger, fontSize: 12, fontWeight: '700' as const },
  lootGrid: { flexDirection: 'row' as const, gap: 8 },
  lootItem: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  lootDot: { width: 6, height: 6, borderRadius: 3, marginBottom: 4 },
  lootLabel: { color: Colors.textMuted, fontSize: 10 },
  lootValue: { color: Colors.text, fontSize: 14, fontWeight: '700' as const, marginTop: 2 },
  emptyState: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  emptyText: { color: Colors.textMuted, fontSize: 14 },
});

const logStyles = StyleSheet.create({
  logContainer: {
    marginTop: 4,
  },
  initBlock: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  initTitle: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700' as const,
    marginBottom: 8,
  },
  forceRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 6,
    gap: 6,
  },
  forceCol: {
    flex: 1,
  },
  forceLabel: {
    color: Colors.textMuted,
    fontSize: 10,
  },
  forceValue: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  forceVs: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '600' as const,
  },
  ratioChip: {
    backgroundColor: Colors.primaryGlow,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ratioText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  unitCountText: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  roundBlock: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  roundHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 6,
  },
  roundTitle: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  explosionBadge: {
    backgroundColor: 'rgba(194, 59, 59, 0.2)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  explosionText: {
    color: Colors.danger,
    fontSize: 10,
    fontWeight: '700' as const,
  },
  dmgGrid: {
    flexDirection: 'row' as const,
    gap: 4,
  },
  dmgCol: {
    flex: 1,
  },
  dmgSide: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '600' as const,
    marginBottom: 2,
  },
  dmgDetail: {
    color: Colors.textSecondary,
    fontSize: 11,
  },
  dmgKills: {
    color: Colors.danger,
    fontSize: 11,
    fontWeight: '600' as const,
    marginTop: 2,
  },
  dmgSep: {
    width: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 4,
  },
  survivorRow: {
    flexDirection: 'row' as const,
    gap: 12,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  survivorText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600' as const,
  },
  explosionDetail: {
    color: Colors.textMuted,
    fontSize: 10,
  },
  anomalyBlock: {
    backgroundColor: 'rgba(194, 59, 59, 0.1)',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  anomalyTitle: {
    color: Colors.danger,
    fontSize: 12,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  anomalyText: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
});
