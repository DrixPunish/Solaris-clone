import React, { useCallback, useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, LayoutChangeEvent } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Zap, Target, Sword, Shield, ShieldCheck, Flame, Gauge, Eye, Cpu, Globe, Atom, Navigation, Brain, Orbit } from 'lucide-react-native';
import CollapsibleSection from '@/components/CollapsibleSection';
import { useGame } from '@/contexts/GameContext';
import { calculateCost, canAfford, formatNumber, calculateResearchTime, formatTime, checkPrerequisites, calculateSolarCost, getNeuralMeshLabBonus } from '@/utils/gameCalculations';
import { getMissingPrereqLabels } from '@/utils/prereqLabels';
import { RESEARCH } from '@/constants/gameData';
import ResourceBar from '@/components/ResourceBar';
import GameCard from '@/components/GameCard';
import InfoDetailModal from '@/components/InfoDetailModal';
import PrereqTree from '@/components/PrereqTree';
import SolarConfirmModal from '@/components/SolarConfirmModal';
import Colors from '@/constants/colors';

const RESEARCH_ICONS: Record<string, { icon: React.ComponentType<{ size: number; color: string }>; color: string }> = {
  quantumFlux: { icon: Zap, color: Colors.energy },
  plasmaOverdrive: { icon: Atom, color: Colors.accent },
  particleBeam: { icon: Target, color: Colors.danger },
  ionicStream: { icon: Gauge, color: Colors.xenogas },
  weaponsTech: { icon: Sword, color: Colors.accent },
  shieldTech: { icon: Shield, color: Colors.primary },
  armorTech: { icon: ShieldCheck, color: Colors.fer },
  chemicalDrive: { icon: Flame, color: Colors.accent },
  impulseReactor: { icon: Navigation, color: Colors.xenogas },
  voidDrive: { icon: Orbit, color: Colors.silice },
  computerTech: { icon: Cpu, color: Colors.primary },
  espionageTech: { icon: Eye, color: Colors.silice },
  astrophysics: { icon: Globe, color: Colors.success },
  subspacialNodes: { icon: Brain, color: Colors.xenogas },
  neuralMesh: { icon: Brain, color: Colors.solar },
  gravitonTech: { icon: Zap, color: Colors.warning },
};

const ENERGY_RESEARCH_IDS = ['quantumFlux', 'plasmaOverdrive'];
const COMBAT_RESEARCH_IDS = ['particleBeam', 'ionicStream', 'weaponsTech', 'shieldTech', 'armorTech'];
const PROPULSION_RESEARCH_IDS = ['chemicalDrive', 'impulseReactor', 'voidDrive'];
const ADVANCED_RESEARCH_IDS = ['computerTech', 'espionageTech', 'astrophysics', 'subspacialNodes', 'neuralMesh', 'gravitonTech'];

