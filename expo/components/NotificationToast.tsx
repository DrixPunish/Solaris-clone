import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Mail, Rocket, X, Hammer, AlertTriangle, Shield } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useGame } from '@/contexts/GameContext';
import { BUILDINGS, RESEARCH } from '@/constants/gameData';
import { UpgradeTimer } from '@/types/game';
import Colors from '@/constants/colors';
import { useAlliance } from '@/contexts/AllianceContext';

interface ToastItem {
  id: string;
  type: 'message' | 'fleet' | 'construction' | 'error' | 'alliance';
  title: string;
  body: string;
}

export default function NotificationToast() {
  const { user, isAuthenticated } = useAuth();
  const { state, actionError, clearActionError } = useGame();
  const { unreadMessageCount: allianceUnreadCount } = useAlliance();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const lastUnreadCountRef = useRef<number | null>(null);
  const lastIncomingFleetCountRef = useRef<number | null>(null);
  const lastAllianceUnreadRef = useRef<number | null>(null);
  const prevTimersRef = useRef<UpgradeTimer[]>([]);
  const isFirstTimerRender = useRef(true);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unreadQuery = useQuery({
    queryKey: ['notification-unread', user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { count, error } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .eq('read', false);
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!user?.id && isAuthenticated,
    refetchInterval: 8000,
  });

  const incomingFleetQuery = useQuery({
    queryKey: ['notification-fleet', user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { count, error } = await supabase
        .from('fleet_missions')
        .select('*', { count: 'exact', head: true })
        .eq('target_player_id', user.id)
        .in('status', ['en_route']);
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!user?.id && isAuthenticated,
    refetchInterval: 8000,
  });

  const dismissToast = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: -120, useNativeDriver: true, duration: 250 }),
      Animated.timing(opacityAnim, { toValue: 0, useNativeDriver: true, duration: 200 }),
    ]).start(() => {
      setToasts([]);
    });
  }, [slideAnim, opacityAnim]);

  const showToast = useCallback((toast: ToastItem) => {
    setToasts(prev => {
      if (prev.some(t => t.id === toast.id)) return prev;
      return [...prev, toast];
    });
    slideAnim.setValue(-120);
    opacityAnim.setValue(0);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, friction: 8, tension: 60 }),
      Animated.timing(opacityAnim, { toValue: 1, useNativeDriver: true, duration: 200 }),
    ]).start();

    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      dismissToast();
    }, 5000);
  }, [slideAnim, opacityAnim, dismissToast]);

  useEffect(() => {
    const count = unreadQuery.data ?? 0;
    if (lastUnreadCountRef.current === null) {
      lastUnreadCountRef.current = count;
      return;
    }
    if (count > lastUnreadCountRef.current) {
      const diff = count - lastUnreadCountRef.current;
      showToast({
        id: `msg-${Date.now()}`,
        type: 'message',
        title: 'Nouveau message',
        body: `Vous avez ${diff} nouveau${diff > 1 ? 'x' : ''} message${diff > 1 ? 's' : ''}`,
      });
    }
    lastUnreadCountRef.current = count;
  }, [unreadQuery.data, showToast]);

  useEffect(() => {
    const count = allianceUnreadCount;
    if (lastAllianceUnreadRef.current === null) {
      lastAllianceUnreadRef.current = count;
      return;
    }
    if (count > lastAllianceUnreadRef.current) {
      const diff = count - lastAllianceUnreadRef.current;
      showToast({
        id: `alliance-msg-${Date.now()}`,
        type: 'alliance',
        title: 'Message d\'alliance',
        body: `${diff} nouveau${diff > 1 ? 'x' : ''} message${diff > 1 ? 's' : ''} dans le chat alliance`,
      });
    }
    lastAllianceUnreadRef.current = count;
  }, [allianceUnreadCount, showToast]);

  useEffect(() => {
    const count = incomingFleetQuery.data ?? 0;
    if (lastIncomingFleetCountRef.current === null) {
      lastIncomingFleetCountRef.current = count;
      return;
    }
    if (count > lastIncomingFleetCountRef.current) {
      const diff = count - lastIncomingFleetCountRef.current;
      showToast({
        id: `fleet-${Date.now()}`,
        type: 'fleet',
        title: 'Flotte en approche',
        body: `${diff} flotte${diff > 1 ? 's' : ''} se dirige${diff > 1 ? 'nt' : ''} vers votre planète`,
      });
    }
    lastIncomingFleetCountRef.current = count;
  }, [incomingFleetQuery.data, showToast]);

  useEffect(() => {
    if (actionError) {
      showToast({
        id: `error-${Date.now()}`,
        type: 'error',
        title: 'Action échouée',
        body: actionError,
      });
      clearActionError();
    }
  }, [actionError, showToast, clearActionError]);

  useEffect(() => {
    if (isFirstTimerRender.current) {
      prevTimersRef.current = [...state.activeTimers];
      isFirstTimerRender.current = false;
      return;
    }

    const currentIds = new Set(state.activeTimers.map(t => `${t.type}_${t.id}`));
    const now = Date.now();

    for (const prevTimer of prevTimersRef.current) {
      const key = `${prevTimer.type}_${prevTimer.id}`;
      if (!currentIds.has(key) && prevTimer.endTime <= now + 2000) {
        const itemName = prevTimer.type === 'building'
          ? BUILDINGS.find(b => b.id === prevTimer.id)?.name
          : RESEARCH.find(r => r.id === prevTimer.id)?.name;

        if (itemName) {
          const label = prevTimer.type === 'building' ? 'Construction' : 'Recherche';
          showToast({
            id: `build-${prevTimer.id}-${Date.now()}`,
            type: 'construction',
            title: `${label} terminée`,
            body: `${itemName} niveau ${prevTimer.targetLevel}`,
          });
          console.log('[NotificationToast] Construction completed:', itemName, 'level', prevTimer.targetLevel);
        }
      }
    }

    prevTimersRef.current = [...state.activeTimers];
  }, [state.activeTimers, showToast]);

  const handlePress = useCallback(() => {
    dismissToast();
    const current = toasts[toasts.length - 1];
    if (!current) return;
    if (current.type === 'message') {
      router.push('/messages');
    } else if (current.type === 'fleet') {
      router.push('/fleet-overview');
    } else if (current.type === 'alliance') {
      router.push('/(tabs)/alliance');
    }
  }, [toasts, router, dismissToast]);

  if (toasts.length === 0) return null;

  const currentToast = toasts[toasts.length - 1];

  const getToastStyle = () => {
    switch (currentToast.type) {
      case 'message': return styles.toastMessage;
      case 'fleet': return styles.toastFleet;
      case 'construction': return styles.toastConstruction;
      case 'error': return styles.toastError;
      case 'alliance': return styles.toastAlliance;
      default: return styles.toastMessage;
    }
  };

  const getIconStyle = () => {
    switch (currentToast.type) {
      case 'message': return styles.iconMessage;
      case 'fleet': return styles.iconFleet;
      case 'construction': return styles.iconConstruction;
      case 'error': return styles.iconError;
      case 'alliance': return styles.iconAlliance;
      default: return styles.iconMessage;
    }
  };

  const getIcon = () => {
    switch (currentToast.type) {
      case 'message': return <Mail size={16} color={Colors.primary} />;
      case 'fleet': return <Rocket size={16} color={Colors.danger} />;
      case 'construction': return <Hammer size={16} color={Colors.success} />;
      case 'error': return <AlertTriangle size={16} color="#FF6B35" />;
      case 'alliance': return <Shield size={16} color="#4FC3F7" />;
      default: return <Mail size={16} color={Colors.primary} />;
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: insets.top + 4,
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={[styles.toast, getToastStyle()]}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <View style={[styles.iconWrap, getIconStyle()]}>
          {getIcon()}
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.toastTitle}>{currentToast.title}</Text>
          <Text style={styles.toastBody} numberOfLines={1}>{currentToast.body}</Text>
        </View>
        <TouchableOpacity onPress={dismissToast} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <X size={14} color={Colors.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 9999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toastMessage: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  toastFleet: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.danger + '30',
  },
  toastConstruction: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  toastError: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: '#FF6B35' + '30',
  },
  toastAlliance: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: '#4FC3F7' + '30',
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconMessage: {
    backgroundColor: Colors.primary + '15',
  },
  iconFleet: {
    backgroundColor: Colors.danger + '15',
  },
  iconConstruction: {
    backgroundColor: Colors.success + '15',
  },
  iconError: {
    backgroundColor: '#FF6B35' + '15',
  },
  iconAlliance: {
    backgroundColor: '#4FC3F7' + '15',
  },
  textWrap: {
    flex: 1,
  },
  toastTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  toastBody: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  closeBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
