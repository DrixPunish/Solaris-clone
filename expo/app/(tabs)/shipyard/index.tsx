import React, { useCallback, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, LayoutChangeEvent } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  Rocket, Package, Truck, Home, Zap, Crosshair,
  Shield, Anchor, Flame, Swords, CircleDot, Sun, Target,
  Radio, ScanEye, Navigation, Ship, Bomb, SquareStack,
  Minus, Plus,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useGame } from '@/contexts/GameContext';
import { canAfford, formatNumber, formatSpeed, formatTime, checkPrerequisites, getBoostedShipStats, getBoostedDefenseStats, calculateShipBuildTime, calculateSolarCost } from '@/utils/gameCalculations';
import { getMissingPrereqLabels } from '@/utils/prereqLabels';
import { SHIPS, DEFENSES } from '@/constants/gameData';
import { Resources, ShipDef, DefenseDef } from '@/types/game';
import ResourceBar from '@/components/ResourceBar';
import GameCard from '@/components/GameCard';
import InfoDetailModal from '@/components/InfoDetailModal';
import PrereqTree from '@/components/PrereqTree';
import SolarConfirmModal from '@/components/SolarConfirmModal';
import CollapsibleSection from '@/components/CollapsibleSection';
import Colors from '@/constants/colors';

type TabMode = 'ships' | 'defenses';

const SHIP_SPRITES: Record<string, string> = {
  novaScout: 'https://r2-pub.rork.com/generated-images/bba3836e-be8f-43ea-be8e-fad3165bab05.png',
  ferDeLance: 'https://r2-pub.rork.com/generated-images/f9c8f9a6-12f8-4782-9910-527d3b32fe56.png',
  cyclone: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/ret77c6q3zk3z3i90hkpf',
  bastion: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/1n7dke1zs8dqp5r2abjve',
  pyro: 'https://r2-pub.rork.com/generated-images/8ebc9e63-7776-47ae-ba50-af1d15803573.png',
  nemesis: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/h3k0ikgdmtrlcis9ub3un',
  fulgurant: 'https://r2-pub.rork.com/generated-images/05186ae9-ae3e-4440-9db0-b121a7ada672.png',
  titanAstral: 'https://r2-pub.rork.com/generated-images/e7cdcb99-c100-468a-b8a3-7bdfe5fae3d2.png',
};

const SHIP_ICONS: Record<string, { icon: React.ComponentType<{ size: number; color: string }>; color: string }> = {
  novaScout: { icon: Navigation, color: Colors.primary },
  ferDeLance: { icon: Swords, color: Colors.accent },
  cyclone: { icon: Ship, color: Colors.xenogas },
  bastion: { icon: Anchor, color: Colors.danger },
  pyro: { icon: Flame, color: Colors.warning },
  nemesis: { icon: Crosshair, color: Colors.silice },
  fulgurant: { icon: Bomb, color: Colors.warning },
  titanAstral: { icon: Zap, color: Colors.solar },
  atlasCargo: { icon: Package, color: Colors.fer },
  atlasCargoXL: { icon: Truck, color: Colors.energy },
  colonyShip: { icon: Home, color: Colors.success },
  mantaRecup: { icon: SquareStack, color: Colors.primaryDim },
  spectreSonde: { icon: ScanEye, color: Colors.silice },
  heliosRemorqueur: { icon: Sun, color: Colors.energy },
};

const DEFENSE_ICONS: Record<string, { icon: React.ComponentType<{ size: number; color: string }>; color: string }> = {
  kineticTurret: { icon: Target, color: Colors.fer },
  pulseCannon: { icon: Zap, color: Colors.primary },
  beamCannon: { icon: Radio, color: Colors.xenogas },
  massDriver: { icon: Crosshair, color: Colors.danger },
  ionProjector: { icon: CircleDot, color: Colors.silice },
  solarCannon: { icon: Sun, color: Colors.warning },
  smallShield: { icon: Shield, color: Colors.primaryDim },
  largeShield: { icon: Shield, color: Colors.solar },
};

