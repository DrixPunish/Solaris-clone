import React, { useMemo, useState, useCallback, useEffect } from 'react';
import ClickableCoords from '@/components/ClickableCoords';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, KeyboardAvoidingView, Platform, TouchableOpacity, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Wallet, Shield, Rocket, FlaskConical, Building2, Pencil, X, Check, Mail, Navigation, FileText, UserCircle, Users, LogOut, Settings, BarChart3, MapPin, Bell, BellOff, Swords, Hammer, ChevronLeft, ChevronRight, Thermometer, Scan, Globe, MessageSquare } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { useGame } from '@/contexts/GameContext';
import { useFleet } from '@/contexts/FleetContext';
import { formatNumber } from '@/utils/gameCalculations';
import ResourceBar from '@/components/ResourceBar';
import PlanetVisual from '@/components/PlanetVisual';
import { usePlanetSprite } from '@/hooks/usePlanetSprites';
import StarField from '@/components/StarField';
import Colors from '@/constants/colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { showGameAlert } from '@/components/GameAlert';
import { TutorialReopenButton } from '@/components/TutorialWidget';
import QuantumShieldCard from '@/components/QuantumShieldCard';
import { useNotificationSettings } from '@/contexts/NotificationSettingsContext';

const LAST_USERNAME_CHANGE_KEY = 'solaris_last_username_change';
const LAST_REPORTS_VISIT_KEY = 'solaris_last_reports_visit';

interface OrbitalStatProps {
  icon: React.ElementType;
  value: string | number;
  label: string;
  color: string;
  size?: number;
}

const OrbitalStat = React.memo(function OrbitalStat({ icon: Icon, value, label, color, size = 16 }: OrbitalStatProps) {
  return (
    <View style={orbitalStyles.stat}>
      <View style={[orbitalStyles.statIconWrap, { backgroundColor: color + '15' }]}>
        <Icon size={size} color={color} />
      </View>
      <Text style={orbitalStyles.statValue}>{value}</Text>
      <Text style={orbitalStyles.statLabel}>{label}</Text>
    </View>
  );
});

interface ActionButtonProps {
  icon: React.ElementType;
  label: string;
  onPress: () => void;
  badge?: number;
  color?: string;
  accentBorder?: string;
}

