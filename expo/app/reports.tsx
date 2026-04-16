import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { ScanEye, Swords, Truck, Recycle, ShieldAlert, Trash2, Anchor } from 'lucide-react-native';
import ClickableCoords from '@/components/ClickableCoords';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFleet } from '@/contexts/FleetContext';
import { useAuth } from '@/contexts/AuthContext';
import { EspionageReport, CombatReport, TransportReport } from '@/types/fleet';
import Colors from '@/constants/colors';

type TabMode = 'espionage' | 'combat' | 'transport';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return Math.floor(n).toString();
}

function SpyReportCard({ report, onPress, onDelete }: { report: EspionageReport; onPress: () => void; onDelete: () => void }) {
  const coords = report.target_coords;
  const isAlert = report.probes_sent === 0;

  if (isAlert) {
    return (
      <TouchableOpacity style={styles.reportCard} onPress={onPress} activeOpacity={0.7}>
        <View style={styles.reportHeader}>
          <View style={[styles.reportIconWrap, { backgroundColor: Colors.warning + '18' }]}>
            <ShieldAlert size={16} color={Colors.warning} />
          </View>
          <View style={styles.reportInfo}>
            <Text style={styles.reportTitle}>Activité suspecte détectée</Text>
            <ClickableCoords coords={coords} style={styles.reportCoords} />
          </View>
          <View style={styles.reportRight}>
            <TouchableOpacity onPress={onDelete} hitSlop={8} style={styles.deleteBtn}>
              <Trash2 size={14} color={Colors.danger} />
            </TouchableOpacity>
            <Text style={styles.reportTime}>{timeAgo(report.created_at)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.reportCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.reportHeader}>
        <View style={[styles.reportIconWrap, { backgroundColor: Colors.silice + '18' }]}>
          <ScanEye size={16} color={Colors.silice} />
        </View>
        <View style={styles.reportInfo}>
          <Text style={styles.reportTitle}>{report.target_username ?? 'Inconnu'}</Text>
          <ClickableCoords coords={coords} style={styles.reportCoords} />
        </View>
        <View style={styles.reportRight}>
          <TouchableOpacity onPress={onDelete} hitSlop={8} style={styles.deleteBtn}>
            <Trash2 size={14} color={Colors.danger} />
          </TouchableOpacity>
          <Text style={styles.reportTime}>{timeAgo(report.created_at)}</Text>
        </View>
      </View>
      {report.resources && (
        <View style={styles.reportResources}>
          <Text style={styles.resText}>
            <Text style={{ color: Colors.fer }}>Fe: {formatNumber(report.resources.fer)}</Text>
            {'  '}
            <Text style={{ color: Colors.silice }}>Si: {formatNumber(report.resources.silice)}</Text>
            {'  '}
            <Text style={{ color: Colors.xenogas }}>Xe: {formatNumber(report.resources.xenogas)}</Text>
          </Text>
        </View>
      )}
      {report.probes_lost > 0 && (
        <Text style={styles.probesLost}>{report.probes_lost} sonde{report.probes_lost > 1 ? 's' : ''} perdue{report.probes_lost > 1 ? 's' : ''}</Text>
      )}
    </TouchableOpacity>
  );
}

function CombatReportCard({ report, onPress, onDelete, userId }: { report: CombatReport; onPress: () => void; onDelete: () => void; userId: string | null }) {
  const isAttacker = report.attacker_id === userId;
  const coords = report.target_coords;
  const resultColors: Record<string, string> = {
    attacker_wins: isAttacker ? Colors.success : Colors.danger,
    defender_wins: isAttacker ? Colors.danger : Colors.success,
    draw: Colors.warning,
  };
  const resultLabels: Record<string, string> = {
    attacker_wins: isAttacker ? 'Victoire' : 'Défaite',
    defender_wins: isAttacker ? 'Défaite' : 'Victoire',
    draw: 'Nul',
  };
  const resultColor = resultColors[report.result] ?? Colors.textMuted;
  const resultLabel = resultLabels[report.result] ?? report.result;

  return (
    <TouchableOpacity style={styles.reportCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.reportHeader}>
        <View style={[styles.reportIconWrap, { backgroundColor: resultColor + '18' }]}>
          <Swords size={16} color={resultColor} />
        </View>
        <View style={styles.reportInfo}>
          <Text style={styles.reportTitle}>
            {isAttacker ? report.defender_username : report.attacker_username}
          </Text>
          <ClickableCoords coords={coords} style={styles.reportCoords} />
        </View>
        <View style={styles.reportRight}>
          <TouchableOpacity onPress={onDelete} hitSlop={8} style={styles.deleteBtn}>
            <Trash2 size={14} color={Colors.danger} />
          </TouchableOpacity>
          <View style={[styles.resultBadge, { backgroundColor: resultColor + '18', borderColor: resultColor + '40' }]}>
            <Text style={[styles.resultText, { color: resultColor }]}>{resultLabel}</Text>
          </View>
          <Text style={styles.reportTime}>{timeAgo(report.created_at)}</Text>
        </View>
      </View>
      {report.loot && (report.loot.fer > 0 || report.loot.silice > 0 || report.loot.xenogas > 0) && isAttacker && (
        <View style={styles.reportResources}>
          <Text style={styles.lootLabel}>Butin: </Text>
          <Text style={styles.resText}>
            <Text style={{ color: Colors.fer }}>Fe: {formatNumber(report.loot.fer)}</Text>
            {'  '}
            <Text style={{ color: Colors.silice }}>Si: {formatNumber(report.loot.silice)}</Text>
            {'  '}
            <Text style={{ color: Colors.xenogas }}>Xe: {formatNumber(report.loot.xenogas)}</Text>
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function TransportReportCard({ report, onPress, onDelete }: { report: TransportReport; onPress: () => void; onDelete: () => void }) {
  const isRecycle = report.mission_type === 'recycle';
  const isStation = report.mission_type === 'station';
  const iconColor = isRecycle ? Colors.warning : (isStation ? Colors.silice : Colors.success);
  const Icon = isRecycle ? Recycle : (isStation ? Anchor : Truck);

  const res = report.resources;
  const senderCoords = report.sender_coords;
  const receiverCoords = report.receiver_coords;

  const title = isRecycle
    ? `Recyclage [${receiverCoords[0]}:${receiverCoords[1]}:${receiverCoords[2]}]`
    : `${report.sender_username} [${senderCoords[0]}:${senderCoords[1]}:${senderCoords[2]}] → ${report.receiver_username ?? 'Inconnu'} [${receiverCoords[0]}:${receiverCoords[1]}:${receiverCoords[2]}]`;

  return (
    <TouchableOpacity style={styles.reportCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.reportHeader}>
        <View style={[styles.reportIconWrap, { backgroundColor: iconColor + '18' }]}>
          <Icon size={16} color={iconColor} />
        </View>
        <View style={styles.reportInfo}>
          <Text style={styles.reportTitle} numberOfLines={2}>
            {title}
          </Text>
        </View>
        <View style={styles.reportRight}>
          <TouchableOpacity onPress={onDelete} hitSlop={8} style={styles.deleteBtn}>
            <Trash2 size={14} color={Colors.danger} />
          </TouchableOpacity>
          <View style={[styles.resultBadge, { backgroundColor: iconColor + '18', borderColor: iconColor + '40' }]}>
            <Text style={[styles.resultText, { color: iconColor }]}>
              {isRecycle ? 'Recyclage' : (isStation ? 'Stationné' : (report.viewer_role === 'receiver' ? 'Reçu' : 'Livré'))}
            </Text>
          </View>
          <Text style={styles.reportTime}>{timeAgo(report.completed_at)}</Text>
        </View>
      </View>
      {res && (res.fer > 0 || res.silice > 0 || res.xenogas > 0) && (
        <View style={styles.reportResources}>
          <Text style={styles.lootLabel}>{isRecycle ? 'Collecté: ' : (isStation ? 'Stationné: ' : (report.viewer_role === 'receiver' ? 'Reçu: ' : 'Livré: '))}</Text>
          <Text style={styles.resText}>
            {res.fer > 0 && <Text style={{ color: Colors.fer }}>Fe: {formatNumber(res.fer)}  </Text>}
            {res.silice > 0 && <Text style={{ color: Colors.silice }}>Si: {formatNumber(res.silice)}  </Text>}
            {res.xenogas > 0 && <Text style={{ color: Colors.xenogas }}>Xe: {formatNumber(res.xenogas)}</Text>}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function ReportsScreen() {
  const router = useRouter();
  const {
    espionageReports, combatReports, transportReports, refreshReports,
    deleteEspionageReport, deleteCombatReport, deleteTransportReport,
    deleteAllEspionageReports, deleteAllCombatReports, deleteAllTransportReports,
  } = useFleet();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabMode>('espionage');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refreshReports();
    setTimeout(() => setRefreshing(false), 1000);
  }, [refreshReports]);

  const confirmDeleteOne = useCallback((type: TabMode, id: string) => {
    Alert.alert(
      'Supprimer le rapport',
      'Voulez-vous vraiment supprimer ce rapport ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            if (type === 'espionage') void deleteEspionageReport(id);
            else if (type === 'combat') void deleteCombatReport(id);
            else void deleteTransportReport(id);
          },
        },
      ],
    );
  }, [deleteEspionageReport, deleteCombatReport, deleteTransportReport]);

  const confirmDeleteAll = useCallback((type: TabMode) => {
    const labels: Record<TabMode, string> = {
      espionage: 'espionnage',
      combat: 'combat',
      transport: 'transport',
    };
    Alert.alert(
      'Tout supprimer',
      `Supprimer tous les rapports de ${labels[type]} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Tout supprimer',
          style: 'destructive',
          onPress: () => {
            if (type === 'espionage') void deleteAllEspionageReports();
            else if (type === 'combat') void deleteAllCombatReports();
            else void deleteAllTransportReports();
          },
        },
      ],
    );
  }, [deleteAllEspionageReports, deleteAllCombatReports, deleteAllTransportReports]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>Retour</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Rapports</Text>
          {((tab === 'espionage' && espionageReports.length > 0) ||
            (tab === 'combat' && combatReports.length > 0) ||
            (tab === 'transport' && transportReports.length > 0)) ? (
            <TouchableOpacity onPress={() => confirmDeleteAll(tab)} style={styles.deleteAllBtn}>
              <Trash2 size={14} color={Colors.danger} />
              <Text style={styles.deleteAllText}>Tout</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 60 }} />
          )}
        </View>

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'espionage' && styles.tabBtnActive]}
            onPress={() => setTab('espionage')}
          >
            <ScanEye size={14} color={tab === 'espionage' ? Colors.silice : Colors.textMuted} />
            <Text style={[styles.tabLabel, tab === 'espionage' && { color: Colors.silice }]}>
              Espion ({espionageReports.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'combat' && styles.tabBtnActive]}
            onPress={() => setTab('combat')}
          >
            <Swords size={14} color={tab === 'combat' ? Colors.danger : Colors.textMuted} />
            <Text style={[styles.tabLabel, tab === 'combat' && { color: Colors.danger }]}>
              Combat ({combatReports.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'transport' && styles.tabBtnActive]}
            onPress={() => setTab('transport')}
          >
            <Truck size={14} color={tab === 'transport' ? Colors.success : Colors.textMuted} />
            <Text style={[styles.tabLabel, tab === 'transport' && { color: Colors.success }]}>
              Transport ({transportReports.length})
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
          {tab === 'espionage' && (
            <>
              {espionageReports.length === 0 && (
                <View style={styles.emptyState}>
                  <ScanEye size={40} color={Colors.textMuted} />
                  <Text style={styles.emptyTitle}>Aucun rapport d{"'"}espionnage</Text>
                  <Text style={styles.emptyDesc}>Envoyez des sondes depuis la vue Atlas.</Text>
                </View>
              )}
              {espionageReports.map(r => (
                <SpyReportCard
                  key={r.id}
                  report={r}
                  onPress={() => router.push({ pathname: '/espionage-report', params: { reportId: r.id } })}
                  onDelete={() => confirmDeleteOne('espionage', r.id)}
                />
              ))}
            </>
          )}

          {tab === 'combat' && (
            <>
              {combatReports.length === 0 && (
                <View style={styles.emptyState}>
                  <Swords size={40} color={Colors.textMuted} />
                  <Text style={styles.emptyTitle}>Aucun rapport de combat</Text>
                  <Text style={styles.emptyDesc}>Lancez une attaque pour voir les résultats ici.</Text>
                </View>
              )}
              {combatReports.map(r => (
                <CombatReportCard
                  key={r.id}
                  report={r}
                  onPress={() => router.push({ pathname: '/combat-report', params: { reportId: r.id } })}
                  onDelete={() => confirmDeleteOne('combat', r.id)}
                  userId={user?.id ?? null}
                />
              ))}
            </>
          )}

          {tab === 'transport' && (
            <>
              {transportReports.length === 0 && (
                <View style={styles.emptyState}>
                  <Truck size={40} color={Colors.textMuted} />
                  <Text style={styles.emptyTitle}>Aucun rapport de transport</Text>
                  <Text style={styles.emptyDesc}>Envoyez des ressources ou recyclez des débris.</Text>
                </View>
              )}
              {transportReports.map(r => (
                <TransportReportCard
                  key={r.id}
                  report={r}
                  onPress={() => router.push({ pathname: '/transport-report', params: { reportId: r.id } })}
                  onDelete={() => confirmDeleteOne('transport', r.id)}
                />
              ))}
            </>
          )}

          <View style={{ height: 20 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeArea: {
    flex: 1,
  },
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
  tabRow: {
    flexDirection: 'row' as const,
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 4,
  },
  tabBtnActive: {
    backgroundColor: Colors.primaryGlow,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  tabLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600' as const,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  reportCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reportHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  reportIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  reportInfo: { flex: 1 },
  reportTitle: { color: Colors.text, fontSize: 14, fontWeight: '600' as const },
  reportCoords: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  reportRight: { alignItems: 'flex-end' as const, gap: 4 },
  reportTime: { color: Colors.textMuted, fontSize: 10 },
  resultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  resultText: { fontSize: 11, fontWeight: '700' as const },
  reportResources: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  lootLabel: { color: Colors.textMuted, fontSize: 11 },
  resText: { fontSize: 11, fontWeight: '500' as const },
  probesLost: {
    color: Colors.danger,
    fontSize: 11,
    marginTop: 6,
  },
  emptyState: {
    alignItems: 'center' as const,
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: { color: Colors.text, fontSize: 16, fontWeight: '600' as const },
  emptyDesc: { color: Colors.textMuted, fontSize: 13, textAlign: 'center' as const },
  deleteBtn: {
    padding: 4,
  },
  deleteAllBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    width: 60,
    justifyContent: 'flex-end' as const,
  },
  deleteAllText: {
    color: Colors.danger,
    fontSize: 12,
    fontWeight: '600' as const,
  },
});