const COMBAT_SHIP_IDS = ['novaScout', 'ferDeLance', 'cyclone', 'bastion', 'pyro', 'nemesis', 'fulgurant', 'titanAstral'];
const UTILITY_SHIP_IDS = ['atlasCargo', 'atlasCargoXL', 'colonyShip', 'mantaRecup', 'spectreSonde', 'heliosRemorqueur'];

function QuantitySelector({ quantity, maxQuantity, onChange }: { quantity: number; maxQuantity: number; onChange: (q: number) => void }) {
  const decrement = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(Math.max(1, quantity - 1));
  }, [quantity, onChange]);

  const increment = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(Math.min(maxQuantity, quantity + 1));
  }, [quantity, maxQuantity, onChange]);

  const setMax = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(Math.max(1, maxQuantity));
  }, [maxQuantity, onChange]);

  const handleTextChange = useCallback((text: string) => {
    const num = parseInt(text, 10);
    if (!isNaN(num) && num >= 1) {
      onChange(Math.min(num, maxQuantity));
    } else if (text === '') {
      onChange(1);
    }
  }, [maxQuantity, onChange]);

  return (
    <View style={qStyles.container}>
      <TouchableOpacity onPress={decrement} style={qStyles.btn} activeOpacity={0.6}>
        <Minus size={14} color={Colors.text} />
      </TouchableOpacity>
      <TextInput
        style={qStyles.input}
        value={String(quantity)}
        onChangeText={handleTextChange}
        keyboardType="number-pad"
        selectTextOnFocus
        maxLength={5}
      />
      <TouchableOpacity onPress={increment} style={qStyles.btn} activeOpacity={0.6}>
        <Plus size={14} color={Colors.text} />
      </TouchableOpacity>
      <TouchableOpacity onPress={setMax} style={qStyles.maxBtn} activeOpacity={0.6}>
        <Text style={qStyles.maxText}>MAX</Text>
      </TouchableOpacity>
    </View>
  );
}

const qStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  btn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    width: 54,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
    paddingVertical: 0,
  },
  maxBtn: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.primary + '18',
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  maxText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700' as const,
  },
});

