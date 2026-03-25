import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { ScanEye, Package, Building2, FlaskConical, Rocket, Shield, AlertTriangle, ShieldAlert } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFleet } from '@/contexts/FleetContext';
import { BUILDINGS, RESEARCH, SHIPS, DEFENSES } from '@/constants/gameData';
import Colors from '@/constants/colors';
import ClickableCoords from '@/components/ClickableCoords';

function formatN(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return Math.floor(n).toString();
}

function nameFor(type: 'building' | 'research' | 'ship' | 'defense', id: string): string {
  if (type === 'building') return BUILDINGS.find(b => b.id === id)?.name ?? id;
  if (type === 'research') return RESEARCH.find(r => r.id === id)?.name ?? id;
  if (type === 'ship') return SHIPS.find(s => s.id === id)?.name ?? id;
  return DEFENSES.find(d => d.id === id)?.name ?? id;
}

function Section({ title, icon, children, locked }: {
  title: string;
  icon: React.ReactNode;
  iconColor?: string;
  children: React.ReactNode;
  locked?: boolean;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        {icon}
        <Text style={styles.sectionTitle}>{title}</Text>
        {locked && <Text style={styles.lockedBadge}>Données insuffisantes</Text>}
      </View>
      {locked ? (
        <View style={styles.lockedContent}>
          <AlertTriangle size={14} color={Colors.warning} />
          <Text style={styles.lockedText}>Envoyez plus de sondes ou améliorez votre Sonar Cosmique</Text>
        </View>
      ) : (
        children
      )}
    </View>
  );
}