const ActionButton = React.memo(function ActionButton({ icon: Icon, label, onPress, badge, color = Colors.textSecondary, accentBorder }: ActionButtonProps) {
  return (
    <TouchableOpacity
      style={[
        actionStyles.button,
        accentBorder ? { borderColor: accentBorder } : undefined,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {badge !== undefined && badge > 0 && (
        <View style={actionStyles.badge}>
          <Text style={actionStyles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
      <View style={[actionStyles.iconWrap, { backgroundColor: color + '12' }]}>
        <Icon size={24} color={color} />
      </View>
      <Text style={[actionStyles.label, accentBorder ? { color: accentBorder } : undefined]}>{label}</Text>
    </TouchableOpacity>
  );
});

interface SmallActionButtonProps {
  icon: React.ElementType;
  label: string;
  onPress: () => void;
  color?: string;
  accentBorder?: string;
}

const SmallActionButton = React.memo(function SmallActionButton({ icon: Icon, label, onPress, color = Colors.textMuted, accentBorder }: SmallActionButtonProps) {
  return (
    <TouchableOpacity
      style={[
        actionStyles.smallButton,
        accentBorder ? { borderColor: accentBorder } : undefined,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[actionStyles.smallIconWrap, { backgroundColor: color + '12' }]}>
        <Icon size={18} color={color} />
      </View>
      <Text style={[actionStyles.smallLabel, accentBorder ? { color: accentBorder } : undefined]}>{label}</Text>
    </TouchableOpacity>
  );
});

export default function PlanetScreen() {
  const { state, activePlanet, activeRenamePlanet, setUsername, userEmail, setActivePlanetId, refreshResources, isRefreshing, activePlanetId } = useGame();
  const router = useRouter();
  const { user } = useAuth();
  const { signOut } = useAuth();
  const { activeMissions, espionageReports, combatReports, transportReports } = useFleet();
  const { userId } = useGame();
  const spriteQuery = usePlanetSprite(activePlanet.coordinates);
  const activePlanetSprite = spriteQuery.data ?? null;

  const fleetCount = activeMissions.filter(m => {
    if (m.sender_id === userId) return true;
    if (m.target_player_id === userId && m.mission_phase === 'en_route') return true;
    return false;
  }).length;

  const unreadQuery = useQuery({
    queryKey: ['messages', 'unread-count', user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { count, error } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .eq('read', false);
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!user?.id,
    refetchInterval: 15000,
  });
  const unreadCount = unreadQuery.data ?? 0;

  const [lastReportsVisit, setLastReportsVisit] = useState<number>(0);

  useEffect(() => {
    AsyncStorage.getItem(LAST_REPORTS_VISIT_KEY).then(raw => {
      if (raw) setLastReportsVisit(parseInt(raw, 10) || 0);
    });
  }, []);

  const unreadReportsCount = useMemo(() => {
    if (lastReportsVisit === 0) return espionageReports.length + combatReports.length + transportReports.length;
    const countNew = (items: { created_at: string }[]) =>
      items.filter(r => new Date(r.created_at).getTime() > lastReportsVisit).length;
    return countNew(espionageReports) + countNew(combatReports) + countNew(transportReports);
  }, [espionageReports, combatReports, transportReports, lastReportsVisit]);

  const handleOpenReports = useCallback(() => {
    const now = Date.now();
    setLastReportsVisit(now);
    AsyncStorage.setItem(LAST_REPORTS_VISIT_KEY, String(now));
    router.push('/reports');
  }, [router]);

  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [newPlanetName, setNewPlanetName] = useState('');
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState(state.username ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const { settings: notifSettings, updateSetting } = useNotificationSettings();

  const openRenameModal = useCallback(() => {
    setNewPlanetName(activePlanet.planetName);
    setRenameModalVisible(true);
  }, [activePlanet.planetName]);

  const confirmRename = useCallback(() => {
    const trimmed = newPlanetName.trim();
    if (trimmed && trimmed.length <= 24) {
      activeRenamePlanet(trimmed);
    }
    setRenameModalVisible(false);
  }, [newPlanetName, activeRenamePlanet]);

  const handleEditUsername = useCallback(() => {
    setNewUsername(state.username ?? '');
    setIsEditingUsername(true);
  }, [state.username]);

  const handleCancelEdit = useCallback(() => {
    setIsEditingUsername(false);
    setNewUsername(state.username ?? '');
  }, [state.username]);

  const handleSaveUsername = useCallback(async () => {
    const trimmed = newUsername.trim();
    if (trimmed.length < 3) {
      showGameAlert('Erreur', 'Le pseudo doit contenir au moins 3 caractères.');
      return;
    }
    if (trimmed.length > 20) {
      showGameAlert('Erreur', 'Le pseudo ne peut pas dépasser 20 caractères.');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      showGameAlert('Erreur', 'Le pseudo ne peut contenir que des lettres, chiffres, tirets et underscores.');
      return;
    }
    const lastChangeStr = await AsyncStorage.getItem(LAST_USERNAME_CHANGE_KEY);
    if (lastChangeStr) {
      const lastChange = parseInt(lastChangeStr, 10);
      const oneDayMs = 24 * 60 * 60 * 1000;
      if (Date.now() - lastChange < oneDayMs) {
        const hoursLeft = Math.ceil((oneDayMs - (Date.now() - lastChange)) / (60 * 60 * 1000));
        showGameAlert('Limite atteinte', `Vous pourrez changer votre pseudo dans ${hoursLeft}h.`);
        return;
      }
    }
    setIsSaving(true);
    try {
      setUsername(trimmed);
      await AsyncStorage.setItem(LAST_USERNAME_CHANGE_KEY, String(Date.now()));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsEditingUsername(false);
      console.log('[Planet] Username changed to:', trimmed);
    } catch (err) {
      console.log('[Planet] Error saving username:', err);
      showGameAlert('Erreur', 'Impossible de sauvegarder le pseudo.');
    } finally {
      setIsSaving(false);
    }
  }, [newUsername, setUsername]);

  const handleSignOut = useCallback(() => {
    showGameAlert(
      'Déconnexion',
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Déconnexion',
          style: 'destructive',
          onPress: () => {
            console.log('[Planet] Signing out');
            void signOut();
          },
        },
      ],
      'confirm',
    );
  }, [signOut]);

  const totalBuildings = useMemo(
    () => Object.values(activePlanet.buildings).reduce((sum, level) => sum + level, 0),
    [activePlanet.buildings],
  );

  const totalResearch = useMemo(
    () => Object.values(state.research).reduce((sum, level) => sum + level, 0),
    [state.research],
  );

  const totalShips = useMemo(
    () => Object.values(activePlanet.ships).reduce((sum, count) => sum + count, 0),
    [activePlanet.ships],
  );

  const totalDefenses = useMemo(
    () => Object.values(activePlanet.defenses).reduce((sum, count) => sum + count, 0),
    [activePlanet.defenses],
  );

  const planetSlotData = useMemo(() => {
    if (!activePlanetId) {
      return {
        totalFields: state.totalFields,
        baseFields: state.baseFields,
        temperatureMin: state.temperatureMin,
        temperatureMax: state.temperatureMax,
        metalBonusPct: state.metalBonusPct,
        crystalBonusPct: state.crystalBonusPct,
        deutBonusPct: state.deutBonusPct,
      };
    }
    const colony = (state.colonies ?? []).find(c => c.id === activePlanetId);
    return {
      totalFields: colony?.totalFields,
      baseFields: colony?.baseFields,
      temperatureMin: colony?.temperatureMin,
      temperatureMax: colony?.temperatureMax,
      metalBonusPct: colony?.metalBonusPct,
      crystalBonusPct: colony?.crystalBonusPct,
      deutBonusPct: colony?.deutBonusPct,
    };
  }, [activePlanetId, state.totalFields, state.baseFields, state.temperatureMin, state.temperatureMax, state.metalBonusPct, state.crystalBonusPct, state.deutBonusPct, state.colonies]);

  const usedFields = useMemo(() => {
    return Object.values(activePlanet.buildings).reduce((sum, level) => sum + level, 0);
  }, [activePlanet.buildings]);

  const planetSize = useMemo(() => {
    if (planetSlotData.totalFields) return `${usedFields}/${planetSlotData.totalFields}`;
    return String(Object.keys(activePlanet.buildings).filter(k => (activePlanet.buildings[k] ?? 0) > 0).length * 12 + 100);
  }, [activePlanet.buildings, planetSlotData.totalFields, usedFields]);

  const planetTemperature = useMemo(() => {
    if (planetSlotData.temperatureMax != null) {
      return `${planetSlotData.temperatureMax}°C`;
    }
    const pos = activePlanet.coordinates[2];
    return String(Math.round(75 - (pos * 5)));
  }, [activePlanet.coordinates, planetSlotData.temperatureMin, planetSlotData.temperatureMax]);

  const activeTimerCount = activePlanet.activeTimers.length;

  const planetIds = useMemo(() => {
    const ids: (string | null)[] = [null];
    for (const colony of (state.colonies ?? [])) {
      ids.push(colony.id);
    }
    return ids;
  }, [state.colonies]);

  const currentPlanetIndex = useMemo(() => {
    return planetIds.indexOf(activePlanetId);
  }, [planetIds, activePlanetId]);

  const goToPrevPlanet = useCallback(() => {
    if (planetIds.length <= 1) return;
    const prevIndex = (currentPlanetIndex - 1 + planetIds.length) % planetIds.length;
    setActivePlanetId(planetIds[prevIndex] ?? null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [planetIds, currentPlanetIndex, setActivePlanetId]);

  const goToNextPlanet = useCallback(() => {
    if (planetIds.length <= 1) return;
    const nextIndex = (currentPlanetIndex + 1) % planetIds.length;
    setActivePlanetId(planetIds[nextIndex] ?? null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [planetIds, currentPlanetIndex, setActivePlanetId]);

  return (
    <View style={styles.container}>
      <ResourceBar />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshResources}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >


        <View style={styles.orbitalSection}>
          <StarField starCount={45} height={320} />

          <View style={orbitalStyles.topRow}>
            <OrbitalStat icon={Building2} value={totalBuildings} label="Bâtiments" color={Colors.primary} />
            <OrbitalStat icon={FlaskConical} value={totalResearch} label="Recherche" color={Colors.silice} />
          </View>

          <View style={orbitalStyles.planetInfo}>
            <Pressable onPress={openRenameModal} style={orbitalStyles.nameRow}>
              <Text style={orbitalStyles.planetName}>{activePlanet.planetName}</Text>
              <View style={orbitalStyles.editIcon}>
                <Pencil size={10} color={Colors.textMuted} />
              </View>
            </Pressable>
          </View>

          <View style={orbitalStyles.centerRow}>
            <TouchableOpacity
              onPress={goToPrevPlanet}
              style={orbitalStyles.arrowBtn}
              activeOpacity={0.5}
              disabled={planetIds.length <= 1}
            >
              <ChevronLeft size={24} color={planetIds.length > 1 ? Colors.textSecondary : Colors.border} />
            </TouchableOpacity>

            <OrbitalStat icon={Rocket} value={totalShips} label="Flotte" color={Colors.accent} />

            <View style={orbitalStyles.planetCenter}>
              {activePlanetSprite ? (
                <Image
                  source={{ uri: activePlanetSprite }}
                  style={orbitalStyles.planetImage}
                  resizeMode="cover"
                />
              ) : (
                <PlanetVisual size={140} />
              )}
            </View>

            <OrbitalStat icon={Shield} value={totalDefenses} label="Défense" color={Colors.success} />

            <TouchableOpacity
              onPress={goToNextPlanet}
              style={orbitalStyles.arrowBtn}
              activeOpacity={0.5}
              disabled={planetIds.length <= 1}
            >
              <ChevronRight size={24} color={planetIds.length > 1 ? Colors.textSecondary : Colors.border} />
            </TouchableOpacity>
          </View>

          <View style={orbitalStyles.coordsRow}>
            <ClickableCoords coords={activePlanet.coordinates} style={orbitalStyles.coords} center />
          </View>

          <View style={orbitalStyles.bottomRow}>
            <OrbitalStat icon={Scan} value={planetSize} label="Taille" color={Colors.textSecondary} />
            <OrbitalStat icon={Thermometer} value={`${planetTemperature}°C`} label="Température" color={Colors.textSecondary} />
          </View>

          {activeTimerCount > 0 && (
            <View style={styles.timerBadge}>
              <View style={styles.timerDot} />
              <Text style={styles.timerBadgeText}>
                {activeTimerCount} construction{activeTimerCount > 1 ? 's' : ''} en cours
              </Text>
            </View>
          )}
        </View>

        <QuantumShieldCard />

        <View style={actionStyles.grid}>
          <View style={actionStyles.row}>
            <ActionButton
              icon={Navigation}
              label="Mouvement de Flotte"
              onPress={() => router.push('/fleet-overview')}
              badge={fleetCount}
              color={Colors.accent}
            />
            <ActionButton
              icon={FileText}
              label="Rapports"
              onPress={handleOpenReports}
              badge={unreadReportsCount}
              color={Colors.silice}
            />
          </View>
          <View style={actionStyles.row}>
            <ActionButton
              icon={BarChart3}
              label="Statistiques"
              onPress={() => router.push('/statistics')}
              color={Colors.energy}
            />
            <ActionButton
              icon={Globe}
              label="Colonies"
              onPress={() => router.push('/colonies')}

              color={Colors.xenogas}
            />
          </View>
          <View style={actionStyles.row}>
            <ActionButton
              icon={MapPin}
              label="Tutoriel"
              onPress={() => {}}
              color={Colors.xenogas}
              accentBorder={Colors.xenogas}
            />
            <ActionButton
              icon={MessageSquare}
              label="Messages"
              onPress={() => router.push('/messages')}
              badge={unreadCount}
              color={Colors.primary}
              accentBorder={Colors.accent}
            />
          </View>
          <View style={actionStyles.row}>
            <SmallActionButton
              icon={Settings}
              label="Paramètres"
              onPress={() => setShowSettings(!showSettings)}
            />
            <SmallActionButton
              icon={Wallet}
              label="Wallet"
              onPress={() => {}}
              color={Colors.solar}
              accentBorder={Colors.solar}
            />
          </View>
        </View>

        <TutorialReopenButton />

        {showSettings && (
          <View>
            <View style={styles.settingsCard}>
              <View style={styles.settingsRow}>
                <View style={styles.settingsIconWrap}>
                  <Mail size={18} color={Colors.primary} />
                </View>
                <View style={styles.settingsContent}>
                  <Text style={styles.settingsLabel}>Email</Text>
                  <Text style={styles.settingsValue}>{userEmail || '\u2014'}</Text>
                </View>
              </View>

              <View style={styles.settingsDivider} />

              <View style={styles.settingsRow}>
                <View style={styles.settingsIconWrap}>
                  <UserCircle size={18} color={Colors.accent} />
                </View>
                <View style={styles.settingsContent}>
                  <Text style={styles.settingsLabel}>Pseudo</Text>
                  {isEditingUsername ? (
                    <View style={styles.editRow}>
                      <TextInput
                        style={styles.editInput}
                        value={newUsername}
                        onChangeText={setNewUsername}
                        autoCapitalize="none"
                        autoCorrect={false}
                        maxLength={20}
                        placeholder="Nouveau pseudo"
                        placeholderTextColor={Colors.textMuted}
                        testID="edit-username-input"
                      />
                      <TouchableOpacity
                        onPress={handleSaveUsername}
                        style={styles.editBtn}
                        disabled={isSaving}
                        activeOpacity={0.6}
                      >
                        {isSaving ? (
                          <ActivityIndicator size="small" color={Colors.success} />
                        ) : (
                          <Check size={16} color={Colors.success} />
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleCancelEdit}
                        style={styles.editBtn}
                        activeOpacity={0.6}
                      >
                        <X size={16} color={Colors.danger} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.valueRow}>
                      <Text style={styles.settingsValue}>{state.username || '\u2014'}</Text>
                      <TouchableOpacity onPress={handleEditUsername} style={styles.editIconBtn} activeOpacity={0.6}>
                        <Pencil size={14} color={Colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.settingsDivider} />

              <View style={styles.settingsRow}>
                <View style={styles.settingsIconWrap}>
                  <Wallet size={18} color={Colors.solar} />
                </View>
                <View style={styles.settingsContent}>
                  <Text style={styles.settingsLabel}>Wallet</Text>
                  <Text style={[styles.settingsValue, { color: Colors.textMuted, fontStyle: 'italic' as const }]}>Non connect\u00e9</Text>
                </View>
              </View>
            </View>

            <Text style={styles.usernameHint}>Le pseudo peut \u00eatre chang\u00e9 une fois par jour.</Text>

            <TouchableOpacity
              style={styles.notifSettingsBtn}
              onPress={() => setShowNotifSettings(!showNotifSettings)}
              activeOpacity={0.7}
            >
              <View style={styles.notifSettingsBtnLeft}>
                <View style={[styles.settingsIconWrap, { backgroundColor: Colors.warning + '12' }]}>
                  <Bell size={18} color={Colors.warning} />
                </View>
                <Text style={styles.notifSettingsBtnLabel}>Notifications</Text>
              </View>
              <ChevronRight size={16} color={Colors.textMuted} style={showNotifSettings ? { transform: [{ rotate: '90deg' }] } : undefined} />
            </TouchableOpacity>

            {showNotifSettings && (
              <View style={styles.notifCard}>
                <TouchableOpacity
                  style={styles.notifRow}
                  onPress={() => updateSetting('buildPopups', !notifSettings.buildPopups)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.notifIconWrap, { backgroundColor: notifSettings.buildPopups ? Colors.success + '15' : Colors.textMuted + '10' }]}>
                    <Hammer size={15} color={notifSettings.buildPopups ? Colors.success : Colors.textMuted} />
                  </View>
                  <View style={styles.notifTextWrap}>
                    <Text style={styles.notifTitle}>Pop-ups de fin de construction</Text>
                    <Text style={styles.notifDesc}>B\u00e2timents, recherches, vaisseaux, d\u00e9fenses</Text>
                  </View>
                  <View style={[styles.notifToggle, notifSettings.buildPopups ? styles.notifToggleOn : styles.notifToggleOff]}>
                    <View style={[styles.notifToggleThumb, notifSettings.buildPopups ? styles.notifThumbOn : styles.notifThumbOff]} />
                  </View>
                </TouchableOpacity>

                <View style={styles.notifDivider} />

                <TouchableOpacity
                  style={styles.notifRow}
                  onPress={() => updateSetting('attackBanner', !notifSettings.attackBanner)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.notifIconWrap, { backgroundColor: notifSettings.attackBanner ? Colors.danger + '15' : Colors.textMuted + '10' }]}>
                    <Swords size={15} color={notifSettings.attackBanner ? Colors.danger : Colors.textMuted} />
                  </View>
                  <View style={styles.notifTextWrap}>
                    <Text style={styles.notifTitle}>Bandeau d{"'"}attaque</Text>
                    <Text style={styles.notifDesc}>Alerte sous la barre de ressources</Text>
                  </View>
                  <View style={[styles.notifToggle, notifSettings.attackBanner ? styles.notifToggleOn : styles.notifToggleOff]}>
                    <View style={[styles.notifToggleThumb, notifSettings.attackBanner ? styles.notifThumbOn : styles.notifThumbOff]} />
                  </View>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={styles.friendsCard}
              onPress={() => router.push('/friends')}
              activeOpacity={0.7}
            >
              <View style={[styles.settingsIconWrap, { backgroundColor: Colors.success + '15' }]}>
                <Users size={18} color={Colors.success} />
              </View>
              <View style={styles.settingsContent}>
                <Text style={styles.friendsTitle}>Amis</Text>
                <Text style={styles.friendsSub}>G\u00e9rer votre liste d{"'"}amis</Text>
              </View>
              <ChevronRight size={16} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={handleSignOut}
              activeOpacity={0.7}
            >
              <LogOut size={18} color={Colors.danger} />
              <Text style={styles.logoutText}>Se d\u00e9connecter</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={renameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setRenameModalVisible(false)}>
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{activePlanet.isColony ? 'Renommer la colonie' : 'Renommer la plan\u00e8te'}</Text>
                <Pressable onPress={() => setRenameModalVisible(false)} hitSlop={8}>
                  <X size={20} color={Colors.textMuted} />
                </Pressable>
              </View>
              <TextInput
                style={styles.renameInput}
                value={newPlanetName}
                onChangeText={setNewPlanetName}
                maxLength={24}
                autoFocus
                placeholderTextColor={Colors.textMuted}
                placeholder={activePlanet.isColony ? 'Nom de la colonie' : 'Nom de la plan\u00e8te'}
                selectionColor={Colors.primary}
              />
              <Text style={styles.charCount}>{newPlanetName.length}/24</Text>
              <Pressable
                style={[styles.confirmBtn, !newPlanetName.trim() && styles.confirmBtnDisabled]}
                onPress={confirmRename}
                disabled={!newPlanetName.trim()}
              >
                <Check size={16} color="#fff" />
                <Text style={styles.confirmBtnText}>Confirmer</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const orbitalStyles = StyleSheet.create({
  topRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 24,
    marginBottom: -8,
    zIndex: 2,
  },
  centerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    zIndex: 1,
  },
  bottomRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    paddingHorizontal: 16,
    marginTop: -4,
    zIndex: 2,
  },
  arrowBtn: {
    width: 32,
    height: 32,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  planetCenter: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginHorizontal: 4,
  },
  planetImage: {
    width: 220,
    height: 220,
    borderRadius: 110,
  },
  planetInfo: {
    alignItems: 'center' as const,
    marginBottom: 4,
  },
  coordsRow: {
    alignItems: 'center' as const,
    marginTop: 10,
  },
  nameRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  planetName: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '700' as const,
  },
  editIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  coords: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '500' as const,
    marginTop: 2,
    letterSpacing: 1,
  },
  stat: {
    alignItems: 'center' as const,
    minWidth: 60,
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 4,
  },
  statValue: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
  },
  statLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '500' as const,
    marginTop: 1,
    letterSpacing: 0.3,
  },
});

const actionStyles = StyleSheet.create({
  grid: {
    gap: 10,
    marginTop: 16,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row' as const,
    gap: 10,
  },
  button: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 8,
  },
  label: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    textAlign: 'center' as const,
  },
  badge: {
    position: 'absolute' as const,
    top: 8,
    right: 8,
    backgroundColor: Colors.danger,
    borderRadius: 9,
    minWidth: 20,
    height: 20,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 5,
    zIndex: 10,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700' as const,
  },
  smallButton: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  smallIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  smallLabel: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  orbitalSection: {
    paddingVertical: 12,
    marginBottom: 12,
  },
  timerBadge: {
    marginTop: 8,
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'center' as const,
    gap: 6,
  },
  timerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  timerBadgeText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '600' as const,
  },
  colonyBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: Colors.xenogas + '12',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.xenogas + '30',
  },
  colonyBannerLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    flex: 1,
  },
  colonyBannerText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '500' as const,
  },
  colonyBannerName: {
    color: Colors.xenogas,
    fontWeight: '700' as const,
  },
  colonyBannerAction: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '600' as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    width: '85%' as unknown as number,
    maxWidth: 340,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 16,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700' as const,
  },
  renameInput: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  charCount: {
    color: Colors.textMuted,
    fontSize: 11,
    textAlign: 'right' as const,
    marginTop: 6,
  },
  confirmBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 12,
  },
  confirmBtnDisabled: {
    opacity: 0.4,
  },
  confirmBtnText: {
    color: '#0A0A14',
    fontSize: 14,
    fontWeight: '700' as const,
  },
  settingsCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden' as const,
    marginBottom: 4,
  },
  settingsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  settingsIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  settingsContent: {
    flex: 1,
  },
  settingsLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  settingsValue: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '500' as const,
  },
  settingsDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 62,
  },
  editRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  editInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontSize: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  editBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  valueRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  editIconBtn: {
    padding: 4,
  },
  usernameHint: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 4,
    marginBottom: 12,
    marginLeft: 4,
  },
  friendsCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  friendsTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  friendsSub: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  logoutBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.danger + '12',
    borderWidth: 1,
    borderColor: Colors.danger + '30',
  },
  logoutText: {
    color: Colors.danger,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  notifSettingsBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  notifSettingsBtnLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  notifSettingsBtnLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  notifCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden' as const,
    marginBottom: 12,
  },
  notifRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  notifIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  notifTextWrap: {
    flex: 1,
  },
  notifTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  notifDesc: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  notifDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 58,
  },
  notifToggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center' as const,
    paddingHorizontal: 2,
  },
  notifToggleOn: {
    backgroundColor: Colors.success + '40',
  },
  notifToggleOff: {
    backgroundColor: Colors.textMuted + '25',
  },
  notifToggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  notifThumbOn: {
    backgroundColor: Colors.success,
    alignSelf: 'flex-end' as const,
  },
  notifThumbOff: {
    backgroundColor: Colors.textMuted,
    alignSelf: 'flex-start' as const,
  },
});
