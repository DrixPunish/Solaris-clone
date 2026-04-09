import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangle, RotateCcw } from 'lucide-react-native';
import Colors from '@/constants/colors';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    console.log('[ErrorBoundary] Caught error:', error.message);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    console.error('[ErrorBoundary] Error:', error.message, error.stack);
  }

  handleRestart = () => {
    console.log('[ErrorBoundary] User pressed restart');
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <SafeAreaView style={styles.safeArea}>
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <View style={styles.iconWrap}>
                <AlertTriangle size={48} color={Colors.warning} />
              </View>
              <Text style={styles.title}>Une erreur est survenue</Text>
              <Text style={styles.message}>
                L'application a rencontré un problème inattendu. Appuyez sur le bouton ci-dessous pour relancer.
              </Text>
              {this.state.error?.message ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText} numberOfLines={6}>
                    {this.state.error.message}
                  </Text>
                </View>
              ) : null}
              <TouchableOpacity style={styles.restartBtn} onPress={this.handleRestart} activeOpacity={0.7}>
                <RotateCcw size={18} color="#0A0A14" />
                <Text style={styles.restartText}>Relancer l'application</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.warning + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
    marginBottom: 12,
  },
  message: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center' as const,
    lineHeight: 21,
    marginBottom: 20,
  },
  errorBox: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.danger + '30',
    width: '100%',
  },
  errorText: {
    color: Colors.danger,
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  restartBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  restartText: {
    color: '#0A0A14',
    fontSize: 15,
    fontWeight: '700' as const,
  },
});