export default function ShipyardScreen() {
  const { state, activePlanet, activeBuildShipQueue, activeBuildDefenseQueue, activeRushShipyardWithSolar, activeCancelShipyardQueue, activeGetMaxBuildableQuantity, getSolarCooldownEnd } = useGame();
  const { tab, scrollTo, _t } = useLocalSearchParams<{ tab?: string; scrollTo?: string; _t?: string }>();
  const [activeTab, setActiveTab] = useState<TabMode>(tab === 'defenses' ? 'defenses' : 'ships');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [infoModal, setInfoModal] = useState<{ id: string; type: 'ship' | 'defense' } | null>(null);
  const [prereqModal, setPrereqModal] = useState<{ id: string; type: 'ship' | 'defense' } | null>(null);
  const [solarConfirm, setSolarConfirm] = useState<{ id: string; type: 'ship' | 'defense'; cost: number; name: string } | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const itemLayouts = useRef<Record<string, number>>({});
  const sectionLayouts = useRef<Record<string, number>>({});
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);

  useEffect(() => {
    if (tab === 'defenses') {
      setActiveTab('defenses');
    } else if (tab === 'ships') {
      setActiveTab('ships');
    }
  }, [tab]);

  useEffect(() => {
    if (scrollTo) {
      const isDefenseItem = DEFENSES.some(d => d.id === scrollTo);
      if (isDefenseItem) {
        setActiveTab('defenses');
      } else {
        setActiveTab('ships');
      }
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
      const isShip = SHIPS.some(s => s.id === scrollTarget);
      const isCombatShip = COMBAT_SHIP_IDS.includes(scrollTarget);
      let sectionId = 'combat';
      if (isShip) {
        sectionId = isCombatShip ? 'combat' : 'utility';
      } else {
        const isShield = ['smallShield', 'largeShield'].includes(scrollTarget);
        sectionId = isShield ? 'shields' : 'turrets';
      }
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

  const shouldForceOpen = useCallback((itemIds: string[]) => {
    return !!scrollTarget && itemIds.some(id => id === scrollTarget);
  }, [scrollTarget]);

  const shipyardLevel = activePlanet.buildings.shipyard ?? 0;
  const hasShipyard = shipyardLevel >= 1;

  const getQuantity = useCallback((id: string) => quantities[id] ?? 1, [quantities]);
  const setQuantity = useCallback((id: string, q: number) => {
    setQuantities(prev => ({ ...prev, [id]: q }));
  }, []);

  const handleShipyardRush = useCallback((itemId: string, itemType: 'ship' | 'defense') => {
    const queueItem = activePlanet.shipyardQueue.find(q => q.id === itemId && q.type === itemType);
    if (!queueItem) return;
    const now = Date.now();
    const currentUnitRemaining = Math.max(0, Math.ceil((queueItem.currentUnitEndTime - now) / 1000));
    const futureUnitsTime = (queueItem.remainingQuantity - 1) * queueItem.buildTimePerUnit;
    const totalRemainingSeconds = currentUnitRemaining + futureUnitsTime;
    const cost = calculateSolarCost(totalRemainingSeconds);
    const itemList = itemType === 'ship' ? SHIPS : DEFENSES;
    const item = itemList.find(i => i.id === itemId);
    setSolarConfirm({ id: itemId, type: itemType, cost, name: item?.name ?? itemId });
  }, [activePlanet.shipyardQueue]);

  const handleSolarConfirm = useCallback(() => {
    if (solarConfirm) {
      activeRushShipyardWithSolar(solarConfirm.id, solarConfirm.type);
      setSolarConfirm(null);
    }
  }, [solarConfirm, activeRushShipyardWithSolar]);

  const renderShip = useCallback(
    (ship: ShipDef) => {
      const count = activePlanet.ships[ship.id] ?? 0;
      const qty = getQuantity(ship.id);
      const unitCost: Resources = {
        fer: ship.cost.fer ?? 0,
        silice: ship.cost.silice ?? 0,
        xenogas: ship.cost.xenogas ?? 0,
        energy: 0,
      };
      const totalCost: Resources = {
        fer: unitCost.fer * qty,
        silice: unitCost.silice * qty,
        xenogas: unitCost.xenogas * qty,
        energy: 0,
      };
      const affordable = canAfford(activePlanet.resources, totalCost);
      const maxBuildable = activeGetMaxBuildableQuantity(ship.cost);
      const spriteUrl = SHIP_SPRITES[ship.id];
      const iconDef = SHIP_ICONS[ship.id];
      const IconComponent = iconDef?.icon ?? Rocket;
      const iconColor = iconDef?.color ?? Colors.primary;
      const queueItem = activePlanet.shipyardQueue.find(q => q.id === ship.id && q.type === 'ship');

      const { met: prereqsMet } = checkPrerequisites(ship.prerequisites, activePlanet.buildings, state.research);
      const missingPrereqs = getMissingPrereqLabels(ship.prerequisites, activePlanet.buildings, state.research);

      const costs = [];
      if (totalCost.fer > 0) costs.push({ label: 'Fer', value: formatNumber(totalCost.fer), affordable: activePlanet.resources.fer >= totalCost.fer });
      if (totalCost.silice > 0) costs.push({ label: 'Silice', value: formatNumber(totalCost.silice), affordable: activePlanet.resources.silice >= totalCost.silice });
      if (totalCost.xenogas > 0) costs.push({ label: 'Xenogas', value: formatNumber(totalCost.xenogas), affordable: activePlanet.resources.xenogas >= totalCost.xenogas });

      const boosted = getBoostedShipStats(ship.stats, state.research);
      const stats = [
        { label: 'ATK', value: formatNumber(boosted.attack) },
        { label: 'SHD', value: formatNumber(boosted.shield) },
        { label: 'HULL', value: formatNumber(boosted.hull) },
        { label: 'SPD', value: formatSpeed(boosted.speed) },
        { label: 'CARGO', value: formatNumber(boosted.cargo) },
      ];

      const naniteLevel = activePlanet.buildings.naniteFactory ?? 0;
      const buildTimePerUnit = calculateShipBuildTime(ship.buildTime, shipyardLevel, naniteLevel);

      return (
        <View key={ship.id} onLayout={(e) => handleItemLayout(ship.id, e)}>
          <GameCard
            icon={spriteUrl ? <Image source={{ uri: spriteUrl }} style={styles.shipSprite} /> : <IconComponent size={22} color={iconColor} />}
            iconColor={iconColor}
            title={ship.name}
            count={count}
            subtitle={`Temps/unité: ${formatTime(buildTimePerUnit)}`}
            description={ship.description}
            stats={stats}
            costs={!queueItem ? costs : undefined}
            queueInfo={queueItem ? {
              remainingQuantity: queueItem.remainingQuantity,
              totalQuantity: queueItem.totalQuantity,
              currentUnitStartTime: queueItem.currentUnitStartTime,
              currentUnitEndTime: queueItem.currentUnitEndTime,
              buildTimePerUnit: queueItem.buildTimePerUnit,
            } : undefined}
            solarBalance={state.solar}
            actionLabel={`Construire x${qty}`}
            actionDisabled={!hasShipyard || !affordable || !prereqsMet}
            disabledReason={!prereqsMet ? `Requis: ${missingPrereqs[0]}` : !hasShipyard ? 'Construire un Chantier Spatial' : 'Ressources insuffisantes'}
            missingPrereqs={!prereqsMet ? missingPrereqs : undefined}
            onAction={() => activeBuildShipQueue(ship.id, qty)}
            onRush={queueItem ? () => handleShipyardRush(ship.id, 'ship') : undefined}
            rushCooldownEnd={queueItem ? getSolarCooldownEnd(ship.id, 'ship') : undefined}
            onCancel={queueItem ? () => activeCancelShipyardQueue(ship.id, 'ship') : undefined}
            cancelRefundInfo={queueItem ? `Seules les ${queueItem.remainingQuantity} unité(s) restante(s) seront annulées. Les unités déjà construites ne sont pas affectées. 80% des ressources des unités annulées seront remboursées.` : undefined}
            onInfo={() => setInfoModal({ id: ship.id, type: 'ship' })}
            onPrereqTree={!prereqsMet ? () => setPrereqModal({ id: ship.id, type: 'ship' }) : undefined}
          />
          {!queueItem && hasShipyard && prereqsMet && (
            <View style={styles.quantityRow}>
              <QuantitySelector
                quantity={qty}
                maxQuantity={maxBuildable}
                onChange={(q) => setQuantity(ship.id, q)}
              />
            </View>
          )}
        </View>
      );
    },
    [activePlanet, state.solar, state.research, hasShipyard, shipyardLevel, activeBuildShipQueue, handleShipyardRush, activeCancelShipyardQueue, getQuantity, setQuantity, activeGetMaxBuildableQuantity, handleItemLayout, getSolarCooldownEnd],
  );

  const renderDefense = useCallback(
    (defense: DefenseDef) => {
      const count = activePlanet.defenses[defense.id] ?? 0;
      const qty = getQuantity(defense.id);
      const unitCost: Resources = {
        fer: defense.cost.fer ?? 0,
        silice: defense.cost.silice ?? 0,
        xenogas: defense.cost.xenogas ?? 0,
        energy: 0,
      };
      const totalCost: Resources = {
        fer: unitCost.fer * qty,
        silice: unitCost.silice * qty,
        xenogas: unitCost.xenogas * qty,
        energy: 0,
      };
      const affordable = canAfford(activePlanet.resources, totalCost);
      const maxBuildable = activeGetMaxBuildableQuantity(defense.cost);
      const iconDef = DEFENSE_ICONS[defense.id];
      const IconComponent = iconDef?.icon ?? Shield;
      const iconColor = iconDef?.color ?? Colors.primary;
      const queueItem = activePlanet.shipyardQueue.find(q => q.id === defense.id && q.type === 'defense');

      const { met: prereqsMet } = checkPrerequisites(defense.prerequisites, activePlanet.buildings, state.research);
      const missingPrereqs = getMissingPrereqLabels(defense.prerequisites, activePlanet.buildings, state.research);

      const costs = [];
      if (totalCost.fer > 0) costs.push({ label: 'Fer', value: formatNumber(totalCost.fer), affordable: activePlanet.resources.fer >= totalCost.fer });
      if (totalCost.silice > 0) costs.push({ label: 'Silice', value: formatNumber(totalCost.silice), affordable: activePlanet.resources.silice >= totalCost.silice });
      if (totalCost.xenogas > 0) costs.push({ label: 'Xenogas', value: formatNumber(totalCost.xenogas), affordable: activePlanet.resources.xenogas >= totalCost.xenogas });

      const boostedDef = getBoostedDefenseStats(defense.stats, state.research);
      const stats = [
        { label: 'ATK', value: formatNumber(boostedDef.attack) },
        { label: 'SHD', value: formatNumber(boostedDef.shield) },
        { label: 'HULL', value: formatNumber(boostedDef.hull) },
      ];

      const naniteLevel = activePlanet.buildings.naniteFactory ?? 0;
      const buildTimePerUnit = calculateShipBuildTime(defense.buildTime, shipyardLevel, naniteLevel);

      return (
        <View key={defense.id} onLayout={(e) => handleItemLayout(defense.id, e)}>
          <GameCard
            icon={<IconComponent size={22} color={iconColor} />}
            iconColor={iconColor}
            title={defense.name}
            count={count}
            subtitle={`Temps/unité: ${formatTime(buildTimePerUnit)}`}
            description={defense.description}
            stats={stats}
            costs={!queueItem ? costs : undefined}
            queueInfo={queueItem ? {
              remainingQuantity: queueItem.remainingQuantity,
              totalQuantity: queueItem.totalQuantity,
              currentUnitStartTime: queueItem.currentUnitStartTime,
              currentUnitEndTime: queueItem.currentUnitEndTime,
              buildTimePerUnit: queueItem.buildTimePerUnit,
            } : undefined}
            solarBalance={state.solar}
            actionLabel={`Construire x${qty}`}
            actionDisabled={!hasShipyard || !affordable || !prereqsMet}
            disabledReason={!prereqsMet ? `Requis: ${missingPrereqs[0]}` : !hasShipyard ? 'Construire un Chantier Spatial' : 'Ressources insuffisantes'}
            missingPrereqs={!prereqsMet ? missingPrereqs : undefined}
            onAction={() => activeBuildDefenseQueue(defense.id, qty)}
            onRush={queueItem ? () => handleShipyardRush(defense.id, 'defense') : undefined}
            rushCooldownEnd={queueItem ? getSolarCooldownEnd(defense.id, 'defense') : undefined}
            onCancel={queueItem ? () => activeCancelShipyardQueue(defense.id, 'defense') : undefined}
            cancelRefundInfo={queueItem ? `Seules les ${queueItem.remainingQuantity} unité(s) restante(s) seront annulées. Les unités déjà construites ne sont pas affectées. 80% des ressources des unités annulées seront remboursées.` : undefined}
            onInfo={() => setInfoModal({ id: defense.id, type: 'defense' })}
            onPrereqTree={!prereqsMet ? () => setPrereqModal({ id: defense.id, type: 'defense' }) : undefined}
          />
          {!queueItem && hasShipyard && prereqsMet && (
            <View style={styles.quantityRow}>
              <QuantitySelector
                quantity={qty}
                maxQuantity={maxBuildable}
                onChange={(q) => setQuantity(defense.id, q)}
              />
            </View>
          )}
        </View>
      );
    },
    [activePlanet, state.solar, state.research, hasShipyard, shipyardLevel, activeBuildDefenseQueue, handleShipyardRush, activeCancelShipyardQueue, getQuantity, setQuantity, activeGetMaxBuildableQuantity, handleItemLayout, getSolarCooldownEnd],
  );

  const combatShips = SHIPS.filter(s => COMBAT_SHIP_IDS.includes(s.id));
  const utilityShips = SHIPS.filter(s => UTILITY_SHIP_IDS.includes(s.id));

  return (
    <View style={styles.container}>
      <ResourceBar />

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'ships' && styles.tabButtonActive]}
          onPress={() => setActiveTab('ships')}
          activeOpacity={0.7}
        >
          <Rocket size={16} color={activeTab === 'ships' ? Colors.primary : Colors.textMuted} />
          <Text style={[styles.tabLabel, activeTab === 'ships' && styles.tabLabelActive]}>Vaisseaux</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'defenses' && styles.tabButtonActive]}
          onPress={() => setActiveTab('defenses')}
          activeOpacity={0.7}
        >
          <Shield size={16} color={activeTab === 'defenses' ? Colors.primary : Colors.textMuted} />
          <Text style={[styles.tabLabel, activeTab === 'defenses' && styles.tabLabelActive]}>Défenses</Text>
        </TouchableOpacity>
      </View>

      <ScrollView ref={scrollViewRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!hasShipyard && (
          <View style={styles.warningCard}>
            <Text style={styles.warningText}>
              Construisez un Chantier Spatial (Nv. 1) pour débloquer cette section.
            </Text>
          </View>
        )}

        {activeTab === 'ships' && (
          <>
            <View onLayout={(e) => handleSectionLayout('combat', e)}>
              <CollapsibleSection title="Vaisseaux de Combat" forceOpen={shouldForceOpen(COMBAT_SHIP_IDS)}>
                {combatShips.map(renderShip)}
              </CollapsibleSection>
            </View>

            <View onLayout={(e) => handleSectionLayout('utility', e)}>
              <CollapsibleSection title="Vaisseaux Utilitaires" forceOpen={shouldForceOpen(UTILITY_SHIP_IDS)}>
                {utilityShips.map(renderShip)}
              </CollapsibleSection>
            </View>
          </>
        )}

        {activeTab === 'defenses' && (
          <>
            <View onLayout={(e) => handleSectionLayout('turrets', e)}>
              <CollapsibleSection title="Tourelles & Canons" forceOpen={shouldForceOpen(DEFENSES.filter(d => !['smallShield', 'largeShield'].includes(d.id)).map(d => d.id))}>
                {DEFENSES.filter(d => !['smallShield', 'largeShield'].includes(d.id)).map(renderDefense)}
              </CollapsibleSection>
            </View>

            <View onLayout={(e) => handleSectionLayout('shields', e)}>
              <CollapsibleSection title="Boucliers Planétaires" forceOpen={shouldForceOpen(['smallShield', 'largeShield'])}>
                {DEFENSES.filter(d => ['smallShield', 'largeShield'].includes(d.id)).map(renderDefense)}
              </CollapsibleSection>
            </View>
          </>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {infoModal && (
        <InfoDetailModal
          visible={!!infoModal}
          onClose={() => setInfoModal(null)}
          itemId={infoModal.id}
          itemType={infoModal.type}
          currentLevel={0}
          buildings={activePlanet.buildings}
          research={state.research}
          ships={activePlanet.ships}
          colonies={state.colonies}
        />
      )}

      {prereqModal && (
        <PrereqTree
          visible={!!prereqModal}
          onClose={() => setPrereqModal(null)}
          itemId={prereqModal.id}
          itemType={prereqModal.type}
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
  tabRow: {
    flexDirection: 'row' as const,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: Colors.primaryGlow,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  tabLabel: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  tabLabelActive: {
    color: Colors.primary,
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
  quantityRow: {
    marginTop: -6,
    marginBottom: 12,
    paddingHorizontal: 14,
  },
  shipSprite: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
  },
});
