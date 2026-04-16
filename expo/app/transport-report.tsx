import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Truck, Recycle, Package, Rocket, Anchor } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFleet } from '@/contexts/FleetContext';
import { SHIPS } from '@/constants/gameData';
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

export default function TransportReportScreen() {
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const router = useRouter();
  const { transportReports } = useFleet();

  const report = transportReports.find(r => r.id === reportId);

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

  const isRecycle = report.mission_type === 'recycle';
  const isStation = report.mission_type === 'station';
  const senderCoords = report.sender_coords;
  const receiverCoords = report.receiver_coords;
  const date = new Date(report.completed_at).toLocaleString('fr-FR');
  const accentColor = isRecycle ? Colors.warning : (isStation ? Colors.silice : Colors.success);

  const res = report.resources;
  const isTransportWithResources = !isRecycle && res && (res.fer > 0 || res.silice > 0 || res.xenogas > 0);
  const isRecycleWithResources = isRecycle && res && (res.fer > 0 || res.silice > 0);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>Retour</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isRecycle ? 'Rapport de recyclage' : (isStation ? 'Rapport de stationnement' : 'Rapport de transport')}
          </Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.resultCard, { borderColor: accentColor + '40' }]}>
            {isRecycle ? (
              <Recycle size={28} color={accentColor} />
            ) : isStation ? (
              <Anchor size={28} color={accentColor} />
            ) : (
              <Truck size={28} color={accentColor} />
            )}
            <Text style={[styles.resultTitle, { color: accentColor }]}>
              {isRecycle ? 'Mission de recyclage' : (isStation ? (report.viewer_role === 'receiver' ? 'Flotte stationnée chez vous' : 'Flotte stationnée') : (report.viewer_role === 'receiver' ? 'Ressources reçues' : 'Ressources livrées'))}
            </Text>
            <Text style={styles.dateText}>{date}</Text>
          </View>

          <View style={styles.routeCard}>
            <View style={styles.routePoint}>
              <View style={[styles.routeDot, { backgroundColor: Colors.primary }]} />
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>Origine</Text>
                <Text style={styles.routeName}>{report.sender_username}</Text>
                {senderCoords && (
                  <TouchableOpacity onPress={() => router.replace({ pathname: '/(tabs)/galaxy', params: { g: String(senderCoords[0]), ss: String(senderCoords[1]) } })}>
                    <Text style={styles.routeCoords}>[{senderCoords[0]}:{senderCoords[1]}:{senderCoords[2]}]</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <View style={styles.routeLine} />
            <View style={styles.routePoint}>
              <View style={[styles.routeDot, { backgroundColor: accentColor }]} />
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>Destination</Text>
                <Text style={styles.routeName}>
                  {isRecycle ? 'Champ de débris' : (report.receiver_username ?? 'Inconnu')}
                </Text>
                <ClickableCoords coords={receiverCoords} style={styles.routeCoords} />
              </View>
            </View>
          </View>

          {isTransportWithResources && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Package size={16} color={Colors.success} />
                <Text style={styles.sectionTitle}>
                  {isStation ? 'Ressources transférées' : (report.viewer_role === 'receiver' ? 'Ressources reçues' : 'Ressources livrées')}
                </Text>
              </View>
              <View style={styles.resourceGrid}>
                {res.fer > 0 && (
                  <View style={styles.resourceItem}>
                    <View style={[styles.resDot, { backgroundColor: Colors.fer }]} />
                    <Text style={styles.resLabel}>Fer</Text>
                    <Text style={styles.resValue}>{formatN(res.fer)}</Text>
                  </View>
                )}
                {res.silice > 0 && (
                  <View style={styles.resourceItem}>
                    <View style={[styles.resDot, { backgroundColor: Colors.silice }]} />
                    <Text style={styles.resLabel}>Silice</Text>
                    <Text style={styles.resValue}>{formatN(res.silice)}</Text>
                  </View>
                )}
                {res.xenogas > 0 && (
                  <View style={styles.resourceItem}>
                    <View style={[styles.resDot, { backgroundColor: Colors.xenogas }]} />
                    <Text style={styles.resLabel}>Xenogas</Text>
                    <Text style={styles.resValue}>{formatN(res.xenogas)}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {isRecycleWithResources && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Recycle size={16} color={Colors.warning} />
                <Text style={styles.sectionTitle}>Débris collectés</Text>
              </View>
              <View style={styles.resourceGrid}>
                {res.fer > 0 && (
                  <View style={styles.resourceItem}>
                    <View style={[styles.resDot, { backgroundColor: Colors.fer }]} />
                    <Text style={styles.resLabel}>Fer</Text>
                    <Text style={styles.resValue}>{formatN(res.fer)}</Text>
                  </View>
                )}
                {res.silice > 0 && (
                  <View style={styles.resourceItem}>
                    <View style={[styles.resDot, { backgroundColor: Colors.silice }]} />
                    <Text style={styles.resLabel}>Silice</Text>
                    <Text style={styles.resValue}>{formatN(res.silice)}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {report.ships && Object.keys(report.ships).length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Rocket size={16} color={Colors.primary} />
                <Text style={styles.sectionTitle}>{isStation ? 'Flotte stationnée' : 'Flotte envoyée'}</Text>
              </View>
              {Object.entries(report.ships).filter(([, c]) => c > 0).map(([id, count]) => (
                <View key={id} style={styles.unitRow}>
                  <Text style={styles.unitName}>{shipName(id)}</Text>
                  <Text style={styles.unitCount}>{count}</Text>
                </View>
              ))}
            </View>
          )}

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
  resultTitle: { fontSize: 20, fontWeight: '800' as const, marginTop: 8 },
  dateText: { color: Colors.textMuted, fontSize: 11, marginTop: 6 },
  routeCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  routePoint: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 12,
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  routeInfo: { flex: 1 },
  routeLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '600' as const, textTransform: 'uppercase' as const },
  routeName: { color: Colors.text, fontSize: 14, fontWeight: '700' as const, marginTop: 2 },
  routeCoords: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600' as const,
    marginTop: 2,
    letterSpacing: 0.5,
    textDecorationLine: 'underline' as const,
  },
  routeLine: {
    width: 2,
    height: 16,
    backgroundColor: Colors.border,
    marginLeft: 5,
    marginVertical: 4,
  },
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
  resourceGrid: { flexDirection: 'row' as const, gap: 8 },
  resourceItem: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resDot: { width: 6, height: 6, borderRadius: 3, marginBottom: 4 },
  resLabel: { color: Colors.textMuted, fontSize: 10 },
  resValue: { color: Colors.text, fontSize: 14, fontWeight: '700' as const, marginTop: 2 },
  unitRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  unitName: { color: Colors.textSecondary, fontSize: 12, flex: 1 },
  unitCount: { color: Colors.text, fontSize: 12, fontWeight: '600' as const },
  emptyState: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  emptyText: { color: Colors.textMuted, fontSize: 14 },
});