export default function EspionageReportScreen() {
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const router = useRouter();
  const { espionageReports } = useFleet();

  const report = espionageReports.find(r => r.id === reportId);

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

  const coords = report.target_coords;
  const date = new Date(report.created_at).toLocaleString('fr-FR');
  const isAlert = report.probes_sent === 0;

  if (isAlert) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backText}>Retour</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Alerte</Text>
            <View style={{ width: 60 }} />
          </View>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={[styles.targetCard, { borderColor: Colors.warning + '30' }]}>
              <ShieldAlert size={32} color={Colors.warning} />
              <Text style={[styles.targetName, { color: Colors.warning }]}>Intrusion détectée</Text>
              <ClickableCoords coords={coords} style={styles.targetCoordsLink} />
              <Text style={styles.dateText}>{date}</Text>
            </View>
            <View style={styles.alertNarrative}>
              <Text style={styles.alertNarrativeText}>
                Commandant, nos systèmes de détection ont intercepté des signatures électromagnétiques anormales en orbite de votre planète. Des sondes furtives non identifiées ont brièvement pénétré votre espace aérien avant de disparaître dans le vide intersidéral.
              </Text>
              <Text style={[styles.alertNarrativeText, { marginTop: 12 }]}>
                Il est fort probable qu{"'"}un empire rival ait tenté de scanner vos infrastructures et vos réserves. Nous recommandons de renforcer immédiatement vos défenses planétaires et de déplacer vos ressources stratégiques.
              </Text>
              <Text style={[styles.alertNarrativeText, { marginTop: 12, fontStyle: 'italic', opacity: 0.7 }]}>
                L{"'"}identité de l{"'"}agresseur reste inconnue. Restez vigilant.
              </Text>
            </View>
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>Retour</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Rapport d{"'"}espionnage</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.targetCard}>
            <ScanEye size={24} color={Colors.silice} />
            <Text style={styles.targetName}>{report.target_username ?? 'Inconnu'}</Text>
            <Text style={styles.targetPlanet}>{report.target_planet_name ?? '?'}</Text>
            <ClickableCoords coords={coords} style={styles.targetCoordsLink} />
            <Text style={styles.dateText}>{date}</Text>
            <View style={styles.probeRow}>
              <Text style={styles.probeText}>
                Sondes envoyées: {report.probes_sent}
              </Text>
              {report.probes_lost > 0 && (
                <Text style={styles.probeLost}> ({report.probes_lost} perdue{report.probes_lost > 1 ? 's' : ''})</Text>
              )}
            </View>
          </View>

          <Section
            title="Ressources"
            icon={<Package size={16} color={Colors.primary} />}
            iconColor={Colors.primary}
            locked={!report.resources}
          >
            {report.resources && (
              <View style={styles.resourceGrid}>
                <View style={styles.resCard}>
                  <View style={[styles.resDot, { backgroundColor: Colors.fer }]} />
                  <Text style={styles.resLabel}>Fer</Text>
                  <Text style={styles.resValue}>{formatN(report.resources.fer)}</Text>
                </View>
                <View style={styles.resCard}>
                  <View style={[styles.resDot, { backgroundColor: Colors.silice }]} />
                  <Text style={styles.resLabel}>Silice</Text>
                  <Text style={styles.resValue}>{formatN(report.resources.silice)}</Text>
                </View>
                <View style={styles.resCard}>
                  <View style={[styles.resDot, { backgroundColor: Colors.xenogas }]} />
                  <Text style={styles.resLabel}>Xenogas</Text>
                  <Text style={styles.resValue}>{formatN(report.resources.xenogas)}</Text>
                </View>
              </View>
            )}
          </Section>

          <Section
            title="Bâtiments"
            icon={<Building2 size={16} color={Colors.energy} />}
            iconColor={Colors.energy}
            locked={!report.buildings}
          >
            {report.buildings && (
              <View style={styles.listGrid}>
                {Object.entries(report.buildings).filter(([, v]) => v > 0).map(([id, level]) => (
                  <View key={id} style={styles.listItem}>
                    <Text style={styles.listName}>{nameFor('building', id)}</Text>
                    <Text style={styles.listLevel}>Nv.{level}</Text>
                  </View>
                ))}
              </View>
            )}
          </Section>

          <Section
            title="Recherches"
            icon={<FlaskConical size={16} color={Colors.silice} />}
            iconColor={Colors.silice}
            locked={!report.research}
          >
            {report.research && (
              <View style={styles.listGrid}>
                {Object.entries(report.research).filter(([, v]) => v > 0).map(([id, level]) => (
                  <View key={id} style={styles.listItem}>
                    <Text style={styles.listName}>{nameFor('research', id)}</Text>
                    <Text style={styles.listLevel}>Nv.{level}</Text>
                  </View>
                ))}
              </View>
            )}
          </Section>

          <Section
            title="Flotte"
            icon={<Rocket size={16} color={Colors.accent} />}
            iconColor={Colors.accent}
            locked={!report.ships}
          >
            {report.ships && (
              <View style={styles.listGrid}>
                {Object.entries(report.ships).filter(([, v]) => v > 0).map(([id, count]) => (
                  <View key={id} style={styles.listItem}>
                    <Text style={styles.listName}>{nameFor('ship', id)}</Text>
                    <Text style={styles.listLevel}>x{count}</Text>
                  </View>
                ))}
                {Object.values(report.ships).every(v => v === 0) && (
                  <Text style={styles.noneText}>Aucun vaisseau</Text>
                )}
              </View>
            )}
          </Section>

          <Section
            title="Défenses"
            icon={<Shield size={16} color={Colors.success} />}
            iconColor={Colors.success}
            locked={!report.defenses}
          >
            {report.defenses && (
              <View style={styles.listGrid}>
                {Object.entries(report.defenses).filter(([, v]) => v > 0).map(([id, count]) => (
                  <View key={id} style={styles.listItem}>
                    <Text style={styles.listName}>{nameFor('defense', id)}</Text>
                    <Text style={styles.listLevel}>x{count}</Text>
                  </View>
                ))}
                {Object.values(report.defenses).every(v => v === 0) && (
                  <Text style={styles.noneText}>Aucune défense</Text>
                )}
              </View>
            )}
          </Section>

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
  targetCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: Colors.silice + '30',
    marginBottom: 16,
  },
  targetName: { color: Colors.text, fontSize: 18, fontWeight: '700' as const, marginTop: 8 },
  targetPlanet: { color: Colors.textSecondary, fontSize: 13, marginTop: 2 },
  targetCoordsLink: { color: Colors.primary, fontSize: 14, fontWeight: '600' as const, marginTop: 4, letterSpacing: 1, textDecorationLine: 'underline' as const },
  dateText: { color: Colors.textMuted, fontSize: 11, marginTop: 8 },
  probeRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginTop: 6 },
  probeText: { color: Colors.textSecondary, fontSize: 12 },
  probeLost: { color: Colors.danger, fontSize: 12, fontWeight: '600' as const },
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
  sectionTitle: { color: Colors.text, fontSize: 14, fontWeight: '600' as const, flex: 1 },
  lockedBadge: {
    color: Colors.warning,
    fontSize: 10,
    fontWeight: '600' as const,
    backgroundColor: Colors.warning + '15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  lockedContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingVertical: 8,
  },
  lockedText: { color: Colors.warning, fontSize: 12, flex: 1 },
  resourceGrid: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  resCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resDot: { width: 6, height: 6, borderRadius: 3, marginBottom: 4 },
  resLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '500' as const },
  resValue: { color: Colors.text, fontSize: 15, fontWeight: '700' as const, marginTop: 2 },
  listGrid: { gap: 4 },
  listItem: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  listName: { color: Colors.textSecondary, fontSize: 12 },
  listLevel: { color: Colors.text, fontSize: 12, fontWeight: '600' as const },
  noneText: { color: Colors.textMuted, fontSize: 12, fontStyle: 'italic' as const },
  emptyState: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  emptyText: { color: Colors.textMuted, fontSize: 14 },
  alertNarrative: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.warning + '25',
  },
  alertNarrativeText: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
  },
});
