import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft, Database, Shield, Rocket, Building2, FlaskConical,
  Zap, Package, Pickaxe, Gem, Droplets, Sun, Orbit, Thermometer,
  ChevronDown, ChevronUp,
} from 'lucide-react-native';
import { useGame } from '@/contexts/GameContext';
import {
  formatNumber,
  getResourceStorageCapacity,
  getPlasmaProductionBonus,
  getXenogasTempFactor,
  getEnergyTechBonus,
  getHeliosEnergyPerUnit,
  calculateEnergyProduced,
  calculateEnergyConsumption,
  getSolarPlantProduction,
  getMineEnergyConsumption,
} from '@/utils/gameCalculations';
import { SHIPS, DEFENSES } from '@/constants/gameData';
import Colors from '@/constants/colors';
import { trpc } from '@/lib/trpc';

interface DetailLine {
  label: string;
  value: string;
  color?: string;
  indent?: boolean;
}

function ProductionDetailCard({
  icon,
  title,
  totalValue,
  totalLabel,
  color,
  details,
}: {
  icon: React.ReactNode;
  title: string;
  totalValue: string;
  totalLabel: string;
  color: string;
  details: DetailLine[];
}) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <View style={detailStyles.card}>
      <TouchableOpacity
        style={detailStyles.cardHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={[detailStyles.iconWrap, { backgroundColor: color + '18' }]}>
          {icon}
        </View>
        <View style={detailStyles.headerText}>
          <Text style={detailStyles.title}>{title}</Text>
          <Text style={[detailStyles.totalValue, { color }]}>{totalValue}</Text>
        </View>
        <View style={detailStyles.totalBadge}>
          <Text style={[detailStyles.totalLabel, { color }]}>{totalLabel}</Text>
          {expanded
            ? <ChevronUp size={14} color={Colors.textMuted} />
            : <ChevronDown size={14} color={Colors.textMuted} />
          }
        </View>
      </TouchableOpacity>
      {expanded && (
        <View style={detailStyles.detailsWrap}>
          {details.map((d, i) => (
            <View key={i} style={[detailStyles.detailRow, d.indent && { paddingLeft: 12 }]}>
              <Text style={[detailStyles.detailLabel, d.color ? { color: d.color } : null]}>
                {d.label}
              </Text>
              <Text style={[detailStyles.detailValue, d.color ? { color: d.color } : null]}>
                {d.value}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function StorageBar({ label, current, max, color }: { label: string; current: number; max: number; color: string }) {
  const ratio = max > 0 ? Math.min(1, current / max) : 0;
  const isFull = ratio >= 0.99;
  return (
    <View style={storStyles.row}>
      <View style={storStyles.labelRow}>
        <View style={[storStyles.dot, { backgroundColor: color }]} />
        <Text style={storStyles.label}>{label}</Text>
        <Text style={[storStyles.value, isFull && { color: Colors.danger }]}>
          {formatNumber(Math.floor(current))} / {formatNumber(max)}
        </Text>
      </View>
      <View style={storStyles.barBg}>
        <View style={[storStyles.barFill, { width: `${Math.max(1, ratio * 100)}%` as unknown as number, backgroundColor: isFull ? Colors.danger : color }]} />
      </View>
    </View>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <View style={[cardStyles.card, { borderLeftColor: color, borderLeftWidth: 3 }]}>
      <View style={[cardStyles.iconWrap, { backgroundColor: color + '15' }]}>
        {icon}
      </View>
      <View style={cardStyles.textWrap}>
        <Text style={cardStyles.label}>{label}</Text>
        <Text style={cardStyles.value}>{value}</Text>
      </View>
    </View>
  );
}

export default function StatisticsScreen() {
  const router = useRouter();
  const { state, activePlanet, activeProduction, userId } = useGame();

  const isColony = activePlanet.isColony;
  const colony = isColony ? (state.colonies ?? []).find(c => c.id === activePlanet.id) : undefined;

  const temperatureMax = isColony ? colony?.temperatureMax : state.temperatureMax;
  const temperatureMin = isColony ? colony?.temperatureMin : state.temperatureMin;
  const metalBonusPct = isColony ? (colony?.metalBonusPct ?? 0) : (state.metalBonusPct ?? 0);
  const crystalBonusPct = isColony ? (colony?.crystalBonusPct ?? 0) : (state.crystalBonusPct ?? 0);
  const deutBonusPct = isColony ? (colony?.deutBonusPct ?? 0) : (state.deutBonusPct ?? 0);
  const slotPosition = isColony ? colony?.slotPosition : state.slotPosition;
  const totalFields = isColony ? (colony?.totalFields ?? 0) : (state.totalFields ?? 0);
  const baseFields = isColony ? (colony?.baseFields ?? 0) : (state.baseFields ?? 0);

  const buildings = activePlanet.buildings;
  const ships = activePlanet.ships;
  const research = state.research;
  const resources = activePlanet.resources;

  const storageCap = useMemo(() => getResourceStorageCapacity(buildings), [buildings]);

  const plasmaLevel = research?.plasmaOverdrive ?? 0;
  const plasmaBonus = useMemo(() => getPlasmaProductionBonus(plasmaLevel), [plasmaLevel]);
  const quantumFluxLevel = research?.quantumFlux ?? 0;
  const energyTechBonus = useMemo(() => getEnergyTechBonus(quantumFluxLevel), [quantumFluxLevel]);

  const ferLevel = buildings.ferMine ?? 0;
  const siliceLevel = buildings.siliceMine ?? 0;
  const xenogasLevel = buildings.xenogasRefinery ?? 0;
  const solarLevel = buildings.solarPlant ?? 0;
  const heliosCount = ships?.heliosRemorqueur ?? 0;

  const xenoTempFactor = useMemo(() => getXenogasTempFactor(temperatureMax), [temperatureMax]);
  const heliosEPU = useMemo(() => getHeliosEnergyPerUnit(temperatureMax), [temperatureMax]);

  const energyProduced = useMemo(() => calculateEnergyProduced(buildings, research, ships, undefined, temperatureMax), [buildings, research, ships, temperatureMax]);
  const energyConsumed = useMemo(() => calculateEnergyConsumption(buildings), [buildings]);
  const energyRatio = energyConsumed > 0 ? Math.min(1, energyProduced / energyConsumed) : 1;

  const ferDetails = useMemo((): DetailLine[] => {
    if (ferLevel <= 0) return [];
    const baseProd = 10;
    const mineProd = Math.floor(30 * ferLevel * Math.pow(1.1, ferLevel));
    const plasmaProd = Math.floor(mineProd * plasmaBonus.fer);
    const slotProd = metalBonusPct > 0 ? Math.floor((mineProd + plasmaProd) * (metalBonusPct / 100)) : 0;
    const subtotal = baseProd + mineProd + plasmaProd + slotProd;
    const afterEnergy = Math.floor(subtotal * energyRatio);
    const energyLoss = subtotal - afterEnergy;
    const lines: DetailLine[] = [
      { label: 'Production de base', value: `+${formatNumber(baseProd)}/h` },
      { label: `Ferro Mine Nv.${ferLevel}`, value: `+${formatNumber(mineProd)}/h` },
    ];
    if (plasmaLevel > 0) lines.push({ label: `Plasma Overdrive Nv.${plasmaLevel} (+${(plasmaBonus.fer * 100).toFixed(0)}%)`, value: `+${formatNumber(plasmaProd)}/h`, color: Colors.silice, indent: true });
    if (metalBonusPct > 0) lines.push({ label: `Bonus slot (+${metalBonusPct}%)`, value: `+${formatNumber(slotProd)}/h`, color: Colors.primary, indent: true });
    if (energyRatio < 1) lines.push({ label: `Ratio énergie (${Math.round(energyRatio * 100)}%)`, value: `-${formatNumber(energyLoss)}/h`, color: Colors.danger, indent: true });
    return lines;
  }, [ferLevel, plasmaBonus.fer, plasmaLevel, metalBonusPct, energyRatio]);

  const siliceDetails = useMemo((): DetailLine[] => {
    if (siliceLevel <= 0) return [];
    const baseProd = 5;
    const mineProd = Math.floor(20 * siliceLevel * Math.pow(1.1, siliceLevel));
    const plasmaProd = Math.floor(mineProd * plasmaBonus.silice);
    const slotProd = crystalBonusPct > 0 ? Math.floor((mineProd + plasmaProd) * (crystalBonusPct / 100)) : 0;
    const subtotal = baseProd + mineProd + plasmaProd + slotProd;
    const afterEnergy = Math.floor(subtotal * energyRatio);
    const energyLoss = subtotal - afterEnergy;
    const lines: DetailLine[] = [
      { label: 'Production de base', value: `+${formatNumber(baseProd)}/h` },
      { label: `Silica Mine Nv.${siliceLevel}`, value: `+${formatNumber(mineProd)}/h` },
    ];
    if (plasmaLevel > 0) lines.push({ label: `Plasma Overdrive Nv.${plasmaLevel} (+${(plasmaBonus.silice * 100).toFixed(1)}%)`, value: `+${formatNumber(plasmaProd)}/h`, color: Colors.silice, indent: true });
    if (crystalBonusPct > 0) lines.push({ label: `Bonus slot (+${crystalBonusPct}%)`, value: `+${formatNumber(slotProd)}/h`, color: Colors.primary, indent: true });
    if (energyRatio < 1) lines.push({ label: `Ratio énergie (${Math.round(energyRatio * 100)}%)`, value: `-${formatNumber(energyLoss)}/h`, color: Colors.danger, indent: true });
    return lines;
  }, [siliceLevel, plasmaBonus.silice, plasmaLevel, crystalBonusPct, energyRatio]);

  const xenogasDetails = useMemo((): DetailLine[] => {
    if (xenogasLevel <= 0) return [];
    const mineProd = Math.floor(10 * xenogasLevel * Math.pow(1.1, xenogasLevel));
    const plasmaProd = Math.floor(mineProd * plasmaBonus.xenogas);
    const tempEffect = Math.floor((mineProd + plasmaProd) * xenoTempFactor) - (mineProd + plasmaProd);
    const subtotal = Math.floor((mineProd + plasmaProd) * xenoTempFactor);
    const afterEnergy = Math.floor(subtotal * energyRatio);
    const energyLoss = subtotal - afterEnergy;
    const lines: DetailLine[] = [
      { label: `Xeno Well Nv.${xenogasLevel}`, value: `+${formatNumber(mineProd)}/h` },
    ];
    if (plasmaLevel > 0) lines.push({ label: `Plasma Overdrive Nv.${plasmaLevel} (+${(plasmaBonus.xenogas * 100).toFixed(1)}%)`, value: `+${formatNumber(plasmaProd)}/h`, color: Colors.silice, indent: true });
    lines.push({ label: `Facteur temp. (×${xenoTempFactor.toFixed(2)})`, value: tempEffect >= 0 ? `+${formatNumber(tempEffect)}/h` : `${formatNumber(tempEffect)}/h`, color: tempEffect >= 0 ? Colors.xenogas : Colors.danger, indent: true });
    if (energyRatio < 1) lines.push({ label: `Ratio énergie (${Math.round(energyRatio * 100)}%)`, value: `-${formatNumber(energyLoss)}/h`, color: Colors.danger, indent: true });
    return lines;
  }, [xenogasLevel, plasmaBonus.xenogas, plasmaLevel, xenoTempFactor, energyRatio]);

  const energyDetails = useMemo((): DetailLine[] => {
    const lines: DetailLine[] = [];
    if (solarLevel > 0) {
      const solarBase = Math.floor(20 * solarLevel * Math.pow(1.1, solarLevel));
      const solarWithTech = getSolarPlantProduction(solarLevel, quantumFluxLevel);
      lines.push({ label: `Centrale Solaire Nv.${solarLevel}`, value: `+${formatNumber(solarBase)}` });
      if (quantumFluxLevel > 0) {
        const techAdd = solarWithTech - solarBase;
        lines.push({ label: `Quantum Flux Nv.${quantumFluxLevel} (+${(energyTechBonus * 100).toFixed(0)}%)`, value: `+${formatNumber(techAdd)}`, color: Colors.energy, indent: true });
      }
    }
    if (heliosCount > 0) {
      const heliosTotal = Math.floor(heliosCount * heliosEPU);
      lines.push({ label: `Helios Remorqueur ×${heliosCount}`, value: `+${formatNumber(heliosTotal)}` });
      lines.push({ label: `Par unité: (T+160)/6 = ${heliosEPU.toFixed(1)}`, value: '', color: Colors.textMuted, indent: true });
    }
    lines.push({ label: '', value: '' });
    if (ferLevel > 0) {
      const ferCons = getMineEnergyConsumption('ferMine', ferLevel);
      lines.push({ label: `Ferro Mine Nv.${ferLevel}`, value: `-${formatNumber(ferCons)}`, color: Colors.danger });
    }
    if (siliceLevel > 0) {
      const siliceCons = getMineEnergyConsumption('siliceMine', siliceLevel);
      lines.push({ label: `Silica Mine Nv.${siliceLevel}`, value: `-${formatNumber(siliceCons)}`, color: Colors.danger });
    }
    if (xenogasLevel > 0) {
      const xenoCons = getMineEnergyConsumption('xenogasRefinery', xenogasLevel);
      lines.push({ label: `Xeno Well Nv.${xenogasLevel}`, value: `-${formatNumber(xenoCons)}`, color: Colors.danger });
    }
    return lines;
  }, [solarLevel, quantumFluxLevel, energyTechBonus, heliosCount, heliosEPU, ferLevel, siliceLevel, xenogasLevel]);

  const playerScoreQuery = trpc.world.getPlayerScore.useQuery(
    undefined,
    { enabled: !!userId, refetchInterval: 30000 },
  );

  const serverScore = playerScoreQuery.data?.score;
  const scores = useMemo(() => ({
    building: serverScore?.building_points ?? 0,
    research: serverScore?.research_points ?? 0,
    fleet: serverScore?.fleet_points ?? 0,
    defense: serverScore?.defense_points ?? 0,
  }), [serverScore]);
  const totalScore = useMemo(() =>
    serverScore?.total_points ?? (scores.building + scores.research + scores.fleet + scores.defense),
    [serverScore, scores],
  );
  const maxScore = useMemo(() => Math.max(scores.building, scores.research, scores.fleet, scores.defense, 1), [scores]);

  const totalShips = useMemo(() => Object.values(ships).reduce((s, c) => s + c, 0), [ships]);
  const totalDefenses = useMemo(() => Object.values(activePlanet.defenses).reduce((s, c) => s + c, 0), [activePlanet.defenses]);
  const totalBuildings = useMemo(() => Object.values(buildings).reduce((s, l) => s + l, 0), [buildings]);
  const totalResearch = useMemo(() => Object.values(research).reduce((s, l) => s + l, 0), [research]);
  const colonyCount = state.colonies?.length ?? 0;

  const dailyProduction = useMemo(() => ({
    fer: activeProduction.fer * 24,
    silice: activeProduction.silice * 24,
    xenogas: activeProduction.xenogas * 24,
  }), [activeProduction]);

  const planetLabel = activePlanet.planetName + (isColony ? ' (colonie)' : ' (mère)');
  const coordsLabel = activePlanet.coordinates ? `[${activePlanet.coordinates.join(':')}]` : '';

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <ArrowLeft size={20} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Statistiques</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.planetHeader}>
            <View style={styles.planetNameRow}>
              <Orbit size={16} color={Colors.primary} />
              <Text style={styles.planetName}>{planetLabel}</Text>
              <Text style={styles.coordsText}>{coordsLabel}</Text>
            </View>
            <View style={styles.planetInfoRow}>
              {slotPosition != null && (
                <View style={styles.infoPill}>
                  <Text style={styles.infoPillLabel}>Slot</Text>
                  <Text style={styles.infoPillValue}>{slotPosition}</Text>
                </View>
              )}
              <View style={styles.infoPill}>
                <Thermometer size={12} color={Colors.xenogas} />
                <Text style={styles.infoPillValue}>
                  {temperatureMin != null && temperatureMax != null
                    ? `${temperatureMin}°C`
                    : '—'}
                </Text>
              </View>
              <View style={styles.infoPill}>
                <Text style={styles.infoPillLabel}>Cases</Text>
                <Text style={styles.infoPillValue}>{totalFields || baseFields || '—'}</Text>
              </View>
              {metalBonusPct > 0 && (
                <View style={[styles.infoPill, { borderColor: Colors.fer + '40' }]}>
                  <Text style={[styles.infoPillValue, { color: Colors.fer }]}>Fer +{metalBonusPct}%</Text>
                </View>
              )}
              {crystalBonusPct > 0 && (
                <View style={[styles.infoPill, { borderColor: Colors.silice + '40' }]}>
                  <Text style={[styles.infoPillValue, { color: Colors.silice }]}>Silice +{crystalBonusPct}%</Text>
                </View>
              )}
              {deutBonusPct > 0 && (
                <View style={[styles.infoPill, { borderColor: Colors.xenogas + '40' }]}>
                  <Text style={[styles.infoPillValue, { color: Colors.xenogas }]}>Xeno +{deutBonusPct}%</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.scoreHeader}>
            <Text style={styles.scoreLabel}>Score Total</Text>
            {playerScoreQuery.isLoading ? (
              <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 8 }} />
            ) : (
              <Text style={styles.scoreValue}>{formatNumber(totalScore)}</Text>
            )}
            <Text style={styles.scoreUnit}>points</Text>
          </View>

          <Text style={styles.sectionTitle}>Production par heure (détaillée)</Text>

          <ProductionDetailCard
            icon={<Pickaxe size={16} color={Colors.fer} />}
            title="Fer"
            totalValue={`${formatNumber(activeProduction.fer)}/h`}
            totalLabel="total"
            color={Colors.fer}
            details={ferDetails}
          />
          <ProductionDetailCard
            icon={<Gem size={16} color={Colors.silice} />}
            title="Silice"
            totalValue={`${formatNumber(activeProduction.silice)}/h`}
            totalLabel="total"
            color={Colors.silice}
            details={siliceDetails}
          />
          <ProductionDetailCard
            icon={<Droplets size={16} color={Colors.xenogas} />}
            title="Xenogas"
            totalValue={`${formatNumber(activeProduction.xenogas)}/h`}
            totalLabel="total"
            color={Colors.xenogas}
            details={xenogasDetails}
          />

          <ProductionDetailCard
            icon={<Zap size={16} color={activeProduction.energy >= 0 ? Colors.energy : Colors.danger} />}
            title="Énergie"
            totalValue={`${activeProduction.energy >= 0 ? '+' : ''}${formatNumber(activeProduction.energy)}`}
            totalLabel={activeProduction.energy >= 0 ? 'surplus' : 'déficit'}
            color={activeProduction.energy >= 0 ? Colors.energy : Colors.danger}
            details={energyDetails}
          />

          <Text style={styles.sectionTitle}>Production journalière estimée</Text>
          <View style={styles.dailyRow}>
            <View style={styles.dailyCard}>
              <View style={[styles.dailyDot, { backgroundColor: Colors.fer }]} />
              <Text style={styles.dailyValue}>{formatNumber(Math.floor(dailyProduction.fer))}</Text>
              <Text style={styles.dailyLabel}>Fer/jour</Text>
            </View>
            <View style={styles.dailyCard}>
              <View style={[styles.dailyDot, { backgroundColor: Colors.silice }]} />
              <Text style={styles.dailyValue}>{formatNumber(Math.floor(dailyProduction.silice))}</Text>
              <Text style={styles.dailyLabel}>Silice/jour</Text>
            </View>
            <View style={styles.dailyCard}>
              <View style={[styles.dailyDot, { backgroundColor: Colors.xenogas }]} />
              <Text style={styles.dailyValue}>{formatNumber(Math.floor(dailyProduction.xenogas))}</Text>
              <Text style={styles.dailyLabel}>Xeno/jour</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Stockage</Text>
          <View style={styles.section}>
            <StorageBar label="Fer" current={resources.fer} max={storageCap.fer} color={Colors.fer} />
            <StorageBar label="Silice" current={resources.silice} max={storageCap.silice} color={Colors.silice} />
            <StorageBar label="Xenogas" current={resources.xenogas} max={storageCap.xenogas} color={Colors.xenogas} />
          </View>

          <Text style={styles.sectionTitle}>Répartition du score</Text>
          <View style={styles.section}>
            {[
              { label: 'Bâtiments', pts: scores.building, icon: <Building2 size={16} color={Colors.primary} />, color: Colors.primary },
              { label: 'Recherche', pts: scores.research, icon: <FlaskConical size={16} color={Colors.silice} />, color: Colors.silice },
              { label: 'Flotte', pts: scores.fleet, icon: <Rocket size={16} color={Colors.accent} />, color: Colors.accent },
              { label: 'Défense', pts: scores.defense, icon: <Shield size={16} color={Colors.success} />, color: Colors.success },
            ].map(item => {
              const ratio = maxScore > 0 ? Math.min(1, item.pts / maxScore) : 0;
              return (
                <View key={item.label} style={scoreStyles.row}>
                  <View style={scoreStyles.labelRow}>
                    {item.icon}
                    <Text style={scoreStyles.label}>{item.label}</Text>
                    <Text style={[scoreStyles.value, { color: item.color }]}>{formatNumber(item.pts)} pts</Text>
                  </View>
                  <View style={scoreStyles.barBg}>
                    <View style={[scoreStyles.barFill, { width: `${Math.max(2, ratio * 100)}%` as unknown as number, backgroundColor: item.color }]} />
                  </View>
                </View>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>Planète</Text>
          <View style={styles.empireGrid}>
            <StatCard icon={<Building2 size={18} color={Colors.primary} />} label="Bâtiments" value={String(totalBuildings)} color={Colors.primary} />
            <StatCard icon={<FlaskConical size={18} color={Colors.silice} />} label="Recherches" value={String(totalResearch)} color={Colors.silice} />
            <StatCard icon={<Rocket size={18} color={Colors.accent} />} label="Vaisseaux" value={String(totalShips)} color={Colors.accent} />
            <StatCard icon={<Shield size={18} color={Colors.success} />} label="Défenses" value={String(totalDefenses)} color={Colors.success} />
            <StatCard icon={<Database size={18} color={Colors.xenogas} />} label="Colonies" value={String(colonyCount)} color={Colors.xenogas} />
            <StatCard icon={<Package size={18} color={Colors.energy} />} label="Cases" value={String(totalFields || '—')} color={Colors.energy} />
          </View>

          <Text style={styles.sectionTitle}>Flotte & Défenses</Text>
          <View style={styles.section}>
            {SHIPS.filter(s => (ships[s.id] ?? 0) > 0).map(ship => (
              <View key={ship.id} style={fleetStyles.row}>
                <Rocket size={14} color={Colors.primary} />
                <Text style={fleetStyles.name}>{ship.name}</Text>
                <Text style={fleetStyles.count}>x{ships[ship.id]}</Text>
              </View>
            ))}
            {DEFENSES.filter(d => (activePlanet.defenses[d.id] ?? 0) > 0).map(def => (
              <View key={def.id} style={fleetStyles.row}>
                <Shield size={14} color={Colors.success} />
                <Text style={fleetStyles.name}>{def.name}</Text>
                <Text style={fleetStyles.count}>x{activePlanet.defenses[def.id]}</Text>
              </View>
            ))}
            {totalShips === 0 && totalDefenses === 0 && (
              <Text style={fleetStyles.noData}>Aucun vaisseau ou défense</Text>
            )}
          </View>

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
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.card, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: Colors.border },
  headerTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' as const },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  planetHeader: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.primary + '25',
    marginBottom: 16,
  },
  planetNameRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 10,
  },
  planetName: { color: Colors.text, fontSize: 15, fontWeight: '700' as const, flex: 1 },
  coordsText: { color: Colors.textMuted, fontSize: 12, fontWeight: '500' as const },
  planetInfoRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
  },
  infoPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    backgroundColor: Colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoPillLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '600' as const },
  infoPillValue: { color: Colors.textSecondary, fontSize: 11, fontWeight: '700' as const },
  scoreHeader: {
    alignItems: 'center' as const,
    paddingVertical: 18,
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.primary + '25',
    marginBottom: 20,
  },
  scoreLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' as const, textTransform: 'uppercase' as const, letterSpacing: 1 },
  scoreValue: { color: Colors.primary, fontSize: 32, fontWeight: '800' as const, marginTop: 4 },
  scoreUnit: { color: Colors.textSecondary, fontSize: 11, marginTop: 2 },
  sectionTitle: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 8,
  },
  section: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  dailyRow: { flexDirection: 'row' as const, gap: 8, marginBottom: 16 },
  dailyCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dailyDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 6 },
  dailyValue: { color: Colors.text, fontSize: 15, fontWeight: '700' as const },
  dailyLabel: { color: Colors.textMuted, fontSize: 10, marginTop: 2 },
  empireGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginBottom: 16 },
});

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
    overflow: 'hidden' as const,
  },
  cardHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: 12,
    gap: 10,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  headerText: { flex: 1 },
  title: { color: Colors.text, fontSize: 13, fontWeight: '600' as const },
  totalValue: { fontSize: 15, fontWeight: '800' as const, marginTop: 1 },
  totalBadge: { alignItems: 'flex-end' as const, gap: 2 },
  totalLabel: { fontSize: 10, fontWeight: '600' as const, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  detailsWrap: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
  },
  detailRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: 4,
    minHeight: 22,
  },
  detailLabel: { color: Colors.textSecondary, fontSize: 11, flex: 1 },
  detailValue: { color: Colors.text, fontSize: 11, fontWeight: '600' as const, fontVariant: ['tabular-nums'] as const },
});

