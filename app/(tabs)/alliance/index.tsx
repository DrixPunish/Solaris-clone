import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  FlatList, KeyboardAvoidingView, Platform, Modal, Pressable, ActivityIndicator, RefreshControl,
} from 'react-native';
import {
  Shield, Crown, Star, Users, Send, UserPlus, LogOut, Trash2, X,
  MessageCircle, Settings, Plus, Check, AlertTriangle, User, Globe,
} from 'lucide-react-native';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';
import * as Haptics from 'expo-haptics';
import { useAlliance } from '@/contexts/AllianceContext';
import { useGame } from '@/contexts/GameContext';
import { AllianceMember, AllianceMessage, AllianceInvitation } from '@/types/alliance';
import { showGameAlert } from '@/components/GameAlert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';

type SubTab = 'members' | 'chat' | 'settings';

function getRoleBadge(role: string) {
  switch (role) {
    case 'leader':
      return { icon: Crown, color: '#FFD700', label: 'Fondateur' };
    case 'officer':
      return { icon: Star, color: Colors.xenogas, label: 'Officier' };
    case 'diplomat':
      return { icon: Globe, color: '#4FC3F7', label: 'Diplomate' };
    default:
      return { icon: Users, color: Colors.textMuted, label: 'Membre' };
  }
}

function formatChatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / (1000 * 60 * 60);
  if (diffH < 1) {
    const mins = Math.floor(diffMs / (1000 * 60));
    return mins <= 0 ? "à l'instant" : `il y a ${mins}m`;
  }
  if (diffH < 24) return `il y a ${Math.floor(diffH)}h`;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

