import createContextHook from '@nkzw/create-context-hook';
import { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useGame } from '@/contexts/GameContext';
import { FleetMission, FleetDispatchParams, EspionageReport, CombatReport, TransportReport } from '@/types/fleet';
import { trpc } from '@/lib/trpc';
import { trpcClient } from '@/lib/trpc';

const DELETED_REPORTS_KEY = 'deleted_report_ids';
const REPORTS_PAGE_SIZE = 50;

export const [FleetProvider, useFleet] = createContextHook(() => {
  useAuth();
  const {
    state, userId, forceResync, activePlanet: gamActivePlanet,
  } = useGame();
  const queryClient = useQueryClient();
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem(DELETED_REPORTS_KEY).then(raw => {
      if (raw) {
        try {
          const arr = JSON.parse(raw) as string[];
          if (arr.length > 0) {
            setDeletedIds(new Set(arr));
            console.log('[FleetContext] Loaded', arr.length, 'deleted report IDs from storage');
          }
        } catch (e) {
          console.log('[FleetContext] Error parsing deleted IDs:', e);
        }
      }
    }).catch(() => {});
  }, []);

  const markAsDeleted = useCallback((...ids: string[]) => {
    setDeletedIds(prev => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      const arr = Array.from(next).slice(-500);
      AsyncStorage.setItem(DELETED_REPORTS_KEY, JSON.stringify(arr)).catch(() => {});
      return next;
    });
  }, []);

  const missionsQuery = useQuery({
    queryKey: ['fleet_missions', userId],
    queryFn: async () => {
      if (!userId) return [];

      try {
        const result = await trpcClient.world.getActiveMissions.query();
        if (result.success) {
          console.log('[Fleet] Missions loaded via tRPC:', result.missions.length, 'phases:', result.missions.map((m: Record<string, unknown>) => m.mission_phase));
          return result.missions as FleetMission[];
        }
        console.log('[Fleet] tRPC getActiveMissions failed:', result.error);
      } catch (e) {
        console.log('[Fleet] tRPC getActiveMissions error, falling back to direct query:', e);
      }

      const { data, error } = await supabase
        .from('fleet_missions')
        .select('*')
        .or(`sender_id.eq.${userId},target_player_id.eq.${userId}`)
        .in('mission_phase', ['en_route', 'arrived', 'returning'])
        .order('arrival_time', { ascending: true });

      if (error) {
        console.log('[Fleet] Error loading missions (fallback):', error.message);
        return [];
      }

      console.log('[Fleet] Missions loaded (fallback):', (data ?? []).length);
      return (data ?? []) as FleetMission[];
    },
    enabled: !!userId,
    refetchInterval: 10000,
    staleTime: 5000,
  });

  const activeMissions = useMemo(() => missionsQuery.data ?? [], [missionsQuery.data]);

  const activePlanetRef = useRef(gamActivePlanet);
  activePlanetRef.current = gamActivePlanet;

  const sendFleetMutation = useMutation({
    mutationFn: async (params: FleetDispatchParams) => {
      if (!userId) throw new Error('Not authenticated');
      const currentPlanet = activePlanetRef.current;
      const planetId = currentPlanet.id;
      if (!planetId) throw new Error('Planet ID not available');

      console.log('[FleetContext] Sending fleet', params.missionType, 'to', params.targetCoords, 'from planet', planetId);

      const senderCoords = currentPlanet.coordinates;
      const senderPlanet = currentPlanet.planetName;

      const result = await trpcClient.actions.sendFleet.mutate({
        planetId,
        ships: params.ships,
        resources: params.resources,
        missionType: params.missionType,
        targetCoords: params.targetCoords,
        targetPlayerId: params.targetPlayerId,
        targetUsername: params.targetUsername,
        targetPlanet: params.targetPlanet,
        senderUsername: state.username ?? '',
        senderPlanet,
        senderCoords,
        speedPercent: params.speedPercent ?? 100,
      });

      if (!result.success) {
        throw new Error(result.error || 'Fleet dispatch failed');
      }

      const flightTimeSec = result.flightTimeSec ?? 30;
      console.log('[FleetContext] Fleet sent successfully (server-side time), arrival in', flightTimeSec, 's');
      return { travelTime: flightTimeSec, arrivalTime: result.arrivalTime };
    },
    onSuccess: () => {
      console.log('[FleetContext] Fleet send success — forcing resync from server');
      void queryClient.invalidateQueries({ queryKey: ['fleet_missions'] });
      void queryClient.invalidateQueries({ queryKey: [['world', 'getBashingStatus']] });
      void forceResync();
    },
    onError: (error) => {
      console.log('[FleetContext] Fleet send error — forcing resync from server:', error.message);
      void queryClient.invalidateQueries({ queryKey: ['fleet_missions'] });
      void forceResync();
    },
  });

  const espionageReportsQuery = useInfiniteQuery({
    queryKey: ['espionage_reports', userId],
    enabled: !!userId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (!userId) return [];

      const from = pageParam * REPORTS_PAGE_SIZE;
      const to = from + REPORTS_PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('espionage_reports')
        .select('*')
        .eq('player_id', userId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.log('[FleetContext] Error loading espionage reports:', error.message);
        return [];
      }

      return (data ?? []) as EspionageReport[];
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < REPORTS_PAGE_SIZE) return undefined;
      return allPages.length;
    },
    staleTime: 15000,
    refetchInterval: 15000,
  });

  const transportReportsQuery = useInfiniteQuery({
    queryKey: ['transport_reports', userId],
    enabled: !!userId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (!userId) return [];

      const from = pageParam * REPORTS_PAGE_SIZE;
      const to = from + REPORTS_PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('transport_reports')
        .select('*')
        .eq('viewer_id', userId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.log('[FleetContext] Error loading transport reports:', error.message);
        return [];
      }

      console.log('[FleetContext] Transport reports loaded page:', pageParam, 'count:', (data ?? []).length);
      return (data ?? []) as TransportReport[];
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < REPORTS_PAGE_SIZE) return undefined;
      return allPages.length;
    },
    staleTime: 30000,
  });

  const combatReportsQuery = useInfiniteQuery({
    queryKey: ['combat_reports', userId],
    enabled: !!userId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (!userId) return [];

      const from = pageParam * REPORTS_PAGE_SIZE;
      const to = from + REPORTS_PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('combat_reports')
        .select('*')
        .or(`attacker_id.eq.${userId},defender_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.log('[FleetContext] Error loading combat reports:', error.message);
        return [];
      }

      const filtered = (data ?? []).filter((r: Record<string, unknown>) => {
        if (r.viewer_role === 'attacker' && r.attacker_id === userId) return true;
        if (r.viewer_role === 'defender' && r.defender_id === userId) return true;
        return false;
      });

      return filtered as CombatReport[];
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < REPORTS_PAGE_SIZE) return undefined;
      return allPages.length;
    },
    staleTime: 30000,
  });

  const activePlanet = useMemo(() => ({
    id: gamActivePlanet.id,
    coordinates: gamActivePlanet.coordinates,
    planetName: gamActivePlanet.planetName,
  }), [gamActivePlanet.id, gamActivePlanet.coordinates, gamActivePlanet.planetName]);

  const { mutateAsync: sendFleetAsync, isPending: isSending, error: sendFleetError } = sendFleetMutation;

  const sendFleet = useCallback((params: FleetDispatchParams) => {
    return sendFleetAsync(params);
  }, [sendFleetAsync]);

  const sonarLevel = state.research?.espionageTech ?? 0;

  const espionageReports = useMemo(
    () => (espionageReportsQuery.data?.pages.flat() ?? []).filter(r => !deletedIds.has(r.id)),
    [espionageReportsQuery.data, deletedIds]
  );

  const combatReports = useMemo(
    () => (combatReportsQuery.data?.pages.flat() ?? []).filter(r => !deletedIds.has(r.id)),
    [combatReportsQuery.data, deletedIds]
  );

  const transportReports = useMemo(
    () => (transportReportsQuery.data?.pages.flat() ?? []).filter(r => !deletedIds.has(r.id)),
    [transportReportsQuery.data, deletedIds]
  );

  const refreshMissions = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['fleet_missions'] });
  }, [queryClient]);

  const refreshReports = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['espionage_reports'] });
    void queryClient.invalidateQueries({ queryKey: ['combat_reports'] });
    void queryClient.invalidateQueries({ queryKey: ['transport_reports'] });
  }, [queryClient]);

const refreshFleetState = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['fleet_missions'] }),
      queryClient.invalidateQueries({ queryKey: [['world', 'getBashingStatus']] }),
    ]);
  }, [queryClient]);
  
  const deleteEspionageReportMutation = trpc.world.deleteEspionageReport.useMutation();
  const deleteAllEspionageReportsMutation = trpc.world.deleteAllEspionageReports.useMutation();
  const deleteCombatReportMutation = trpc.world.deleteCombatReport.useMutation();
  const deleteAllCombatReportsMutation = trpc.world.deleteAllCombatReports.useMutation();
  const deleteTransportReportMutation = trpc.world.deleteTransportReport.useMutation();
  const deleteAllTransportReportsMutation = trpc.world.deleteAllTransportReports.useMutation();

  const deleteEspionageReportRef = useRef(deleteEspionageReportMutation);
  deleteEspionageReportRef.current = deleteEspionageReportMutation;
  const deleteAllEspionageReportsRef = useRef(deleteAllEspionageReportsMutation);
  deleteAllEspionageReportsRef.current = deleteAllEspionageReportsMutation;
  const deleteCombatReportRef = useRef(deleteCombatReportMutation);
  deleteCombatReportRef.current = deleteCombatReportMutation;
  const deleteAllCombatReportsRef = useRef(deleteAllCombatReportsMutation);
  deleteAllCombatReportsRef.current = deleteAllCombatReportsMutation;
  const deleteTransportReportRef = useRef(deleteTransportReportMutation);
  deleteTransportReportRef.current = deleteTransportReportMutation;
  const deleteAllTransportReportsRef = useRef(deleteAllTransportReportsMutation);
  deleteAllTransportReportsRef.current = deleteAllTransportReportsMutation;

  const deleteEspionageReport = useCallback(async (reportId: string) => {
    if (!userId) return;
    console.log('[FleetContext] Deleting espionage report via tRPC:', reportId);
    markAsDeleted(reportId);
    try {
      const result = await deleteEspionageReportRef.current.mutateAsync({ reportId });
      if (!result.success) console.log('[FleetContext] tRPC delete espionage report failed:', result.error);
      else console.log('[FleetContext] Espionage report deleted from DB:', reportId);
    } catch (e) {
      console.log('[FleetContext] Error deleting espionage report:', e);
    }
  }, [markAsDeleted, userId]);

  const deleteCombatReport = useCallback(async (reportId: string) => {
    if (!userId) return;
    console.log('[FleetContext] Deleting combat report via tRPC:', reportId);
    markAsDeleted(reportId);
    try {
      const result = await deleteCombatReportRef.current.mutateAsync({ reportId });
      if (!result.success) console.log('[FleetContext] tRPC delete combat report failed:', result.error);
      else console.log('[FleetContext] Combat report deleted from DB:', reportId);
    } catch (e) {
      console.log('[FleetContext] Error deleting combat report:', e);
    }
  }, [markAsDeleted, userId]);

  const deleteTransportReport = useCallback(async (reportId: string) => {
    if (!userId) return;
    console.log('[FleetContext] Deleting transport report via tRPC:', reportId);
    markAsDeleted(reportId);
    try {
      const result = await deleteTransportReportRef.current.mutateAsync({ reportId });
      if (!result.success) console.log('[FleetContext] tRPC delete transport report failed:', result.error);
      else console.log('[FleetContext] Transport report deleted from DB:', reportId);
    } catch (e) {
      console.log('[FleetContext] Error deleting transport report:', e);
    }
  }, [markAsDeleted, userId]);

  const deleteAllEspionageReports = useCallback(async () => {
    if (!userId) return;
    console.log('[FleetContext] Deleting all espionage reports via tRPC');
    const ids = (espionageReportsQuery.data?.pages.flat() ?? []).map(r => r.id);
    markAsDeleted(...ids);
    try {
      await deleteAllEspionageReportsRef.current.mutateAsync();
      console.log('[FleetContext] All espionage reports deleted from DB');
    } catch (e) {
      console.log('[FleetContext] Error deleting all espionage reports:', e);
    }
  }, [userId, markAsDeleted, espionageReportsQuery.data]);

  const deleteAllCombatReports = useCallback(async () => {
    if (!userId) return;
    console.log('[FleetContext] Deleting all combat reports via tRPC');
    const ids = (combatReportsQuery.data?.pages.flat() ?? []).map(r => r.id);
    markAsDeleted(...ids);
    try {
      await deleteAllCombatReportsRef.current.mutateAsync();
      console.log('[FleetContext] All combat reports deleted from DB');
    } catch (e) {
      console.log('[FleetContext] Error deleting all combat reports:', e);
    }
  }, [userId, markAsDeleted, combatReportsQuery.data]);

  const deleteAllTransportReports = useCallback(async () => {
    if (!userId) return;
    console.log('[FleetContext] Deleting all transport reports via tRPC');
    const ids = (transportReportsQuery.data?.pages.flat() ?? []).map(r => r.id);
    markAsDeleted(...ids);
    try {
      await deleteAllTransportReportsRef.current.mutateAsync();
      console.log('[FleetContext] All transport reports deleted from DB');
    } catch (e) {
      console.log('[FleetContext] Error deleting all transport reports:', e);
    }
  }, [userId, markAsDeleted, transportReportsQuery.data]);

  const recallFleetMutation = useMutation({
    mutationFn: async (missionId: string) => {
      if (!userId) throw new Error('Not authenticated');
      console.log('[FleetContext] Recalling fleet:', missionId);
      const result = await trpcClient.actions.recallFleet.mutate({ missionId });
      if (!result.success) {
        throw new Error(result.error || 'Rappel échoué');
      }
      void queryClient.invalidateQueries({ queryKey: ['fleet_missions'] });
      console.log('[FleetContext] Fleet recalled, return in', result.returnDurationSec, 's');
      return result;
    },
  });

  const recallFleet = useCallback((missionId: string) => {
    return recallFleetMutation.mutateAsync(missionId);
  }, [recallFleetMutation]);

  const isRecalling = recallFleetMutation.isPending;
  const sendError = sendFleetError?.message ?? null;

  const fetchMoreEspionageReports = useCallback(async () => {
    if (espionageReportsQuery.hasNextPage && !espionageReportsQuery.isFetchingNextPage) {
      await espionageReportsQuery.fetchNextPage();
    }
  }, [espionageReportsQuery]);

  const fetchMoreCombatReports = useCallback(async () => {
    if (combatReportsQuery.hasNextPage && !combatReportsQuery.isFetchingNextPage) {
      await combatReportsQuery.fetchNextPage();
    }
  }, [combatReportsQuery]);

  const fetchMoreTransportReports = useCallback(async () => {
    if (transportReportsQuery.hasNextPage && !transportReportsQuery.isFetchingNextPage) {
      await transportReportsQuery.fetchNextPage();
    }
  }, [transportReportsQuery]);

  return useMemo(() => ({
    activeMissions,
    espionageReports,
    combatReports,
    transportReports,
    sendFleet,
    recallFleet,
    isSending,
    isRecalling,
    sendError,
    refreshMissions,
    refreshReports,
    refreshFleetState,
    deleteEspionageReport,
    deleteCombatReport,
    deleteTransportReport,
    deleteAllEspionageReports,
    deleteAllCombatReports,
    deleteAllTransportReports,
    fetchMoreEspionageReports,
    fetchMoreCombatReports,
    fetchMoreTransportReports,
    hasMoreEspionageReports: !!espionageReportsQuery.hasNextPage,
    hasMoreCombatReports: !!combatReportsQuery.hasNextPage,
    hasMoreTransportReports: !!transportReportsQuery.hasNextPage,
    isFetchingMoreEspionageReports: espionageReportsQuery.isFetchingNextPage,
    isFetchingMoreCombatReports: combatReportsQuery.isFetchingNextPage,
    isFetchingMoreTransportReports: transportReportsQuery.isFetchingNextPage,
    sonarLevel,
    userId,
  }), [
    activeMissions,
    espionageReports,
    combatReports,
    transportReports,
    sendFleet,
    recallFleet,
    isSending,
    isRecalling,
    sendError,
    refreshMissions,
    refreshReports,
    refreshFleetState,
    deleteEspionageReport,
    deleteCombatReport,
    deleteTransportReport,
    deleteAllEspionageReports,
    deleteAllCombatReports,
    deleteAllTransportReports,
    fetchMoreEspionageReports,
    fetchMoreCombatReports,
    fetchMoreTransportReports,
    espionageReportsQuery.hasNextPage,
    combatReportsQuery.hasNextPage,
    transportReportsQuery.hasNextPage,
    espionageReportsQuery.isFetchingNextPage,
    combatReportsQuery.isFetchingNextPage,
    transportReportsQuery.isFetchingNextPage,
    sonarLevel,
    userId,
  ]);
});