const storStyles = StyleSheet.create({
  row: { marginBottom: 12 },
  labelRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { color: Colors.text, fontSize: 13, fontWeight: '500' as const, flex: 1 },
  value: { color: Colors.textSecondary, fontSize: 11 },
  barBg: { height: 8, backgroundColor: Colors.surface, borderRadius: 4, overflow: 'hidden' as const },
  barFill: { height: 8, borderRadius: 4 },
});

const scoreStyles = StyleSheet.create({
  row: { marginBottom: 12 },
  labelRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 6 },
  label: { color: Colors.text, fontSize: 13, fontWeight: '500' as const, flex: 1 },
  value: { fontSize: 12, fontWeight: '700' as const },
  barBg: { height: 6, backgroundColor: Colors.surface, borderRadius: 3, overflow: 'hidden' as const },
  barFill: { height: 6, borderRadius: 3 },
});

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    width: '48%' as unknown as number,
    flexGrow: 1,
    flexBasis: '45%' as unknown as number,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const },
  textWrap: { flex: 1 },
  label: { color: Colors.textMuted, fontSize: 10, fontWeight: '600' as const },
  value: { color: Colors.text, fontSize: 18, fontWeight: '700' as const },
});

const fleetStyles = StyleSheet.create({
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  name: { color: Colors.text, fontSize: 13, flex: 1 },
  count: { color: Colors.primary, fontSize: 13, fontWeight: '700' as const },
  noData: { color: Colors.textMuted, fontSize: 13, textAlign: 'center' as const, paddingVertical: 12 },
});