export default function ResearchScreen() {
  const { state, activePlanet, activeUpgradeResearch, activeRushWithSolar, activeCancelUpgrade } = useGame();
  const { scrollTo, _t } = useLocalSearchParams<{ scrollTo?: string; _t?: string }>();
  const labLevel = activePlanet.buildings.researchLab ?? 0;
  const hasLab = labLevel >= 1;
  const [infoModal, setInfoModal] = useState<{ id: string; level: number } | null>(null);
  const [prereqModal, setPrereqModal] = useState<string | null>(null);
  const [solarConfirm, setSolarConfirm] = useState<{ id: string; cost: number; name: string } | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const itemLayouts = useRef<Record<string, number>>({});
  const sectionLayouts = useRef<Record<string, number>>({});
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);

  useEffect(() => {
    if (scrollTo) {
      setScrollTarget(scrollTo);
    }
  }, [scrollTo, _t]);

  useEffect(() => {
    if (!scrollTarget) return;
    const timer = setTimeout(() => {
      const itemY = itemLayouts.current[scrollTarget];
      if (itemY === undefined || !scrollViewRef.current) {
        setScrollTarget(null);
        return;
      }
      let sectionId = 'advanced';
      if (ENERGY_RESEARCH_IDS.includes(scrollTarget)) sectionId = 'energy';
      else if (COMBAT_RESEARCH_IDS.includes(scrollTarget)) sectionId = 'combat';
      else if (PROPULSION_RESEARCH_IDS.includes(scrollTarget)) sectionId = 'propulsion';
      const sectionY = sectionLayouts.current[sectionId] ?? 0;
      const SECTION_HEADER_HEIGHT = 42;
      const totalY = sectionY + SECTION_HEADER_HEIGHT + itemY;
      scrollViewRef.current.scrollTo({ y: Math.max(0, totalY - 10), animated: true });
      setScrollTarget(null);
    }, 400);
    return () => clearTimeout(timer);
  }, [scrollTarget]);

  const handleItemLayout = useCallback((id: string, e: LayoutChangeEvent) => {
    itemLayouts.current[id] = e.nativeEvent.layout.y;
  }, []);

  const handleSectionLayout = useCallback((sectionId: string, e: LayoutChangeEvent) => {
    sectionLayouts.current[sectionId] = e.nativeEvent.layout.y;
  }, []);

  const shouldForceOpen = useCallback((researchIds: string[]) => {
    return !!scrollTarget && researchIds.some(id => id === scrollTarget);
  }, [scrollTarget]);

  const handleRush = useCallback((researchId: string) => {
    const timer = activePlanet.activeTimers.find(t => t.id === researchId && t.type === 'research');
    const globalTimer = state.activeTimers.find(t => t.id === researchId && t.type === 'research');
    const activeTimer = timer || globalTimer;
    if (!activeTimer) return;
    const remainingSeconds = Math.max(0, Math.ceil((activeTimer.endTime - Date.now()) / 1000));
    const cost = calculateSolarCost(remainingSeconds);
    const research = RESEARCH.find(r => r.id === researchId);
    setSolarConfirm({ id: researchId, cost, name: research?.name ?? researchId });
  }, [activePlanet.activeTimers, state.activeTimers]);

  const handleSolarConfirm = useCallback(() => {
    if (solarConfirm) {
      activeRushWithSolar(solarConfirm.id, 'research');
      setSolarConfirm(null);
    }
  }, [solarConfirm, activeRushWithSolar]);

  const renderResearch = useCallback(
    (research: typeof RESEARCH[0]) => {
      const level = state.research[research.id] ?? 0;
      const cost = calculateCost(research.baseCost, research.costFactor, level);
      const affordable = canAfford(activePlanet.resources, cost);
      const iconDef = RESEARCH_ICONS[research.id];
      const IconComponent = iconDef?.icon ?? Zap;
      const iconColor = iconDef?.color ?? Colors.primary;

      const timer = activePlanet.activeTimers.find(t => t.id === research.id && t.type === 'research');
      const globalTimer = !activePlanet.isColony ? null : state.activeTimers.find(t => t.id === research.id && t.type === 'research');
      const otherColonyTimer = (state.colonies ?? []).some(c => c.id !== activePlanet.id && c.activeTimers.some(t => t.id === research.id && t.type === 'research'));
      const mainPlanetTimer = activePlanet.isColony ? state.activeTimers.find(t => t.id === research.id && t.type === 'research') : null;
      const isCurrentlyResearching = !!timer || !!globalTimer || otherColonyTimer || !!mainPlanetTimer;
      const activeTimer = timer || globalTimer || mainPlanetTimer;

      const { met: prereqsMet } = checkPrerequisites(research.prerequisites, activePlanet.buildings, state.research);
      const missingPrereqs = getMissingPrereqLabels(research.prerequisites, activePlanet.buildings, state.research);

      const labLevel = activePlanet.buildings.researchLab ?? 0;
      const naniteLevel = activePlanet.buildings.naniteFactory ?? 0;
      const neuralMeshLvl = state.research.neuralMesh ?? 0;
      const otherSources = activePlanet.isColony
        ? [{ buildings: state.buildings }, ...(state.colonies ?? []).filter(c => c.id !== activePlanet.id)]
        : (state.colonies ?? []);
      const effectiveLab = getNeuralMeshLabBonus(neuralMeshLvl, labLevel, otherSources);
      const upgradeDuration = calculateResearchTime(research.baseTime, research.timeFactor, level, effectiveLab, naniteLevel);

      const costs = [];
      if (cost.fer > 0) costs.push({ label: 'Fer', value: formatNumber(cost.fer), affordable: activePlanet.resources.fer >= cost.fer });
      if (cost.silice > 0) costs.push({ label: 'Silice', value: formatNumber(cost.silice), affordable: activePlanet.resources.silice >= cost.silice });
      if (cost.xenogas > 0) costs.push({ label: 'Xenogas', value: formatNumber(cost.xenogas), affordable: activePlanet.resources.xenogas >= cost.xenogas });

      return (
        <GameCard
          icon={<IconComponent size={22} color={iconColor} />}
          iconColor={iconColor}
          title={research.name}
          level={level}
          description={research.description}
          costs={costs}
          actionLabel={level === 0 ? `Rechercher (${formatTime(upgradeDuration)})` : `Améliorer Nv.${level + 1} (${formatTime(upgradeDuration)})`}
          actionDisabled={!hasLab || !affordable || isCurrentlyResearching || !prereqsMet}
          disabledReason={isCurrentlyResearching ? (globalTimer || otherColonyTimer || mainPlanetTimer) ? 'Recherche en cours ailleurs' : 'En cours...' : !prereqsMet ? `Requis: ${missingPrereqs[0]}` : !hasLab ? 'Construire un Labo' : 'Ressources insuffisantes'}
          missingPrereqs={!prereqsMet ? missingPrereqs : undefined}
          timerStartTime={activeTimer?.startTime ?? timer?.startTime}
          timerEndTime={activeTimer?.endTime ?? timer?.endTime}
          timerTargetLevel={activeTimer?.targetLevel ?? timer?.targetLevel}
          solarBalance={state.solar}
          onAction={() => activeUpgradeResearch(research.id)}
          onRush={timer ? () => handleRush(research.id) : undefined}
          onCancel={timer ? () => activeCancelUpgrade(research.id, 'research') : undefined}
          onInfo={() => setInfoModal({ id: research.id, level })}
          onPrereqTree={!prereqsMet ? () => setPrereqModal(research.id) : undefined}
        />
      );
    },
    [state, activePlanet, hasLab, activeUpgradeResearch, handleRush, activeCancelUpgrade],
  );

  return (
    <View style={styles.container}>
      <ResourceBar />
      <ScrollView ref={scrollViewRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!hasLab && (
          <View style={styles.warningCard}>
            <Text style={styles.warningText}>
              Construisez un Laboratoire de Recherche (Nv. 1) pour débloquer la recherche.
            </Text>
          </View>
        )}

        <View onLayout={(e) => handleSectionLayout('energy', e)}>
          <CollapsibleSection title="Énergie & Production" forceOpen={shouldForceOpen(ENERGY_RESEARCH_IDS)}>
            {RESEARCH.filter(r => ENERGY_RESEARCH_IDS.includes(r.id)).map(r => (
              <View key={r.id} onLayout={(e) => handleItemLayout(r.id, e)}>
                {renderResearch(r)}
              </View>
            ))}
          </CollapsibleSection>
        </View>

        <View onLayout={(e) => handleSectionLayout('combat', e)}>
          <CollapsibleSection title="Armement & Défense" forceOpen={shouldForceOpen(COMBAT_RESEARCH_IDS)}>
            {RESEARCH.filter(r => COMBAT_RESEARCH_IDS.includes(r.id)).map(r => (
              <View key={r.id} onLayout={(e) => handleItemLayout(r.id, e)}>
                {renderResearch(r)}
              </View>
            ))}
          </CollapsibleSection>
        </View>

        <View onLayout={(e) => handleSectionLayout('propulsion', e)}>
          <CollapsibleSection title="Propulsion" forceOpen={shouldForceOpen(PROPULSION_RESEARCH_IDS)}>
            {RESEARCH.filter(r => PROPULSION_RESEARCH_IDS.includes(r.id)).map(r => (
              <View key={r.id} onLayout={(e) => handleItemLayout(r.id, e)}>
                {renderResearch(r)}
              </View>
            ))}
          </CollapsibleSection>
        </View>

        <View onLayout={(e) => handleSectionLayout('advanced', e)}>
          <CollapsibleSection title="Intelligence & Exploration" forceOpen={shouldForceOpen(ADVANCED_RESEARCH_IDS)}>
            {RESEARCH.filter(r => ADVANCED_RESEARCH_IDS.includes(r.id)).map(r => (
              <View key={r.id} onLayout={(e) => handleItemLayout(r.id, e)}>
                {renderResearch(r)}
              </View>
            ))}
          </CollapsibleSection>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {infoModal && (
        <InfoDetailModal
          visible={!!infoModal}
          onClose={() => setInfoModal(null)}
          itemId={infoModal.id}
          itemType="research"
          currentLevel={infoModal.level}
          buildings={activePlanet.buildings}
          research={state.research}
          colonies={state.colonies}
        />
      )}

      {prereqModal && (
        <PrereqTree
          visible={!!prereqModal}
          onClose={() => setPrereqModal(null)}
          itemId={prereqModal}
          itemType="research"
          buildings={activePlanet.buildings}
          research={state.research}
        />
      )}

      {solarConfirm && (
        <SolarConfirmModal
          visible={!!solarConfirm}
          solarCost={solarConfirm.cost}
          solarBalance={state.solar}
          actionDescription={`terminer ${solarConfirm.name}`}
          onConfirm={handleSolarConfirm}
          onCancel={() => setSolarConfirm(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  warningCard: {
    backgroundColor: Colors.warning + '12',
    borderWidth: 1,
    borderColor: Colors.warning + '30',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  warningText: {
    color: Colors.warning,
    fontSize: 12,
    fontWeight: '500' as const,
    textAlign: 'center' as const,
  },
});
