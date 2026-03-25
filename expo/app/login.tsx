import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Mail, KeyRound, ArrowRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { showGameAlert } from '@/components/GameAlert';

type Step = 'email' | 'otp';

export default function LoginScreen() {
  const { sendOtp, verifyOtp } = useAuth();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const logoScale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 4,
        tension: 50,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleSendOtp = async () => {
    if (!email.trim() || !email.includes('@')) {
      showGameAlert('Erreur', 'Veuillez entrer une adresse email valide.');
      return;
    }
    try {
      await sendOtp.mutateAsync(email.trim().toLowerCase());
      setStep('otp');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      showGameAlert('Erreur', message);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length < 6) {
      showGameAlert('Erreur', 'Veuillez entrer le code à 6 chiffres.');
      return;
    }
    try {
      await verifyOtp.mutateAsync({ email: email.trim().toLowerCase(), token: otpCode });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Code invalide';
      showGameAlert('Erreur', message);
    }
  };

  const isLoading = sendOtp.isPending || verifyOtp.isPending;

  return (
    <LinearGradient
      colors={['#0A0A1A', '#0D1B2A', '#1B0A1A', '#0A0A1A']}
      locations={[0, 0.35, 0.7, 1]}
      style={styles.bg}
    >
      <View style={styles.glowOverlay} />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Animated.View
            style={[
              styles.logoWrap,
              { transform: [{ scale: logoScale }] },
            ]}
          >
            <View style={styles.logoCircle}>
              <Image
                source={require('@/assets/images/icon.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.title}>SOLARIS</Text>
            <Text style={styles.subtitle}>Conquérez la galaxie</Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.formCard,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            {step === 'email' ? (
              <>
                <Text style={styles.formTitle}>Connexion</Text>
                <Text style={styles.formDesc}>
                  Entrez votre email pour recevoir un code de vérification.
                </Text>
                <View style={styles.inputWrap}>
                  <Mail size={18} color={Colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="votre@email.com"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={email}
                    onChangeText={setEmail}
                    editable={!isLoading}
                    testID="email-input"
                  />
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.button,
                    pressed && styles.buttonPressed,
                    isLoading && styles.buttonDisabled,
                  ]}
                  onPress={handleSendOtp}
                  disabled={isLoading}
                  testID="send-otp-button"
                >
                  {isLoading ? (
                    <ActivityIndicator color={Colors.background} size="small" />
                  ) : (
                    <>
                      <Text style={styles.buttonText}>Envoyer le code</Text>
                      <ArrowRight size={16} color={Colors.background} />
                    </>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.formTitle}>Vérification</Text>
                <Text style={styles.formDesc}>
                  Un code a été envoyé à{' '}
                  <Text style={styles.emailHighlight}>{email}</Text>
                </Text>
                <View style={styles.inputWrap}>
                  <KeyRound size={18} color={Colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="000000"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="number-pad"
                    maxLength={6}
                    value={otpCode}
                    onChangeText={setOtpCode}
                    editable={!isLoading}
                    testID="otp-input"
                  />
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.button,
                    pressed && styles.buttonPressed,
                    isLoading && styles.buttonDisabled,
                  ]}
                  onPress={handleVerifyOtp}
                  disabled={isLoading}
                  testID="verify-otp-button"
                >
                  {isLoading ? (
                    <ActivityIndicator color={Colors.background} size="small" />
                  ) : (
                    <>
                      <Text style={styles.buttonText}>Vérifier</Text>
                      <ArrowRight size={16} color={Colors.background} />
                    </>
                  )}
                </Pressable>
                <Pressable
                  style={styles.backLink}
                  onPress={() => {
                    setStep('email');
                    setOtpCode('');
                  }}
                >
                  <Text style={styles.backLinkText}>Changer d&apos;email</Text>
                </Pressable>
              </>
            )}
          </Animated.View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Première connexion ? Un compte sera créé automatiquement.
            </Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
  },
  glowOverlay: {
    position: 'absolute',
    top: '15%',
    left: '20%',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(196, 150, 50, 0.06)',
  },
  safe: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(196, 150, 50, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(196, 150, 50, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  logoImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  title: {
    color: '#D4A843',
    fontSize: 34,
    fontWeight: '800' as const,
    letterSpacing: 8,
  },
  subtitle: {
    color: '#8B7355',
    fontSize: 14,
    marginTop: 6,
    letterSpacing: 2,
  },
  formCard: {
    backgroundColor: 'rgba(13, 20, 40, 0.85)',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(196, 150, 50, 0.15)',
  },
  formTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '700' as const,
    marginBottom: 6,
  },
  formDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 20,
  },
  emailHighlight: {
    color: '#D4A843',
    fontWeight: '600' as const,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10, 15, 30, 0.7)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196, 150, 50, 0.12)',
    paddingHorizontal: 14,
    gap: 10,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    paddingVertical: 14,
  },
  button: {
    backgroundColor: '#C49632',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#0A0A1A',
    fontSize: 15,
    fontWeight: '700' as const,
  },
  backLink: {
    alignItems: 'center',
    marginTop: 14,
  },
  backLinkText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  footer: {
    marginTop: 30,
    alignItems: 'center',
  },
  footerText: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
});
