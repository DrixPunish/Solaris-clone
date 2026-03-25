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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserCircle, ArrowRight, Rocket } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useGame } from '@/contexts/GameContext';
import { showGameAlert } from '@/components/GameAlert';

export default function ChooseUsernameScreen() {
  const { setUsername } = useGame();
  const router = useRouter();
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 3) {
      showGameAlert('Erreur', 'Le pseudo doit contenir au moins 3 caractères.');
      return;
    }
    if (trimmed.length > 20) {
      showGameAlert('Erreur', 'Le pseudo ne peut pas dépasser 20 caractères.');
      return;
    }
    if (!/^[a-zA-Z0-9_\-]+$/.test(trimmed)) {
      showGameAlert('Erreur', 'Le pseudo ne peut contenir que des lettres, chiffres, tirets et underscores.');
      return;
    }

    setIsSubmitting(true);
    try {
      setUsername(trimmed);
      console.log('[ChooseUsername] Username set to:', trimmed);
      router.replace('/');
    } catch (err) {
      console.log('[ChooseUsername] Error:', err);
      showGameAlert('Erreur', 'Impossible de sauvegarder le pseudo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.bg}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.logoWrap}>
            <View style={styles.logoCircle}>
              <Rocket size={36} color={Colors.primary} />
            </View>
            <Text style={styles.title}>SOLARIS</Text>
          </View>

          <Animated.View
            style={[
              styles.formCard,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <Text style={styles.formTitle}>Choisissez votre pseudo</Text>
            <Text style={styles.formDesc}>
              Ce nom sera visible par les autres joueurs dans la galaxie.
            </Text>

            <View style={styles.inputWrap}>
              <UserCircle size={18} color={Colors.textMuted} />
              <TextInput
                style={styles.input}
                placeholder="Commandant_42"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
                value={name}
                onChangeText={setName}
                editable={!isSubmitting}
                testID="username-input"
              />
            </View>

            <Text style={styles.hint}>3-20 caractères (lettres, chiffres, _ , -)</Text>

            <Pressable
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
                isSubmitting && styles.buttonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={isSubmitting}
              testID="submit-username-button"
            >
              {isSubmitting ? (
                <ActivityIndicator color={Colors.background} size="small" />
              ) : (
                <>
                  <Text style={styles.buttonText}>Commencer l&apos;aventure</Text>
                  <ArrowRight size={16} color={Colors.background} />
                </>
              )}
            </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: Colors.background,
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
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary + '15',
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '800' as const,
    letterSpacing: 5,
  },
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
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
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    gap: 10,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    paddingVertical: 14,
  },
  hint: {
    color: Colors.textMuted,
    fontSize: 11,
    marginBottom: 18,
    marginLeft: 4,
  },
  button: {
    backgroundColor: Colors.primary,
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
    color: Colors.background,
    fontSize: 15,
    fontWeight: '700' as const,
  },
});
