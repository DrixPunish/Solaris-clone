import { useCallback, useMemo } from 'react';
import { useGame } from '@/contexts/GameContext';
import { Resources } from '@/types/game';

export function usePlanetActions(planetId: string | null) {
  const game = useGame();

  const isColony = useMemo(() => {
    if (!planetId) {
      return false;
    }

    return (game.state.colonies ?? []).some((colony) => colony.id === planetId);
  }, [game.state.colonies, planetId]);

  const renamePlanet = useCallback((newName: string) => {
    if (!planetId || !isColony) {
      void game.renamePlanet(newName);
      return;
    }

    void game.renameColony(planetId, newName);
  }, [game, isColony, planetId]);

  const upgradeBuilding = useCallback((buildingId: string) => {
    if (!planetId || !isColony) {
      void game.upgradeBuilding(buildingId);
      return;
    }

    void game.upgradeColonyBuilding(planetId, buildingId);
  }, [game, isColony, planetId]);

  const upgradeResearch = useCallback((researchId: string) => {
    if (!planetId || !isColony) {
      void game.upgradeResearch(researchId);
      return;
    }

    void game.upgradeColonyResearch(planetId, researchId);
  }, [game, isColony, planetId]);

  const buildShipQueue = useCallback((shipId: string, quantity: number) => {
    if (!planetId || !isColony) {
      void game.buildShipQueue(shipId, quantity);
      return;
    }

    void game.buildColonyShipQueue(planetId, shipId, quantity);
  }, [game, isColony, planetId]);

  const buildDefenseQueue = useCallback((defenseId: string, quantity: number) => {
    if (!planetId || !isColony) {
      void game.buildDefenseQueue(defenseId, quantity);
      return;
    }

    void game.buildColonyDefenseQueue(planetId, defenseId, quantity);
  }, [game, isColony, planetId]);

  const rushWithSolar = useCallback((targetId: string, timerType: 'building' | 'research') => {
    if (!planetId || !isColony) {
      void game.rushWithSolar(targetId, timerType);
      return;
    }

    void game.rushColonyWithSolar(planetId, targetId, timerType);
  }, [game, isColony, planetId]);

  const cancelUpgrade = useCallback((targetId: string, timerType: 'building' | 'research') => {
    if (!planetId || !isColony) {
      void game.cancelUpgrade(targetId, timerType);
      return;
    }

    void game.cancelColonyUpgrade(planetId, targetId, timerType);
  }, [game, isColony, planetId]);

  const rushShipyardWithSolar = useCallback((itemId: string, itemType: 'ship' | 'defense') => {
    if (!planetId || !isColony) {
      void game.rushShipyardWithSolar(itemId, itemType);
      return;
    }

    void game.rushColonyShipyardWithSolar(planetId, itemId, itemType);
  }, [game, isColony, planetId]);

  const cancelShipyardQueue = useCallback((itemId: string, itemType: 'ship' | 'defense') => {
    if (!planetId || !isColony) {
      void game.cancelShipyardQueue(itemId, itemType);
      return;
    }

    void game.cancelColonyShipyardQueue(planetId, itemId, itemType);
  }, [game, isColony, planetId]);

  const getMaxBuildableQuantity = useCallback((cost: Partial<Resources>): number => {
    if (!planetId || !isColony) {
      return game.getMaxBuildableQuantity(cost);
    }

    return game.getColonyMaxBuildableQuantity(planetId, cost);
  }, [game, isColony, planetId]);

  return {
    isColony,
    renamePlanet,
    upgradeBuilding,
    upgradeResearch,
    buildShipQueue,
    buildDefenseQueue,
    rushWithSolar,
    cancelUpgrade,
    rushShipyardWithSolar,
    cancelShipyardQueue,
    getMaxBuildableQuantity,
  };
}
