import React, { useCallback, useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/contexts/AuthContext';
import { useGame } from '@/contexts/GameContext';
import { supabase } from '@/utils/supabase';
import { showGameAlert } from '@/components/GameAlert';
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

export default function MessageDetailScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { state } = useGame();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList<Message>>(null);
  const [replyText, setReplyText] = useState('');

  const params = useLocalSearchParams<{
    partnerId: string;
    partnerUsername: string;
  }>();

  const partnerId = params.partnerId ?? '';
  const partnerUsername = params.partnerUsername ?? 'Inconnu';

  const threadQuery = useQuery({
    queryKey: ['messages', 'thread', user?.id, partnerId, partnerUsername],
    queryFn: async () => {
      if (!user?.id || !partnerId) return [];
      console.log('[MessageDetail] Fetching thread with', partnerUsername);
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`
        )
        .order('created_at', { ascending: true });
      if (error) {
        console.log('[MessageDetail] Thread error:', error.message);
        throw error;
      }
      return (data ?? []) as Message[];
    },
    enabled: !!user?.id && !!partnerId,
    refetchInterval: 5000,
  });

  const markReadMutation = useMutation({
    mutationFn: async (messageIds: string[]) => {
      if (messageIds.length === 0) return;
      const { error } = await supabase
        .from('messages')
        .update({ read: true })
        .in('id', messageIds);
      if (error) console.log('[MessageDetail] Mark read error:', error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
  });

  const { mutate: markRead } = markReadMutation;

  useEffect(() => {
    const msgs = threadQuery.data ?? [];
    const unreadIds = msgs
      .filter(m => m.receiver_id === user?.id && !m.read)
      .map(m => m.id);
    if (unreadIds.length > 0) {
      markRead(unreadIds);
    }
  }, [threadQuery.data, user?.id, markRead]);

  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      if (!user?.id || !partnerId) throw new Error('Non authentifié');
      if (!body.trim()) throw new Error('Message vide');

      const lastMsg = (threadQuery.data ?? []).slice(-1)[0];
      const subject = lastMsg?.subject
        ? (lastMsg.subject.startsWith('Re: ') ? lastMsg.subject : `Re: ${lastMsg.subject}`)
        : '(conversation)';

      console.log('[MessageDetail] Sending reply to', partnerId);
      const { error } = await supabase.from('messages').insert({
        sender_id: user.id,
        receiver_id: partnerId,
        sender_username: state.username ?? 'Inconnu',
        receiver_username: partnerUsername,
        subject,
        body: body.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      console.log('[MessageDetail] Reply sent');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setReplyText('');
      queryClient.invalidateQueries({ queryKey: ['messages', 'thread', user?.id, partnerId] });
      queryClient.invalidateQueries({ queryKey: ['messages', 'all'] });
    },
    onError: (error: Error) => {
      showGameAlert('Erreur', error.message);
    },
  });

  const { mutate: sendMessage, isPending: isSending } = sendMutation;

  const handleSend = useCallback(() => {
    if (!replyText.trim()) return;
    sendMessage(replyText);
  }, [replyText, sendMessage]);

  useEffect(() => {
    if ((threadQuery.data ?? []).length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);
    }
  }, [threadQuery.data]);

  const formatTime = useCallback((dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }, []);

  const formatDateSeparator = useCallback((dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const days = Math.floor(diff / 86400000);

      if (days === 0) return "Aujourd'hui";
      if (days === 1) return 'Hier';
      return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    } catch {
      return '';
    }
  }, []);

  const shouldShowDateSeparator = useCallback((messages: Message[], index: number): boolean => {
    if (index === 0) return true;
    const prevDate = new Date(messages[index - 1].created_at).toDateString();
    const currDate = new Date(messages[index].created_at).toDateString();
    return prevDate !== currDate;
  }, []);

  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
    const isMe = item.sender_id === user?.id;
    const messages = threadQuery.data ?? [];
    const showDate = shouldShowDateSeparator(messages, index);

    return (
      <View>
        {showDate && (
          <View style={styles.dateSeparator}>
            <View style={styles.dateLine} />
            <Text style={styles.dateText}>{formatDateSeparator(item.created_at)}</Text>
            <View style={styles.dateLine} />
          </View>
        )}
        <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowThem]}>
          {!isMe && (
            <View style={styles.bubbleAvatar}>
              <Text style={styles.bubbleAvatarText}>
                {(partnerUsername || '?')[0].toUpperCase()}
              </Text>
            </View>
          )}
          <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
            <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
              {item.body}
            </Text>
            <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : styles.bubbleTimeThem]}>
              {formatTime(item.created_at)}
            </Text>
          </View>
        </View>
      </View>
    );
  }, [user?.id, threadQuery.data, partnerUsername, shouldShowDateSeparator, formatDateSeparator, formatTime]);

  const messages = threadQuery.data ?? [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.6}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>
              {(partnerUsername || '?')[0].toUpperCase()}
            </Text>
          </View>
          <Text style={styles.headerTitle} numberOfLines={1}>{partnerUsername}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={0}
      >
        {threadQuery.isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Colors.primary} size="small" />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyWrap}>
            <User size={32} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Démarrez la conversation avec {partnerUsername}</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.chatList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => {
              flatListRef.current?.scrollToEnd({ animated: false });
            }}
          />
        )}

        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <TextInput
            style={styles.input}
            value={replyText}
            onChangeText={setReplyText}
            placeholder="Écrire un message..."
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            onPress={handleSend}
            style={[styles.sendBtn, !replyText.trim() && styles.sendBtnDisabled]}
            activeOpacity={0.6}
            disabled={isSending || !replyText.trim()}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Send size={16} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'center',
  },
  headerAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700' as const,
    maxWidth: 180,
  },
  keyboardView: {
    flex: 1,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: 60,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: 'center' as const,
    paddingHorizontal: 40,
  },
  chatList: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    gap: 10,
  },
  dateLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dateText: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  bubbleRow: {
    flexDirection: 'row',
    marginBottom: 6,
    alignItems: 'flex-end',
    gap: 6,
  },
  bubbleRowMe: {
    justifyContent: 'flex-end',
  },
  bubbleRowThem: {
    justifyContent: 'flex-start',
  },
  bubbleAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleAvatarText: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '700' as const,
  },
  bubble: {
    maxWidth: '75%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  bubbleMe: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextMe: {
    color: '#0A0A14',
  },
  bubbleTextThem: {
    color: Colors.text,
  },
  bubbleTime: {
    fontSize: 9,
    marginTop: 4,
    alignSelf: 'flex-end' as const,
  },
  bubbleTimeMe: {
    color: 'rgba(255,255,255,0.6)',
  },
  bubbleTimeThem: {
    color: Colors.textMuted,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    color: Colors.text,
    fontSize: 14,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendBtnDisabled: {
    backgroundColor: Colors.primaryDim,
    opacity: 0.5,
  },
});
