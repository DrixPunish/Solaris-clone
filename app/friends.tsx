import React, { useState, useCallback } from 'react';
import ClickableCoords from '@/components/ClickableCoords';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, UserPlus, UserMinus, Search, Send, Users } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import Colors from '@/constants/colors';
import { showGameAlert } from '@/components/GameAlert';

interface Friend {
  id: string;
  friend_id: string;
  friend_username: string;
  friend_coordinates: [number, number, number] | null;
  last_seen: string | null;
  created_at: string;
}

interface PlayerSuggestion {
  user_id: string;
  username: string;
}

function getOnlineStatus(lastSeen: string | null): { label: string; color: string } {
  if (!lastSeen) return { label: 'Inconnu', color: Colors.textMuted };
  const diff = Date.now() - new Date(lastSeen).getTime();
  const mins = diff / 60000;
  if (mins < 5) return { label: 'En ligne', color: Colors.success };
  if (mins < 30) return { label: `il y a ${Math.floor(mins)}min`, color: Colors.warning };
  if (mins < 1440) return { label: `il y a ${Math.floor(mins / 60)}h`, color: Colors.textMuted };
  return { label: `il y a ${Math.floor(mins / 1440)}j`, color: Colors.textMuted };
}

export default function FriendsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [searchText, setSearchText] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const friendsQuery = useQuery({
    queryKey: ['friends', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      console.log('[Friends] Fetching friends list');

      const { data: friendRows, error } = await supabase
        .from('friends')
        .select('id, friend_id, created_at')
        .eq('user_id', user.id);

      if (error) {
        console.log('[Friends] Error fetching friends:', error.message);
        throw error;
      }

      if (!friendRows || friendRows.length === 0) return [];

      const friendIds = friendRows.map(f => f.friend_id);
      const { data: players, error: pError } = await supabase
        .from('players')
        .select('user_id, username, coordinates, last_seen')
        .in('user_id', friendIds);

      if (pError) {
        console.log('[Friends] Error fetching player data:', pError.message);
        throw pError;
      }

      const playerMap = new Map(
        (players ?? []).map(p => [p.user_id, p])
      );

      const friends: Friend[] = friendRows.map(fr => {
        const player = playerMap.get(fr.friend_id);
        return {
          id: fr.id,
          friend_id: fr.friend_id,
          friend_username: player?.username ?? 'Inconnu',
          friend_coordinates: player?.coordinates ?? null,
          last_seen: player?.last_seen ?? null,
          created_at: fr.created_at,
        };
      });

      friends.sort((a, b) => {
        const aTime = a.last_seen ? new Date(a.last_seen).getTime() : 0;
        const bTime = b.last_seen ? new Date(b.last_seen).getTime() : 0;
        return bTime - aTime;
      });

      return friends;
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  const searchPlayersQuery = useQuery({
    queryKey: ['friend-search', searchQuery, user?.id],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 1) return [];
      const { data, error } = await supabase
        .from('players')
        .select('user_id, username')
        .ilike('username', `%${searchQuery}%`)
        .neq('user_id', user?.id ?? '')
        .limit(10);
      if (error) return [];
      return (data ?? []) as PlayerSuggestion[];
    },
    enabled: searchQuery.length >= 1 && showSearch,
  });

  const addFriendMutation = useMutation({
    mutationFn: async (friendId: string) => {
      if (!user?.id) throw new Error('Non authentifié');
      console.log('[Friends] Adding friend:', friendId);
      const { error } = await supabase.from('friends').insert({
        user_id: user.id,
        friend_id: friendId,
      });
      if (error) {
        if (error.code === '23505') throw new Error('Déjà dans votre liste d\'amis');
        throw error;
      }
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      setShowSearch(false);
      setSearchText('');
      setSearchQuery('');
    },
    onError: (error: Error) => {
      showGameAlert('Erreur', error.message);
    },
  });

  const removeFriendMutation = useMutation({
    mutationFn: async (friendRowId: string) => {
      console.log('[Friends] Removing friend row:', friendRowId);
      const { error } = await supabase
        .from('friends')
        .delete()
        .eq('id', friendRowId);
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    },
    onError: (error: Error) => {
      showGameAlert('Erreur', error.message);
    },
  });

  const handleSearchChange = useCallback((text: string) => {
    setSearchText(text);
    if (text.trim().length >= 1) {
      setSearchQuery(text.trim());
    } else {
      setSearchQuery('');
    }
  }, []);

  const { mutate: removeFriend } = removeFriendMutation;

  const handleRemoveFriend = useCallback((friend: Friend) => {
    showGameAlert(
      'Retirer',
      `Retirer ${friend.friend_username} de votre liste d'amis ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: () => removeFriend(friend.id),
        },
      ],
      'confirm',
    );
  }, [removeFriend]);

  const handleSendMessage = useCallback((friend: Friend) => {
    router.push({
      pathname: '/compose-message',
      params: {
        receiverId: friend.friend_id,
        receiverUsername: friend.friend_username,
      },
    });
  }, [router]);

  const existingFriendIds = new Set(
    (friendsQuery.data ?? []).map(f => f.friend_id)
  );

  const onRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['friends'] });
  }, [queryClient]);

  const renderFriend = useCallback(({ item }: { item: Friend }) => {
    const status = getOnlineStatus(item.last_seen);
    const coords = item.friend_coordinates;

    return (
      <View style={styles.friendRow}>
        <View style={styles.friendAvatarWrap}>
          <Text style={styles.friendAvatarText}>
            {item.friend_username.charAt(0).toUpperCase()}
          </Text>
          <View style={[styles.statusDot, { backgroundColor: status.color }]} />
        </View>

        <View style={styles.friendInfo}>
          <Text style={styles.friendName} numberOfLines={1}>
            {item.friend_username}
          </Text>
          <View style={styles.friendMeta}>
            <Text style={[styles.statusText, { color: status.color }]}>
              {status.label}
            </Text>
            {coords && (
              <ClickableCoords coords={coords} style={styles.coordsText} />
            )}
          </View>
        </View>

        <View style={styles.friendActions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleSendMessage(item)}
            activeOpacity={0.6}
          >
            <Send size={15} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDanger]}
            onPress={() => handleRemoveFriend(item)}
            activeOpacity={0.6}
          >
            <UserMinus size={15} color={Colors.danger} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [handleSendMessage, handleRemoveFriend]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.6}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Amis</Text>
        <TouchableOpacity
          onPress={() => setShowSearch(!showSearch)}
          style={[styles.addBtn, showSearch && styles.addBtnActive]}
          activeOpacity={0.6}
        >
          <UserPlus size={18} color={showSearch ? Colors.background : Colors.primary} />
        </TouchableOpacity>
      </View>

      {showSearch && (
        <View style={styles.searchSection}>
          <View style={styles.searchInputWrap}>
            <Search size={16} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={searchText}
              onChangeText={handleSearchChange}
              placeholder="Rechercher un joueur..."
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
          </View>

          {searchPlayersQuery.isFetching && (
            <View style={styles.searchLoading}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.searchLoadingText}>Recherche...</Text>
            </View>
          )}

          {(searchPlayersQuery.data ?? []).length > 0 && (
            <View style={styles.suggestionsWrap}>
              {(searchPlayersQuery.data ?? []).map(player => {
                const alreadyFriend = existingFriendIds.has(player.user_id);
                return (
                  <View key={player.user_id} style={styles.suggestionRow}>
                    <View style={styles.suggestionAvatar}>
                      <Text style={styles.suggestionAvatarText}>
                        {player.username.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.suggestionName} numberOfLines={1}>{player.username}</Text>
                    {alreadyFriend ? (
                      <View style={styles.alreadyBadge}>
                        <Text style={styles.alreadyBadgeText}>Ami</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.addFriendBtn}
                        onPress={() => addFriendMutation.mutate(player.user_id)}
                        disabled={addFriendMutation.isPending}
                        activeOpacity={0.6}
                      >
                        {addFriendMutation.isPending ? (
                          <ActivityIndicator size="small" color={Colors.primary} />
                        ) : (
                          <UserPlus size={16} color={Colors.primary} />
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {searchQuery.length >= 1 && !searchPlayersQuery.isFetching && (searchPlayersQuery.data ?? []).length === 0 && (
            <Text style={styles.noResultText}>Aucun joueur trouvé</Text>
          )}
        </View>
      )}

      {friendsQuery.isLoading ? (
        <View style={styles.emptyWrap}>
          <ActivityIndicator color={Colors.primary} size="small" />
          <Text style={styles.emptyText}>Chargement...</Text>
        </View>
      ) : (friendsQuery.data ?? []).length === 0 ? (
        <View style={styles.emptyWrap}>
          <Users size={44} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Aucun ami</Text>
          <Text style={styles.emptyText}>
            Appuyez sur + pour ajouter des amis
          </Text>
        </View>
      ) : (
        <FlatList
          data={friendsQuery.data ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderFriend}
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
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primary + '15',
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    paddingVertical: 10,
  },
  searchLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  searchLoadingText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  suggestionsWrap: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 8,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionAvatarText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  suggestionName: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
    fontWeight: '500' as const,
  },
  addFriendBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.primary + '15',
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alreadyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.success + '15',
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  alreadyBadgeText: {
    color: Colors.success,
    fontSize: 10,
    fontWeight: '600' as const,
  },
  noResultText: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: 'center' as const,
    paddingVertical: 12,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  friendAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendAvatarText: {
    color: Colors.primary,
    fontSize: 18,
    fontWeight: '700' as const,
  },
  statusDot: {
    position: 'absolute' as const,
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.card,
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 2,
  },
  friendMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500' as const,
  },
  coordsText: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '500' as const,
  },
  friendActions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: Colors.primary + '12',
    borderWidth: 1,
    borderColor: Colors.primary + '25',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnDanger: {
    backgroundColor: Colors.danger + '10',
    borderColor: Colors.danger + '25',
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
