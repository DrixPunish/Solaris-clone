import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/contexts/AuthContext';
import { useGame } from '@/contexts/GameContext';
import { supabase } from '@/utils/supabase';
import Colors from '@/constants/colors';
import { showGameAlert } from '@/components/GameAlert';

export default function ComposeMessageScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { state } = useGame();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    receiverId?: string;
    receiverUsername?: string;
    replySubject?: string;
  }>();

  const [receiverUsername, setReceiverUsername] = useState(params.receiverUsername ?? '');
  const [subject, setSubject] = useState(params.replySubject ?? '');
  const [body, setBody] = useState('');
  const [resolvedReceiverId, setResolvedReceiverId] = useState(params.receiverId ?? '');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const suggestionsQuery = useQuery({
    queryKey: ['player-search', searchQuery, user?.id],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 1) return [];
      console.log('[Compose] Searching players:', searchQuery);
      const { data, error } = await supabase
        .from('players')
        .select('user_id, username')
        .ilike('username', `%${searchQuery}%`)
        .neq('user_id', user?.id ?? '')
        .limit(8);
      if (error) {
        console.log('[Compose] Search error:', error.message);
        return [];
      }
      return (data ?? []) as { user_id: string; username: string }[];
    },
    enabled: searchQuery.length >= 1 && showSuggestions && !resolvedReceiverId,
  });

  const handleUsernameChange = useCallback((text: string) => {
    setReceiverUsername(text);
    setResolvedReceiverId('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length >= 1) {
      debounceRef.current = setTimeout(() => {
        setSearchQuery(text.trim());
        setShowSuggestions(true);
      }, 300);
    } else {
      setSearchQuery('');
      setShowSuggestions(false);
    }
  }, []);

  const handleSelectPlayer = useCallback((player: { user_id: string; username: string }) => {
    console.log('[Compose] Selected player:', player.username, player.user_id);
    setReceiverUsername(player.username);
    setResolvedReceiverId(player.user_id);
    setShowSuggestions(false);
    setSearchQuery('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const resolveUserMutation = useMutation({
    mutationFn: async (username: string) => {
      console.log('[Compose] Resolving username:', username);
      const { data, error } = await supabase
        .from('players')
        .select('user_id, username')
        .ilike('username', username.trim())
        .single();
      if (error || !data) {
        throw new Error('Joueur introuvable');
      }
      return data as { user_id: string; username: string };
    },
    onSuccess: (data) => {
      setResolvedReceiverId(data.user_id);
      console.log('[Compose] Resolved to user_id:', data.user_id);
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Non authentifié');

      let targetId = resolvedReceiverId;

      if (!targetId && receiverUsername.trim()) {
        const { data, error } = await supabase
          .from('players')
          .select('user_id')
          .ilike('username', receiverUsername.trim())
          .single();
        if (error || !data) throw new Error('Joueur introuvable');
        targetId = data.user_id;
      }

      if (!targetId) throw new Error('Destinataire requis');
      if (!body.trim()) throw new Error('Le message ne peut pas être vide');

      if (targetId === user.id) throw new Error('Vous ne pouvez pas vous envoyer un message');

      let receiverName = receiverUsername.trim();
      if (!receiverName) {
        const { data: rData } = await supabase
          .from('players')
          .select('username')
          .eq('user_id', targetId)
          .single();
        receiverName = rData?.username ?? 'Inconnu';
      }

      console.log('[Compose] Sending message to', targetId, 'username:', receiverName);
      const { error } = await supabase.from('messages').insert({
        sender_id: user.id,
        receiver_id: targetId,
        sender_username: state.username ?? 'Inconnu',
        receiver_username: receiverName,
        subject: subject.trim() || '(sans objet)',
        body: body.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      console.log('[Compose] Message sent successfully');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      router.back();
    },
    onError: (error: Error) => {
      console.log('[Compose] Send error:', error.message);
      showGameAlert('Erreur', error.message);
    },
  });

  const { mutate: send, isPending: isSending } = sendMutation;

  const handleSend = useCallback(() => {
    if (!body.trim()) {
      showGameAlert('Erreur', 'Écrivez un message avant d\'envoyer.');
      return;
    }
    if (!resolvedReceiverId && !receiverUsername.trim()) {
      showGameAlert('Erreur', 'Indiquez un destinataire.');
      return;
    }
    send();
  }, [body, resolvedReceiverId, receiverUsername, send]);

  const hasPrefilledReceiver = !!params.receiverId;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.6}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nouveau message</Text>
        <TouchableOpacity
          onPress={handleSend}
          style={[styles.sendBtn, isSending && styles.sendBtnDisabled]}
          activeOpacity={0.6}
          disabled={isSending}
        >
          {isSending ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Send size={18} color={Colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={0}
      >
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>À</Text>
            {hasPrefilledReceiver ? (
              <View style={styles.prefilledReceiver}>
                <User size={14} color={Colors.primary} />
                <Text style={styles.prefilledText}>{receiverUsername}</Text>
              </View>
            ) : (
              <View style={styles.receiverInputWrap}>
                <TextInput
                  style={styles.fieldInput}
                  value={receiverUsername}
                  onChangeText={handleUsernameChange}
                  onBlur={() => {
                    setTimeout(() => {
                      if (receiverUsername.trim() && !resolvedReceiverId) {
                        resolveUserMutation.mutate(receiverUsername);
                      }
                      setShowSuggestions(false);
                    }, 200);
                  }}
                  onFocus={() => {
                    if (receiverUsername.trim().length >= 1 && !resolvedReceiverId) {
                      setSearchQuery(receiverUsername.trim());
                      setShowSuggestions(true);
                    }
                  }}
                  placeholder="Pseudo du joueur"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {resolvedReceiverId ? (
                  <View style={styles.resolvedBadge}>
                    <Text style={styles.resolvedBadgeText}>✓</Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>

          {showSuggestions && !resolvedReceiverId && (suggestionsQuery.data ?? []).length > 0 && (
            <View style={styles.suggestionsContainer}>
              {(suggestionsQuery.data ?? []).map((player) => (
                <TouchableOpacity
                  key={player.user_id}
                  style={styles.suggestionRow}
                  onPress={() => handleSelectPlayer(player)}
                  activeOpacity={0.6}
                >
                  <View style={styles.suggestionAvatar}>
                    <User size={14} color={Colors.primary} />
                  </View>
                  <Text style={styles.suggestionText}>{player.username}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {suggestionsQuery.isFetching && showSuggestions && !resolvedReceiverId && (
            <View style={styles.suggestionsLoading}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.suggestionsLoadingText}>Recherche...</Text>
            </View>
          )}

          {resolveUserMutation.isError && !resolvedReceiverId && !showSuggestions && (
            <Text style={styles.errorText}>Joueur introuvable</Text>
          )}

          <View style={styles.divider} />

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Objet</Text>
            <TextInput
              style={styles.fieldInput}
              value={subject}
              onChangeText={setSubject}
              placeholder="Objet du message"
              placeholderTextColor={Colors.textMuted}
              maxLength={100}
            />
          </View>

          <View style={styles.divider} />

          <TextInput
            style={styles.bodyInput}
            value={body}
            onChangeText={setBody}
            placeholder="Écrivez votre message..."
            placeholderTextColor={Colors.textMuted}
            multiline
            textAlignVertical="top"
            maxLength={2000}
          />
        </ScrollView>
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
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primary + '15',
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  keyboardView: {
    flex: 1,
  },
  form: {
    paddingHorizontal: 16,
    paddingTop: 8,
    flexGrow: 1,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  fieldLabel: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600' as const,
    width: 42,
  },
  fieldInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    paddingVertical: 0,
  },
  receiverInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  resolvedBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.success + '20',
    borderWidth: 1,
    borderColor: Colors.success + '50',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  resolvedBadgeText: {
    color: Colors.success,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  suggestionsContainer: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    marginLeft: 54,
    marginBottom: 8,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  suggestionAvatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '500' as const,
  },
  suggestionsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 54,
    marginBottom: 6,
  },
  suggestionsLoadingText: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  prefilledReceiver: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary + '12',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  prefilledText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 11,
    marginLeft: 54,
    marginTop: -6,
    marginBottom: 4,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  bodyInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
    paddingTop: 14,
    minHeight: 200,
  },
});
