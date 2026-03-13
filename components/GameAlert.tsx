import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
} from 'react-native';
import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';

interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface AlertConfig {
  title: string;
  message?: string;
  buttons?: AlertButton[];
  type?: 'info' | 'success' | 'error' | 'warning' | 'confirm';
}

let showAlertFn: ((config: AlertConfig) => void) | null = null;

export function showGameAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  type?: AlertConfig['type'],
) {
  if (showAlertFn) {
    showAlertFn({ title, message, buttons, type });
  }
}

export default function GameAlertProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;

  const show = useCallback((cfg: AlertConfig) => {
    setConfig(cfg);
    setVisible(true);
    fadeAnim.setValue(0);
    scaleAnim.setValue(0.85);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  const hide = useCallback((callback?: () => void) => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.85,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
      setConfig(null);
      callback?.();
    });
  }, [fadeAnim, scaleAnim]);

  useEffect(() => {
    showAlertFn = show;
    return () => {
      showAlertFn = null;
    };
  }, [show]);

  const handleButtonPress = useCallback((button: AlertButton) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    hide(button.onPress);
  }, [hide]);

  const handleBackdropPress = useCallback(() => {
    const hasCancel = config?.buttons?.some(b => b.style === 'cancel');
    if (hasCancel) {
      const cancelBtn = config?.buttons?.find(b => b.style === 'cancel');
      hide(cancelBtn?.onPress);
    } else {
      const firstBtn = config?.buttons?.[0];
      hide(firstBtn?.onPress);
    }
  }, [config, hide]);

  const alertType = config?.type ?? detectType(config);

  const iconMap = {
    info: <Info size={28} color={Colors.primary} />,
    success: <CheckCircle size={28} color={Colors.success} />,
    error: <XCircle size={28} color={Colors.danger} />,
    warning: <AlertTriangle size={28} color={Colors.warning} />,
    confirm: <Info size={28} color={Colors.primary} />,
  };

  const accentMap = {
    info: Colors.primary,
    success: Colors.success,
    error: Colors.danger,
    warning: Colors.warning,
    confirm: Colors.primary,
  };

  const buttons = config?.buttons ?? [{ text: 'OK', style: 'default' as const }];
  const accent = accentMap[alertType ?? 'info'];

  return (
    <>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={handleBackdropPress}
      >
        <TouchableWithoutFeedback onPress={handleBackdropPress}>
          <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
            <TouchableWithoutFeedback>
              <Animated.View
                style={[
                  styles.alertBox,
                  {
                    opacity: fadeAnim,
                    transform: [{ scale: scaleAnim }],
                    borderColor: accent + '30',
                  },
                ]}
              >
                <View style={[styles.accentBar, { backgroundColor: accent }]} />

                <View style={styles.contentWrap}>
                  <View style={[styles.iconCircle, { backgroundColor: accent + '15' }]}>
                    {iconMap[alertType ?? 'info']}
                  </View>

                  <Text style={styles.title}>{config?.title}</Text>

                  {config?.message ? (
                    <Text style={styles.message}>{config.message}</Text>
                  ) : null}
                </View>

                <View style={[styles.buttonRow, buttons.length === 1 && styles.buttonRowSingle]}>
                  {buttons.map((btn, i) => {
                    const isDestructive = btn.style === 'destructive';
                    const isCancel = btn.style === 'cancel';
                    const btnColor = isDestructive
                      ? Colors.danger
                      : isCancel
                        ? Colors.textMuted
                        : accent;

                    return (
                      <TouchableOpacity
                        key={i}
                        style={[
                          styles.button,
                          isCancel && styles.buttonCancel,
                          !isCancel && { backgroundColor: btnColor + '18', borderColor: btnColor + '40' },
                          buttons.length === 1 && styles.buttonFull,
                        ]}
                        onPress={() => handleButtonPress(btn)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.buttonText,
                            { color: isCancel ? Colors.textSecondary : btnColor },
                            isDestructive && styles.buttonTextDestructive,
                          ]}
                        >
                          {btn.text}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </Animated.View>
            </TouchableWithoutFeedback>
          </Animated.View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

function detectType(config: AlertConfig | null): AlertConfig['type'] {
  if (!config) return 'info';
  const t = config.title.toLowerCase();
  if (t.includes('erreur') || t.includes('error')) return 'error';
  if (t.includes('succès') || t.includes('envoyé') || t.includes('success')) return 'success';
  if (t.includes('attention') || t.includes('limite') || t.includes('pas de')) return 'warning';
  if (config.buttons && config.buttons.length > 1) return 'confirm';
  return 'info';
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 5, 10, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  alertBox: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  accentBar: {
    height: 3,
    width: '100%',
  },
  contentWrap: {
    padding: 24,
    alignItems: 'center',
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
    marginBottom: 8,
  },
  message: {
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center' as const,
    lineHeight: 19,
  },
  buttonRow: {
    flexDirection: 'row' as const,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: 12,
    gap: 8,
  },
  buttonRowSingle: {
    justifyContent: 'center' as const,
  },
  button: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  buttonCancel: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  buttonFull: {
    flex: 0,
    paddingHorizontal: 40,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  buttonTextDestructive: {
    fontWeight: '700' as const,
  },
});
