import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, ChevronRight, ArrowLeft, Send, MessageCircle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import Colors from '@/constants/colors';

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  sender_username: string;
  receiver_username: string;
  subject: string;
  body: string;
  read: boolean;
  created_at: string;
}

interface Conversation {
  partnerId: string;
  partnerUsername: string;
  lastMessage: Message;
  unreadCount: number;
}

export default function MessagesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  const allMessagesQuery = useQuery({
    queryKey: ['messages', 'all', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      console.log('[Messages] Fetching all messages');
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false });
      if (error) {
        console.log('[Messages] Error:', error.message);
        throw error;
      }
      return (data ?? []) as Message[];
    },
    enabled: !!user?.id,
    refetchInterval: 10000,
  });

  const conversations = useMemo(() => {
    const msgs = allMessagesQuery.data ?? [];
    const convMap = new Map<string, Conversation>();

    for (const msg of msgs) {
      const isIncoming = msg.receiver_id === user?.id;
      const partnerId = isIncoming ? msg.sender_id : msg.receiver_id;
      const partnerUsername = isIncoming ? msg.sender_username : msg.receiver_username;

      const existing = convMap.get(partnerId);
      if (!existing) {
        convMap.set(partnerId, {
          partnerId,
          partnerUsername,
          lastMessage: msg,
          unreadCount: isIncoming && !msg.read ? 1 : 0,
        });
      } else {
        if (isIncoming && !msg.read) existing.unreadCount++;
      }
    }

    return Array.from(convMap.values());
  }, [allMessagesQuery.data, user?.id]);

  const totalUnread = useMemo(() => conversations.reduce((s, c) => s + c.unreadCount, 0), [conversations]);

  const onRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['messages', 'all'] });
  }, [queryClient]);

  const handleOpenConversation = useCallback((conv: Conversation) => {
    router.push({
      pathname: '/message-detail',
      params: {
        partnerId: conv.partnerId,
        partnerUsername: conv.partnerUsername,
      },
    });
  }, [router]);

  const formatDate = useCallback((dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'maintenant';
    if (mins < 60) return `${mins}min`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}j`;
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }, []);

  const renderConversation = useCallback(({ item }: { item: Conversation }) => {
    const hasUnread = item.unreadCount > 0;
    const isLastFromMe = item.lastMessage.sender_id === user?.id;

    return (
      <TouchableOpacity
        style={[styles.convRow, hasUnread && styles.convRowUnread]}
        onPress={() => handleOpenConversation(item)}
        activeOpacity={0.6}
      >
        <View style={[styles.avatarWrap, hasUnread && styles.avatarWrapUnread]}>
          <Text style={[styles.avatarLetter, hasUnread && styles.avatarLetterUnread]}>
            {(item.partnerUsername || '?')[0].toUpperCase()}
          </Text>
        </View>
        <View style={styles.convContent}>
          <View style={styles.convTop}>
            <Text style={[styles.convName, hasUnread && styles.convNameUnread]} numberOfLines={1}>
              {item.partnerUsername || 'Inconnu'}
            </Text>
            <Text style={styles.convDate}>{formatDate(item.lastMessage.created_at)}</Text>
          </View>
          <Text style={[styles.convPreview, hasUnread && styles.convPreviewUnread]} numberOfLines={1}>
            {isLastFromMe ? 'Vous: ' : ''}{item.lastMessage.body}
          </Text>
        </View>
        {hasUnread ? (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
          </View>
        ) : (
          <ChevronRight size={16} color={Colors.textMuted} />
        )}
      </TouchableOpacity>
    );
  }, [user?.id, handleOpenConversation, formatDate]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.6}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
        <TouchableOpacity
          onPress={() => router.push('/compose-message')}
          style={styles.composeBtn}
          activeOpacity={0.6}
        >
          <Send size={18} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {totalUnread > 0 && (
        <View style={styles.unreadBar}>
          <Mail size={14} color={Colors.primary} />
          <Text style={styles.unreadBarText}>{totalUnread} message{totalUnread > 1 ? 's' : ''} non lu{totalUnread > 1 ? 's' : ''}</Text>
        </View>
      )}

      {allMessagesQuery.isLoading ? (
        <View style={styles.emptyWrap}>
          <ActivityIndicator color={Colors.primary} size="small" />
          <Text style={styles.emptyText}>Chargement...</Text>
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.emptyWrap}>
          <MessageCircle size={40} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Aucune conversation</Text>
          <Text style={styles.emptyText}>Envoyez un message pour démarrer une conversation</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.partnerId}
          renderItem={renderConversation}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700' as const,
  },
  composeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primary + '15',
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.primary + '08',
    borderBottomWidth: 1,
    borderBottomColor: Colors.primary + '15',
  },
  unreadBarText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
  },
  convRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  convRowUnread: {
    borderColor: Colors.primary + '30',
    backgroundColor: Colors.primary + '06',
  },
  avatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatarWrapUnread: {
    backgroundColor: Colors.primary + '15',
    borderColor: Colors.primary + '30',
  },
  avatarLetter: {
    color: Colors.textMuted,
    fontSize: 16,
    fontWeight: '700' as const,
  },
  avatarLetterUnread: {
    color: Colors.primary,
  },
  convContent: {
    flex: 1,
  },
  convTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  convName: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '500' as const,
    flex: 1,
    marginRight: 8,
  },
  convNameUnread: {
    color: Colors.text,
    fontWeight: '700' as const,
  },
  convDate: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '500' as const,
  },
  convPreview: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  convPreviewUnread: {
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  unreadBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: '#0A0A14',
    fontSize: 10,
    fontWeight: '700' as const,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: 60,
  },
  emptyTitle: {
    color: Colors.textSecondary,
    fontSize: 16,
    fontWeight: '600' as const,
    marginTop: 4,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: 'center' as const,
  },
});
