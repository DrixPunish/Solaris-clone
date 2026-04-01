import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, Animated, ActivityIndicator, Platform } from 'react-native';
import { Shield, ShieldCheck, Clock, Zap, AlertTriangle, ChevronLeft } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc';
import { useGame } from '@/contexts/GameContext';
import Colors from '@/constants/colors';
import { QuantumShieldStatus } from '@/types/fleet';

function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return '00:00:00';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const SHIELD_LORE = "Bouclier Quantique : Il s'agit d'un puissant bouclier permettant aux planètes d'être totalement protégées durant son champ d'action de 24h. Aucun attaquant ne se risque à le franchir sous peine d'être dissolu dans l'espace. Seul le Synode Quantique sait fabriquer cet artefact. Ils le vendent à prix d'or.";

type ModalStep = 'lore' | 'confirm' | null;

export default function QuantumShieldCard() {
  const { userId, state } = useGame();
  const queryClient = useQueryClient();
  const [modalStep, setModalStep] = useState<ModalStep>(null);
  const [localRemaining, setLocalRemaining] = useState(0);
  const [localCooldown, setLocalCooldown] = useState(0);
  const pulseAnim = useRef(new Animated.Value(0.6)).current;

  const shieldQuery = trpc.world.getQuantumShieldStatus.useQuery(
    undefined,
    { enabled: !!userId, refetchInterval: 30000, staleTime: 10000 },
  );

  const buyMutation = trpc.world.buyQuantumShield.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        console.log('[QuantumShield] Purchased! Solar remaining:', data.remaining_solar);
        void queryClient.invalidateQueries({ queryKey: [['world', 'getQuantumShieldStatus']] });
        void queryClient.invalidateQueries({ queryKey: ['gameState'] });
        setModalStep(null);
      }
    },
  });

  const shieldData: QuantumShieldStatus | null = shieldQuery.data ?? null;

  useEffect(() => {
    if (!shieldData) return;
    setLocalRemaining(Math.max(0, shieldData.remaining_seconds));
    setLocalCooldown(Math.max(0, shieldData.cooldown_remaining_seconds));
  }, [shieldData]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLocalRemaining(prev => Math.max(0, prev - 1));
      setLocalCooldown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const shieldRefetch = shieldQuery.refetch;
  useEffect(() => {
    if (localRemaining <= 0 && shieldData?.shield_active) {
      void shieldRefetch();
    }
  }, [localRemaining, shieldData?.shield_active, shieldRefetch]);

  useEffect(() => {
    if (!shieldData?.shield_active) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.6, duration: 1500, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [shieldData?.shield_active, pulseAnim]);

  const isActive = shieldData?.shield_active === true && localRemaining > 0;
  const isOnCooldown = !isActive && localCooldown > 0;
  const canBuy = !isActive && !isOnCooldown;

  const handleBuy = useCallback(() => {
    if (!userId) return;
    buyMutation.mutate();
  }, [userId, buyMutation]);

  const solarBalance = state.solar ?? 0;
  const canAfford = solarBalance >= 500;

  const closeModal = useCallback(() => {
    setModalStep(null);
    buyMutation.reset();
  }, [buyMutation]);

  const renderLoreContent = () => (
    <Pressable style={qStyles.modalContent} onPress={() => {}}>
      <View style={qStyles.modalIconWrap}>
        <Shield size={32} color="#22D3EE" />
      </View>
      <Text style={qStyles.modalTitle}>Bouclier Quantique</Text>
      <Text style={qStyles.loreText}>{SHIELD_LORE}</Text>

      <View style={qStyles.rulesCard}>
        <View style={qStyles.ruleRow}>
          <Clock size={14} color={Colors.primary} />
          <Text style={qStyles.ruleText}>Protection totale pendant 24h</Text>
        </View>
        <View style={qStyles.ruleRow}>
          <AlertTriangle size={14} color={Colors.warning} />
          <Text style={qStyles.ruleText}>Chaque attaque lancée sous bouclier réduit la durée de 12h</Text>
        </View>
        <View style={qStyles.ruleRow}>
          <Clock size={14} color={Colors.textMuted} />
          <Text style={qStyles.ruleText}>Cooldown de 24h après expiration</Text>
        </View>
      </View>

      {isActive && (
        <View style={qStyles.statusBanner}>
          <ShieldCheck size={16} color="#22D3EE" />
          <Text style={qStyles.statusActiveText}>Actif — {formatCountdown(localRemaining)}</Text>
        </View>
      )}

      {isOnCooldown && (
        <View style={qStyles.statusBannerCooldown}>
          <Clock size={16} color={Colors.warning} />
          <Text style={qStyles.statusCooldownText}>Recharge — {formatCountdown(localCooldown)}</Text>
        </View>
      )}

      <View style={qStyles.modalButtons}>
        <TouchableOpacity
          style={qStyles.closeBtn}
          onPress={closeModal}
          activeOpacity={0.7}
        >
          <Text style={qStyles.closeBtnText}>Fermer</Text>
        </TouchableOpacity>
        {canBuy && (
          <TouchableOpacity
            style={[qStyles.buyBtn, !canAfford && qStyles.buyBtnDisabled]}
            onPress={() => {
              if (canAfford) setModalStep('confirm');
            }}
            activeOpacity={0.7}
            disabled={!canAfford}
          >
            <Zap size={14} color={canAfford ? '#000' : Colors.textMuted} />
            <Text style={[qStyles.buyBtnText, !canAfford && qStyles.buyBtnTextDisabled]}>
              Acheter (500 Solar)
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </Pressable>
  );

  const renderConfirmContent = () => (
    <Pressable style={qStyles.confirmContent} onPress={() => {}}>
      <View style={qStyles.confirmIconWrap}>
        <AlertTriangle size={28} color={Colors.warning} />
      </View>
      <Text style={qStyles.confirmTitle}>Confirmation requise</Text>
      <Text style={qStyles.confirmDesc}>
        Confirmer l{"'"}achat de 1 <Text style={{ color: '#22D3EE', fontWeight: '700' as const }}>Bouclier Quantique</Text> pour{' '}
        <Text style={{ color: Colors.solar, fontWeight: '700' as const }}>500 Solar</Text> ?
      </Text>

      <View style={qStyles.balanceCard}>
        <View style={qStyles.balanceRow}>
          <Text style={qStyles.balanceLabel}>Solde actuel</Text>
          <Text style={qStyles.balanceValue}>{Math.floor(solarBalance)} Solar</Text>
        </View>
        <View style={qStyles.balanceSep} />
        <View style={qStyles.balanceRow}>
          <Text style={qStyles.balanceLabel}>Coût</Text>
          <Text style={[qStyles.balanceValue, { color: Colors.danger }]}>-500 Solar</Text>
        </View>
        <View style={qStyles.balanceSep} />
        <View style={qStyles.balanceRow}>
          <Text style={qStyles.balanceLabel}>Après achat</Text>
          <Text style={[qStyles.balanceValue, { color: solarBalance - 500 >= 0 ? Colors.success : Colors.danger }]}>
            {Math.floor(solarBalance - 500)} Solar
          </Text>
        </View>
      </View>

      <View style={qStyles.modalButtons}>
        <TouchableOpacity
          style={qStyles.closeBtn}
          onPress={() => setModalStep('lore')}
          activeOpacity={0.7}
        >
          <ChevronLeft size={14} color={Colors.textSecondary} />
          <Text style={qStyles.closeBtnText}>Retour</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[qStyles.confirmBtn, buyMutation.isPending && { opacity: 0.6 }]}
          onPress={handleBuy}
          activeOpacity={0.7}
          disabled={buyMutation.isPending}
        >
          {buyMutation.isPending ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Zap size={14} color="#000" />
          )}
          <Text style={qStyles.confirmBtnText}>
            {buyMutation.isPending ? 'Activation...' : 'Confirmer'}
          </Text>
        </TouchableOpacity>
      </View>

      {buyMutation.isError && (
        <View style={qStyles.errorBanner}>
          <Text style={qStyles.errorText}>
            {(buyMutation.error as unknown as Error)?.message ?? 'Erreur inconnue'}
          </Text>
        </View>
      )}

      {buyMutation.data && !buyMutation.data.success && (
        <View style={qStyles.errorBanner}>
          <Text style={qStyles.errorText}>{buyMutation.data.error}</Text>
        </View>
      )}
    </Pressable>
  );

  return (
    <>
      <TouchableOpacity
        style={[
          qStyles.card,
          isActive && qStyles.cardActive,
          isOnCooldown && qStyles.cardCooldown,
        ]}
        onPress={() => setModalStep('lore')}
        activeOpacity={0.7}
        testID="quantum-shield-card"
      >
        <View style={qStyles.iconWrap}>
          {isActive ? (
            <Animated.View style={{ opacity: pulseAnim }}>
              <ShieldCheck size={22} color="#22D3EE" />
            </Animated.View>
          ) : (
            <Shield size={22} color={isOnCooldown ? Colors.textMuted : Colors.primary} />
          )}
        </View>
        <View style={qStyles.textWrap}>
          <Text style={qStyles.title}>Bouclier Quantique</Text>
          {isActive ? (
            <Text style={qStyles.activeText}>
              Actif — {formatCountdown(localRemaining)}
            </Text>
          ) : isOnCooldown ? (
            <Text style={qStyles.cooldownText}>
              Recharge — {formatCountdown(localCooldown)}
            </Text>
          ) : (
            <Text style={qStyles.readyText}>Disponible (500 Solar)</Text>
          )}
        </View>
        {isActive && (
          <View style={qStyles.activeBadge}>
            <Text style={qStyles.activeBadgeText}>ON</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal
        visible={modalStep !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeModal}
      >
        <Pressable style={qStyles.overlay} onPress={closeModal}>
          {modalStep === 'lore' && renderLoreContent()}
          {modalStep === 'confirm' && renderConfirmContent()}
        </Pressable>
      </Modal>
    </>
  );
}

const qStyles = StyleSheet.create({
  card: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  cardActive: {
    borderColor: '#22D3EE40',
    backgroundColor: '#22D3EE08',
  },
  cardCooldown: {
    opacity: 0.7,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#22D3EE12',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  activeText: {
    color: '#22D3EE',
    fontSize: 12,
    fontWeight: '600' as const,
    marginTop: 2,
  },
  cooldownText: {
    color: Colors.warning,
    fontSize: 12,
    fontWeight: '500' as const,
    marginTop: 2,
  },
  readyText: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  activeBadge: {
    backgroundColor: '#22D3EE',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  activeBadgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 24,
  },
  modalContent: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: '#22D3EE30',
    alignItems: 'center' as const,
    ...(Platform.OS !== 'web' ? {
      shadowColor: '#22D3EE',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 20,
      elevation: 20,
    } : {}),
  },
  modalIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#22D3EE15',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 16,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800' as const,
    marginBottom: 12,
    textAlign: 'center' as const,
  },
  loreText: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center' as const,
    marginBottom: 16,
    fontStyle: 'italic' as const,
  },
  rulesCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
    marginBottom: 16,
  },
  ruleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  ruleText: {
    color: Colors.textSecondary,
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
  },
  statusBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: '#22D3EE15',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#22D3EE30',
    width: '100%',
    marginBottom: 16,
  },
  statusActiveText: {
    color: '#22D3EE',
    fontSize: 13,
    fontWeight: '700' as const,
  },
  statusBannerCooldown: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: Colors.warning + '15',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.warning + '30',
    width: '100%',
    marginBottom: 16,
  },
  statusCooldownText: {
    color: Colors.warning,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  modalButtons: {
    flexDirection: 'row' as const,
    gap: 10,
    width: '100%',
  },
  closeBtn: {
    flex: 1,
    flexDirection: 'row' as const,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 4,
  },
  closeBtnText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  buyBtn: {
    flex: 1,
    backgroundColor: '#22D3EE',
    borderRadius: 12,
    paddingVertical: 13,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
  },
  buyBtnDisabled: {
    backgroundColor: Colors.border,
  },
  buyBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '800' as const,
  },
  buyBtnTextDisabled: {
    color: Colors.textMuted,
  },
  confirmContent: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center' as const,
    ...(Platform.OS !== 'web' ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 16,
      elevation: 20,
    } : {}),
  },
  confirmIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.warning + '18',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 16,
  },
  confirmTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800' as const,
    marginBottom: 8,
    textAlign: 'center' as const,
  },
  confirmDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center' as const,
    marginBottom: 16,
  },
  balanceCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  balanceRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: 6,
  },
  balanceLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  balanceValue: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  balanceSep: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 2,
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: '#22D3EE',
    borderRadius: 12,
    paddingVertical: 13,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
  },
  confirmBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800' as const,
  },
  errorBanner: {
    backgroundColor: Colors.danger + '15',
    borderWidth: 1,
    borderColor: Colors.danger + '30',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 12,
    width: '100%',
  },
  errorText: {
    color: Colors.danger,
    fontSize: 12,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
  },
});
