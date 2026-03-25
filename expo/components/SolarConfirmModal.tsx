import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TouchableOpacity, Platform } from 'react-native';
import { AlertTriangle, Zap } from 'lucide-react-native';
import Colors from '@/constants/colors';

interface SolarConfirmModalProps {
  visible: boolean;
  solarCost: number;
  solarBalance: number;
  actionDescription: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function SolarConfirmModal({ visible, solarCost, solarBalance, actionDescription, onConfirm, onCancel }: SolarConfirmModalProps) {
  const balanceAfter = solarBalance - solarCost;
  const canAfford = solarBalance >= solarCost;

  const handleConfirm = useCallback(() => {
    if (canAfford) {
      onConfirm();
    }
  }, [canAfford, onConfirm]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <Pressable style={scStyles.overlay} onPress={onCancel}>
        <Pressable style={scStyles.content} onPress={() => {}}>
          <View style={scStyles.iconWrap}>
            <AlertTriangle size={28} color={Colors.warning} />
          </View>
          <Text style={scStyles.title}>Confirmation requise</Text>
          <Text style={scStyles.desc}>
            Vous allez dépenser <Text style={scStyles.highlight}>{solarCost} $SOLAR</Text> pour {actionDescription}.
          </Text>

          <View style={scStyles.balanceCard}>
            <View style={scStyles.balanceRow}>
              <Text style={scStyles.balanceLabel}>Solde actuel</Text>
              <View style={scStyles.balanceValueRow}>
                <Zap size={12} color={Colors.solar} />
                <Text style={scStyles.balanceValue}>{solarBalance} $SOLAR</Text>
              </View>
            </View>
            <View style={scStyles.separator} />
            <View style={scStyles.balanceRow}>
              <Text style={scStyles.balanceLabel}>Coût</Text>
              <Text style={[scStyles.balanceValue, { color: Colors.danger }]}>-{solarCost} $SOLAR</Text>
            </View>
            <View style={scStyles.separator} />
            <View style={scStyles.balanceRow}>
              <Text style={scStyles.balanceLabel}>Solde après</Text>
              <Text style={[scStyles.balanceValue, { color: balanceAfter >= 0 ? Colors.success : Colors.danger }]}>
                {balanceAfter} $SOLAR
              </Text>
            </View>
          </View>

          {!canAfford && (
            <View style={scStyles.errorBanner}>
              <Text style={scStyles.errorText}>Solde insuffisant !</Text>
            </View>
          )}

          <View style={scStyles.buttons}>
            <TouchableOpacity style={scStyles.btnCancel} onPress={onCancel} activeOpacity={0.7}>
              <Text style={scStyles.btnCancelText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[scStyles.btnConfirm, !canAfford && scStyles.btnConfirmDisabled]}
              onPress={handleConfirm}
              activeOpacity={0.7}
              disabled={!canAfford}
            >
              <Zap size={14} color={canAfford ? '#000' : Colors.textMuted} />
              <Text style={[scStyles.btnConfirmText, !canAfford && scStyles.btnConfirmTextDisabled]}>Confirmer</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const scStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    ...(Platform.OS !== 'web' ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 16,
      elevation: 20,
    } : {}),
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.warning + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800' as const,
    marginBottom: 8,
    textAlign: 'center',
  },
  desc: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
  },
  highlight: {
    color: Colors.solar,
    fontWeight: '700' as const,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  balanceValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
    fontVariant: ['tabular-nums'] as const,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 2,
  },
  errorBanner: {
    backgroundColor: Colors.danger + '15',
    borderWidth: 1,
    borderColor: Colors.danger + '30',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
    width: '100%',
  },
  errorText: {
    color: Colors.danger,
    fontSize: 12,
    fontWeight: '700' as const,
    textAlign: 'center',
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  btnCancel: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnCancelText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  btnConfirm: {
    flex: 1,
    backgroundColor: Colors.solar,
    borderRadius: 12,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnConfirmDisabled: {
    backgroundColor: Colors.border,
  },
  btnConfirmText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800' as const,
  },
  btnConfirmTextDisabled: {
    color: Colors.textMuted,
  },
});