export default function AllianceScreen() {
  const alliance = useAlliance();
  const insets = useSafeAreaInsets();

  if (alliance.isLoading) {
    return (
      <View style={styles.centered}>
        <View style={[styles.notchSpacer, { height: insets.top }]} />
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  if (!alliance.myAlliance) {
    return <NoAllianceView />;
  }

  return <AllianceView />;
}

function NoAllianceView() {
  const alliance = useAlliance();
  const insets = useSafeAreaInsets();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createTag, setCreateTag] = useState('');
  const [createDesc, setCreateDesc] = useState('');

  const handleCreate = useCallback(async () => {
    const name = createName.trim();
    const tag = createTag.trim();
    if (name.length < 3 || tag.length < 2) {
      showGameAlert('Erreur', 'Le nom doit faire au moins 3 caractères et le tag 2.');
      return;
    }
    try {
      await alliance.createAlliance({ name, tag, description: createDesc.trim() });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCreateModal(false);
      setCreateName('');
      setCreateTag('');
      setCreateDesc('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      showGameAlert('Erreur', msg);
    }
  }, [createName, createTag, createDesc, alliance]);

  const handleAcceptInvite = useCallback(async (inv: AllianceInvitation) => {
    try {
      await alliance.acceptInvitation(inv);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      showGameAlert('Erreur', msg);
    }
  }, [alliance]);

  const handleRejectInvite = useCallback(async (invId: string) => {
    try {
      await alliance.rejectInvitation(invId);
    } catch (err: unknown) {
      console.log('[Alliance] Reject error', err);
    }
  }, [alliance]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.noAllianceContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.notchSpacer, { height: insets.top }]} />
      <View style={styles.heroSection}>
        <View style={styles.heroIconWrap}>
          <Shield size={48} color={Colors.xenogas} />
        </View>
        <Text style={styles.heroTitle}>Alliance</Text>
        <Text style={styles.heroSubtitle}>
          Rejoignez une alliance pour combattre ensemble, partager des ressources et dominer la galaxie.
        </Text>
      </View>

      {alliance.pendingInvitations.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invitations en attente</Text>
          {alliance.pendingInvitations.map((inv) => (
            <View key={inv.id} style={styles.invitationCard}>
              <View style={styles.invitationInfo}>
                <Text style={styles.invitationName}>[{inv.alliance_tag}] {inv.alliance_name}</Text>
                <Text style={styles.invitationFrom}>Invité par {inv.sender_username}</Text>
              </View>
              <View style={styles.invitationActions}>
                <TouchableOpacity
                  style={styles.acceptBtn}
                  onPress={() => handleAcceptInvite(inv)}
                  activeOpacity={0.7}
                >
                  <Check size={16} color="#0A0A14" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rejectBtn}
                  onPress={() => handleRejectInvite(inv.id)}
                  activeOpacity={0.7}
                >
                  <X size={16} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={styles.createCard}
        onPress={() => setShowCreateModal(true)}
        activeOpacity={0.7}
      >
        <View style={styles.createIconWrap}>
          <Plus size={24} color={Colors.primary} />
        </View>
        <View style={styles.createTextWrap}>
          <Text style={styles.createTitle}>Créer une Alliance</Text>
          <Text style={styles.createSubtitle}>Fondez votre propre alliance et recrutez des joueurs</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.infoCard}>
        <AlertTriangle size={16} color={Colors.textMuted} />
        <Text style={styles.infoText}>
          Pour rejoindre une alliance existante, demandez à un chef ou officier de vous envoyer une invitation.
        </Text>
      </View>

      <Modal visible={showCreateModal} transparent animationType="fade" onRequestClose={() => setShowCreateModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <Pressable style={styles.modalOverlay} onPress={() => setShowCreateModal(false)}>
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Créer une Alliance</Text>
                <Pressable onPress={() => setShowCreateModal(false)} hitSlop={8}>
                  <X size={20} color={Colors.textMuted} />
                </Pressable>
              </View>

              <Text style={styles.inputLabel}>Nom de l{"'"}alliance</Text>
              <TextInput
                style={styles.modalInput}
                value={createName}
                onChangeText={setCreateName}
                maxLength={30}
                placeholder="ex: Les Conquérants"
                placeholderTextColor={Colors.textMuted}
                selectionColor={Colors.primary}
              />
              <Text style={styles.charCount}>{createName.length}/30</Text>

              <Text style={styles.inputLabel}>Tag (2-5 caractères)</Text>
              <TextInput
                style={styles.modalInput}
                value={createTag}
                onChangeText={(t) => setCreateTag(t.toUpperCase())}
                maxLength={5}
                autoCapitalize="characters"
                placeholder="ex: CONQ"
                placeholderTextColor={Colors.textMuted}
                selectionColor={Colors.primary}
              />

              <Text style={styles.inputLabel}>Description (optionnel)</Text>
              <TextInput
                style={[styles.modalInput, styles.modalTextArea]}
                value={createDesc}
                onChangeText={setCreateDesc}
                maxLength={200}
                multiline
                numberOfLines={3}
                placeholder="Décrivez votre alliance..."
                placeholderTextColor={Colors.textMuted}
                selectionColor={Colors.primary}
              />

              <TouchableOpacity
                style={[styles.confirmBtn, (alliance.isCreating || createName.trim().length < 3 || createTag.trim().length < 2) && styles.confirmBtnDisabled]}
                onPress={handleCreate}
                disabled={alliance.isCreating || createName.trim().length < 3 || createTag.trim().length < 2}
                activeOpacity={0.7}
              >
                {alliance.isCreating ? (
                  <ActivityIndicator size="small" color="#0A0A14" />
                ) : (
                  <>
                    <Shield size={16} color="#0A0A14" />
                    <Text style={styles.confirmBtnText}>Créer l{"'"}Alliance</Text>
                  </>
                )}
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function AllianceView() {
  const alliance = useAlliance();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<SubTab>('members');

  return (
    <View style={styles.container}>
      <View style={[styles.notchSpacer, { height: insets.top }]} />
      <View style={styles.allianceHeader}>
        <View style={styles.headerTagWrap}>
          <Text style={styles.headerTag}>[{alliance.myAlliance?.tag}]</Text>
        </View>
        <Text style={styles.headerName}>{alliance.myAlliance?.name}</Text>
        <View style={styles.headerStats}>
          <Users size={14} color={Colors.textMuted} />
          <Text style={styles.headerStatText}>{alliance.members.length} membre{alliance.members.length > 1 ? 's' : ''}</Text>
          <View style={styles.headerDot} />
          <Text style={styles.headerRoleText}>{getRoleBadge(alliance.myRole ?? 'member').label}</Text>
        </View>
        {alliance.myAlliance?.description ? (
          <Text style={styles.headerDesc} numberOfLines={2}>{alliance.myAlliance.description}</Text>
        ) : null}
      </View>

      <View style={styles.subTabRow}>
        {(['members', 'chat', 'settings'] as SubTab[]).map((tab) => {
          const isActive = activeTab === tab;
          const labels: Record<SubTab, { label: string; Icon: React.ComponentType<{ size: number; color: string }> }> = {
            members: { label: 'Membres', Icon: Users },
            chat: { label: 'Messagerie', Icon: MessageCircle },
            settings: { label: 'Gestion', Icon: Settings },
          };
          const { label, Icon } = labels[tab];
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.subTab, isActive && styles.subTabActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Icon size={14} color={isActive ? Colors.xenogas : Colors.textMuted} />
              <Text style={[styles.subTabText, isActive && styles.subTabTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeTab === 'members' && <MembersTab />}
      {activeTab === 'chat' && <ChatTab />}
      {activeTab === 'settings' && <SettingsTab />}
    </View>
  );
}

const InviteModalContent = React.memo(function InviteModalContent({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const alliance = useAlliance();
  const [username, setUsername] = useState('');
  const [suggestions, setSuggestions] = useState<{ user_id: string; username: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<{ user_id: string; username: string } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 350);
    return () => clearTimeout(timer);
  }, []);

  const searchPlayers = useCallback(async (query: string) => {
    if (!query || query.length < 1) {
      setSuggestions([]);
      return;
    }
    setIsSearching(true);
    try {
      console.log('[Alliance] Searching players:', query);
      const { data, error } = await supabase
        .from('players')
        .select('user_id, username')
        .ilike('username', `%${query}%`)
        .neq('user_id', user?.id ?? '')
        .limit(8);
      if (error) {
        console.log('[Alliance] Search error:', error.message);
        setSuggestions([]);
      } else {
        setSuggestions((data ?? []) as { user_id: string; username: string }[]);
      }
    } catch (err) {
      console.log('[Alliance] Search exception:', err);
      setSuggestions([]);
    } finally {
      setIsSearching(false);
    }
  }, [user?.id]);

  const handleUsernameChange = useCallback((text: string) => {
    setUsername(text);
    setSelectedPlayer(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length >= 1) {
      debounceRef.current = setTimeout(() => {
        void searchPlayers(text.trim());
      }, 400);
    } else {
      setSuggestions([]);
    }
  }, [searchPlayers]);

  const handleSelectPlayer = useCallback((player: { user_id: string; username: string }) => {
    console.log('[Alliance] Selected player:', player.username);
    setUsername(player.username);
    setSelectedPlayer(player);
    setSuggestions([]);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleInvite = useCallback(async () => {
    const target = username.trim();
    if (!target) return;
    setIsSending(true);
    try {
      await alliance.invitePlayer(target);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
      showGameAlert('Invitation envoyée', `${target} a reçu une invitation.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      showGameAlert('Erreur', msg);
    } finally {
      setIsSending(false);
    }
  }, [username, alliance, onClose]);

  return (
    <View>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>Inviter un joueur</Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <X size={20} color={Colors.textMuted} />
        </Pressable>
      </View>

      <Text style={styles.inputLabel}>Pseudo du joueur</Text>
      <View style={styles.inlineInviteInputRow}>
        <TextInput
          ref={inputRef}
          style={styles.inviteModalInput}
          value={username}
          onChangeText={handleUsernameChange}
          placeholder="Rechercher un joueur..."
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          selectionColor={Colors.primary}
          returnKeyType="done"
        />
        {selectedPlayer && (
          <View style={styles.inlineResolvedBadge}>
            <Check size={12} color={Colors.success} />
          </View>
        )}
      </View>

      {isSearching && (
        <View style={styles.inlineSuggestionsLoading}>
          <ActivityIndicator size="small" color={Colors.xenogas} />
          <Text style={styles.inlineSuggestionsLoadingText}>Recherche...</Text>
        </View>
      )}

      {!selectedPlayer && suggestions.length > 0 && (
        <ScrollView style={styles.inviteSuggestionsScroll} keyboardShouldPersistTaps="handled">
          {suggestions.map((player) => (
            <TouchableOpacity
              key={player.user_id}
              style={styles.inlineSuggestionRow}
              onPress={() => handleSelectPlayer(player)}
              activeOpacity={0.6}
            >
              <View style={styles.inlineSuggestionAvatar}>
                <User size={14} color={Colors.xenogas} />
              </View>
              <Text style={styles.inlineSuggestionText}>{player.username}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <TouchableOpacity
        style={[
          styles.confirmBtn,
          (!username.trim() || isSending) && styles.confirmBtnDisabled,
        ]}
        onPress={handleInvite}
        disabled={!username.trim() || isSending}
        activeOpacity={0.7}
      >
        {isSending ? (
          <ActivityIndicator size="small" color="#0A0A14" />
        ) : (
          <>
            <UserPlus size={16} color={username.trim() ? '#0A0A14' : Colors.textMuted} />
            <Text style={[
              styles.confirmBtnText,
              !username.trim() && { color: Colors.textMuted },
            ]}>Inviter</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
});

function MembersTab() {
  const alliance = useAlliance();
  const { userId } = useGame();
  const [showInviteModal, setShowInviteModal] = useState(false);

  const leaders = alliance.members.filter(m => m.role === 'leader');
  const officers = alliance.members.filter(m => m.role === 'officer');
  const diplomats = alliance.members.filter(m => m.role === 'diplomat');
  const members = alliance.members.filter(m => m.role === 'member');

  const openInviteModal = useCallback(() => {
    setShowInviteModal(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const closeInviteModal = useCallback(() => {
    setShowInviteModal(false);
  }, []);

  const handleChangeRole = useCallback((member: AllianceMember, newRole: 'officer' | 'diplomat' | 'member') => {
    const roleLabels: Record<string, string> = { officer: 'Officier', diplomat: 'Diplomate', member: 'Membre' };
    const label = `Changer le rôle en ${roleLabels[newRole]}`;
    showGameAlert('Confirmer', `${label} : ${member.username} ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Confirmer', onPress: async () => {
          try {
            await alliance.updateMemberRole({ memberId: member.id, newRole });
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Erreur';
            showGameAlert('Erreur', msg);
          }
        },
      },
    ], 'confirm');
  }, [alliance]);

  const handleKick = useCallback((member: AllianceMember) => {
    showGameAlert('Exclure', `Exclure ${member.username} de l'alliance ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Exclure', style: 'destructive', onPress: async () => {
          try {
            await alliance.kickMember(member.id);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Erreur';
            showGameAlert('Erreur', msg);
          }
        },
      },
    ], 'confirm');
  }, [alliance]);

  const [roleMenuMember, setRoleMenuMember] = useState<AllianceMember | null>(null);

  const renderMember = useCallback((member: AllianceMember) => {
    const badge = getRoleBadge(member.role);
    const BadgeIcon = badge.icon;
    const isMe = member.user_id === userId;
    const canAct = alliance.myRole === 'leader' && !isMe && member.role !== 'leader';

    return (
      <View key={member.id} style={styles.memberRow}>
        <View style={[styles.memberBadge, { backgroundColor: badge.color + '15', borderWidth: 1, borderColor: badge.color + '30' }]}>
          <BadgeIcon size={16} color={badge.color} />
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>
            {member.username}{isMe ? ' (vous)' : ''}
          </Text>
          <View style={[styles.roleBanner, { backgroundColor: badge.color + '12', borderColor: badge.color + '25' }]}>
            <BadgeIcon size={10} color={badge.color} />
            <Text style={[styles.roleBannerText, { color: badge.color }]}>{badge.label}</Text>
          </View>
        </View>
        {canAct && (
          <View style={styles.memberActions}>
            <TouchableOpacity onPress={() => setRoleMenuMember(member)} style={styles.memberActionBtn} activeOpacity={0.6}>
              <Settings size={14} color={Colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleKick(member)} style={styles.memberActionBtn} activeOpacity={0.6}>
              <Trash2 size={14} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }, [userId, alliance.myRole, handleKick]);

  return (
    <>
      <ScrollView
        style={styles.tabContent}
        contentContainerStyle={styles.tabContentInner}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={alliance.refreshAll} tintColor={Colors.primary} />}
      >
        {alliance.canManage && (
          <TouchableOpacity
            style={styles.invitePlayerBtn}
            onPress={openInviteModal}
            activeOpacity={0.7}
          >
            <View style={styles.invitePlayerIconWrap}>
              <UserPlus size={18} color={Colors.xenogas} />
            </View>
            <Text style={styles.invitePlayerBtnText}>Inviter un joueur</Text>
          </TouchableOpacity>
        )}

        {leaders.length > 0 && (
          <View style={styles.roleGroup}>
            <Text style={styles.roleGroupTitle}>Chef</Text>
            {leaders.map(renderMember)}
          </View>
        )}
        {officers.length > 0 && (
          <View style={styles.roleGroup}>
            <Text style={styles.roleGroupTitle}>Officiers</Text>
            {officers.map(renderMember)}
          </View>
        )}
        {diplomats.length > 0 && (
          <View style={styles.roleGroup}>
            <Text style={styles.roleGroupTitle}>Diplomates</Text>
            {diplomats.map(renderMember)}
          </View>
        )}
        {members.length > 0 && (
          <View style={styles.roleGroup}>
            <Text style={styles.roleGroupTitle}>Membres</Text>
            {members.map(renderMember)}
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      <Modal
        visible={showInviteModal}
        transparent
        animationType="fade"
        onRequestClose={closeInviteModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalOverlay} onPress={closeInviteModal}>
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
              <InviteModalContent onClose={closeInviteModal} />
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={!!roleMenuMember}
        transparent
        animationType="fade"
        onRequestClose={() => setRoleMenuMember(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setRoleMenuMember(null)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Rôle de {roleMenuMember?.username}</Text>
              <Pressable onPress={() => setRoleMenuMember(null)} hitSlop={8}>
                <X size={20} color={Colors.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.roleMenuDesc}>Chaque rôle dispose de permissions distinctes :</Text>
            {(['officer', 'diplomat', 'member'] as const).map((role) => {
              const badge = getRoleBadge(role);
              const BadgeIcon = badge.icon;
              const isCurrentRole = roleMenuMember?.role === role;
              const descriptions: Record<string, string> = {
                officer: 'Peut inviter des joueurs, exclure des membres et gérer l\'alliance.',
                diplomat: 'Peut envoyer des invitations et communiquer au nom de l\'alliance.',
                member: 'Peut discuter et participer aux activités de l\'alliance.',
              };
              return (
                <TouchableOpacity
                  key={role}
                  style={[styles.roleOption, isCurrentRole && styles.roleOptionActive, { borderColor: isCurrentRole ? badge.color + '40' : Colors.border }]}
                  onPress={() => {
                    if (!isCurrentRole && roleMenuMember) {
                      handleChangeRole(roleMenuMember, role);
                      setRoleMenuMember(null);
                    }
                  }}
                  disabled={isCurrentRole}
                  activeOpacity={0.7}
                >
                  <View style={[styles.roleOptionBadge, { backgroundColor: badge.color + '15' }]}>
                    <BadgeIcon size={16} color={badge.color} />
                  </View>
                  <View style={styles.roleOptionInfo}>
                    <Text style={[styles.roleOptionLabel, { color: isCurrentRole ? badge.color : Colors.text }]}>
                      {badge.label} {isCurrentRole ? '(actuel)' : ''}
                    </Text>
                    <Text style={styles.roleOptionDesc}>{descriptions[role]}</Text>
                  </View>
                  {isCurrentRole && <Check size={16} color={badge.color} />}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function ChatTab() {
  const alliance = useAlliance();
  const { userId } = useGame();
  const [message, setMessage] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const refetchMessages = alliance.refetchMessages;
  useEffect(() => {
    const interval = setInterval(() => {
      refetchMessages();
    }, 8000);
    return () => clearInterval(interval);
  }, [refetchMessages]);

  useEffect(() => {
    if (alliance.messages.length > 0 && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);
    }
  }, [alliance.messages.length]);

  const handleSend = useCallback(async () => {
    const content = message.trim();
    if (!content) return;
    setMessage('');
    try {
      await alliance.sendMessage(content);
    } catch (err: unknown) {
      console.log('[Alliance Chat] Send error:', err);
    }
  }, [message, alliance]);

  const renderMessage = useCallback(({ item }: { item: AllianceMessage }) => {
    const isMe = item.sender_id === userId;
    return (
      <View style={[styles.chatBubbleWrap, isMe && styles.chatBubbleWrapMe]}>
        {!isMe && <Text style={styles.chatSender}>{item.sender_username}</Text>}
        <View style={[styles.chatBubble, isMe ? styles.chatBubbleMe : styles.chatBubbleOther]}>
          <Text style={[styles.chatText, isMe && styles.chatTextMe]}>{item.content}</Text>
        </View>
        <Text style={[styles.chatTime, isMe && styles.chatTimeMe]}>{formatChatTime(item.created_at)}</Text>
      </View>
    );
  }, [userId]);

  return (
    <KeyboardAvoidingView
      style={styles.chatContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 150 : 0}
    >
      <FlatList
        ref={flatListRef}
        data={alliance.messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.chatList}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.chatEmpty}>
            <MessageCircle size={32} color={Colors.textMuted} />
            <Text style={styles.chatEmptyText}>Aucun message</Text>
            <Text style={styles.chatEmptySubtext}>Soyez le premier à écrire !</Text>
          </View>
        }
      />
      <View style={styles.chatInputRow}>
        <TextInput
          style={styles.chatInput}
          value={message}
          onChangeText={setMessage}
          placeholder="Écrire un message..."
          placeholderTextColor={Colors.textMuted}
          multiline
          maxLength={500}
          selectionColor={Colors.primary}
        />
        <TouchableOpacity
          style={[styles.chatSendBtn, !message.trim() && styles.chatSendBtnDisabled]}
          onPress={handleSend}
          disabled={!message.trim() || alliance.isSendingMessage}
          activeOpacity={0.7}
        >
          <Send size={18} color={message.trim() ? '#0A0A14' : Colors.textMuted} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function SettingsTab() {
  const alliance = useAlliance();
  const { userId } = useGame();
  const isLeader = alliance.myRole === 'leader';

  const handleLeave = useCallback(() => {
    const title = isLeader ? 'Dissoudre l\'alliance' : 'Quitter l\'alliance';
    const msg = isLeader
      ? 'Cela supprimera l\'alliance et tous ses membres. Cette action est irréversible.'
      : 'Êtes-vous sûr de vouloir quitter cette alliance ?';

    showGameAlert(title, msg, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: isLeader ? 'Dissoudre' : 'Quitter',
        style: 'destructive',
        onPress: async () => {
          try {
            if (isLeader) {
              await alliance.dissolveAlliance();
            } else {
              await alliance.leaveAlliance();
            }
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : 'Erreur';
            showGameAlert('Erreur', errMsg);
          }
        },
      },
    ], 'confirm');
  }, [isLeader, alliance]);

  const handleTransfer = useCallback((member: AllianceMember) => {
    showGameAlert(
      'Transférer le leadership',
      `Êtes-vous sûr de transférer le leadership à ${member.username} ? Vous deviendrez officier.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Transférer', onPress: async () => {
            try {
              await alliance.transferLeadership(member.id);
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (err: unknown) {
              const errMsg = err instanceof Error ? err.message : 'Erreur';
              showGameAlert('Erreur', errMsg);
            }
          },
        },
      ],
      'confirm',
    );
  }, [alliance]);

  const otherMembers = alliance.members.filter(m => m.user_id !== userId);

  return (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentInner} showsVerticalScrollIndicator={false}>
      <View style={styles.settingsSection}>
        <Text style={styles.settingsLabel}>Alliance</Text>
        <View style={styles.settingsCard}>
          <View style={styles.settingsRow}>
            <Text style={styles.settingsKey}>Nom</Text>
            <Text style={styles.settingsValue}>{alliance.myAlliance?.name}</Text>
          </View>
          <View style={styles.settingsDivider} />
          <View style={styles.settingsRow}>
            <Text style={styles.settingsKey}>Tag</Text>
            <Text style={[styles.settingsValue, { color: Colors.xenogas }]}>[{alliance.myAlliance?.tag}]</Text>
          </View>
          <View style={styles.settingsDivider} />
          <View style={styles.settingsRow}>
            <Text style={styles.settingsKey}>Membres</Text>
            <Text style={styles.settingsValue}>{alliance.members.length}</Text>
          </View>
        </View>
      </View>

      {isLeader && otherMembers.length > 0 && (
        <View style={styles.settingsSection}>
          <Text style={styles.settingsLabel}>Transférer le leadership</Text>
          {otherMembers.map(m => (
            <TouchableOpacity
              key={m.id}
              style={styles.transferRow}
              onPress={() => handleTransfer(m)}
              activeOpacity={0.7}
            >
              <Crown size={14} color={Colors.primary} />
              <Text style={styles.transferName}>{m.username}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={styles.leaveBtn}
        onPress={handleLeave}
        activeOpacity={0.7}
      >
        <LogOut size={18} color={Colors.danger} />
        <Text style={styles.leaveBtnText}>
          {isLeader ? 'Dissoudre l\'alliance' : 'Quitter l\'alliance'}
        </Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  notchSpacer: {
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 12,
  },
  noAllianceContent: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  heroIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.xenogas + '10',
    borderWidth: 2,
    borderColor: Colors.xenogas + '25',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: '700' as const,
    marginBottom: 8,
  },
  heroSubtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center' as const,
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 10,
  },
  invitationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.xenogas + '25',
    marginBottom: 8,
  },
  invitationInfo: {
    flex: 1,
  },
  invitationName: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  invitationFrom: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  invitationActions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.danger + '15',
    borderWidth: 1,
    borderColor: Colors.danger + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.primary + '25',
    gap: 14,
  },
  createIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: Colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createTextWrap: {
    flex: 1,
  },
  createTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  createSubtitle: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoText: {
    color: Colors.textSecondary,
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
  },
  allianceHeader: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTagWrap: {
    backgroundColor: Colors.xenogas + '15',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.xenogas + '30',
    marginBottom: 6,
  },
  headerTag: {
    color: Colors.xenogas,
    fontSize: 14,
    fontWeight: '700' as const,
    letterSpacing: 1,
  },
  headerName: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '700' as const,
    marginBottom: 6,
  },
  headerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerStatText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  headerDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
  },
  headerRoleText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  headerDesc: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center' as const,
  },
  subTabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  subTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 8,
    gap: 5,
  },
  subTabActive: {
    backgroundColor: Colors.xenogas + '12',
    borderWidth: 1,
    borderColor: Colors.xenogas + '30',
  },
  subTabText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  subTabTextActive: {
    color: Colors.xenogas,
  },
  tabContent: {
    flex: 1,
  },
  tabContentInner: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  inlineInviteContainer: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.xenogas + '25',
  },
  inlineInviteTitle: {
    color: Colors.xenogas,
    fontSize: 12,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 10,
  },
  inlineInviteInputRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  inlineInviteInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  inlineInviteSendBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: Colors.xenogas,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  inlineInviteSendBtnDisabled: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  roleGroup: {
    marginBottom: 16,
  },
  roleGroupTitle: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  memberBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  memberRole: {
    fontSize: 11,
    fontWeight: '500' as const,
    marginTop: 1,
  },
  memberActions: {
    flexDirection: 'row',
    gap: 6,
  },
  memberActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatContainer: {
    flex: 1,
  },
  chatList: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  chatEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  chatEmptyText: {
    color: Colors.textMuted,
    fontSize: 15,
    fontWeight: '600' as const,
    marginTop: 12,
  },
  chatEmptySubtext: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  chatBubbleWrap: {
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  chatBubbleWrapMe: {
    alignItems: 'flex-end',
  },
  chatSender: {
    color: Colors.xenogas,
    fontSize: 11,
    fontWeight: '600' as const,
    marginBottom: 3,
    marginLeft: 8,
  },
  chatBubble: {
    maxWidth: '80%' as unknown as number,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chatBubbleMe: {
    backgroundColor: Colors.xenogas + '20',
    borderBottomRightRadius: 4,
  },
  chatBubbleOther: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderBottomLeftRadius: 4,
  },
  chatText: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 19,
  },
  chatTextMe: {
    color: Colors.text,
  },
  chatTime: {
    color: Colors.textMuted,
    fontSize: 10,
    marginTop: 3,
    marginLeft: 8,
  },
  chatTimeMe: {
    marginRight: 8,
    marginLeft: 0,
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: 8,
  },
  chatInput: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 80,
  },
  chatSendBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.xenogas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSendBtnDisabled: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  settingsSection: {
    marginBottom: 20,
  },
  settingsLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  settingsCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  settingsDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 14,
  },
  settingsKey: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  settingsValue: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  transferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  transferName: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '500' as const,
  },
  leaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.danger + '12',
    borderWidth: 1,
    borderColor: Colors.danger + '30',
  },
  leaveBtnText: {
    color: Colors.danger,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '92%' as unknown as number,
    maxWidth: 420,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700' as const,
  },
  inputLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600' as const,
    marginBottom: 6,
    marginTop: 10,
  },
  modalInput: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  modalTextArea: {
    minHeight: 60,
    textAlignVertical: 'top' as const,
  },
  charCount: {
    color: Colors.textMuted,
    fontSize: 10,
    textAlign: 'right' as const,
    marginTop: 4,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 13,
    marginTop: 16,
  },
  confirmBtnDisabled: {
    opacity: 0.4,
  },
  confirmBtnText: {
    color: '#0A0A14',
    fontSize: 14,
    fontWeight: '700' as const,
  },
  resolvedBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.success + '20',
    borderWidth: 1,
    borderColor: Colors.success + '50',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  suggestionsContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.xenogas + '30',
    marginTop: 8,
    overflow: 'hidden' as const,
  },
  suggestionRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
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
    backgroundColor: Colors.xenogas + '15',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  suggestionText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '500' as const,
  },
  suggestionsLoading: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginTop: 8,
  },
  suggestionsLoadingText: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  invitePlayerBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.xenogas + '25',
    gap: 12,
  },
  invitePlayerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.xenogas + '12',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  invitePlayerBtnText: {
    color: Colors.xenogas,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  inviteModalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '92%' as unknown as number,
    maxWidth: 420,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inviteModalInputRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  inviteModalInput: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inviteSuggestionsScroll: {
    maxHeight: 200,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.xenogas + '30',
    marginTop: 8,
  },
  inlineInviteWrapper: {
    marginBottom: 16,
  },
  inlineInviteForm: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.xenogas + '25',
    marginTop: -8,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  inlineInviteLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600' as const,
    marginBottom: 8,
  },
  inlineResolvedBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.success + '20',
    borderWidth: 1,
    borderColor: Colors.success + '50',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  inlineSuggestionsLoading: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginTop: 8,
  },
  inlineSuggestionsLoadingText: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  inlineSuggestionsList: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.xenogas + '30',
    marginTop: 8,
    overflow: 'hidden' as const,
  },
  inlineSuggestionRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  inlineSuggestionAvatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.xenogas + '15',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  inlineSuggestionText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '500' as const,
  },
  inlineInviteBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: Colors.xenogas,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 12,
  },
  inlineInviteBtnDisabled: {
    opacity: 0.4,
  },
  inlineInviteBtnText: {
    color: '#0A0A14',
    fontSize: 14,
    fontWeight: '700' as const,
  },
  roleBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 4,
    alignSelf: 'flex-start' as const,
  },
  roleBannerText: {
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
  },
  roleMenuDesc: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginBottom: 12,
    lineHeight: 17,
  },
  roleOption: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
    backgroundColor: Colors.card,
  },
  roleOptionActive: {
    backgroundColor: Colors.surface,
  },
  roleOptionBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  roleOptionInfo: {
    flex: 1,
  },
  roleOptionLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  roleOptionDesc: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    lineHeight: 15,
  },
});
