import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc, trpcClient } from "@/lib/trpc";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import MaintenanceScreen from "@/components/MaintenanceScreen";
import { GameProvider, useGame } from "@/contexts/GameContext";
import { FleetProvider } from "@/contexts/FleetContext";
import { AllianceProvider } from "@/contexts/AllianceContext";
import { TutorialProvider } from "@/contexts/TutorialContext";
import TutorialWidget from "@/components/TutorialWidget";
import Colors from "@/constants/colors";
import NotificationToast from "@/components/NotificationToast";
import GameAlertProvider from "@/components/GameAlert";
import { NotificationSettingsProvider } from "@/contexts/NotificationSettingsContext";

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const isMaintenanceMode = process.env.EXPO_PUBLIC_MAINTENANCE_MODE === 'true';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const { needsUsername, isLoading: gameLoading } = useGame();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || gameLoading) return;

    const inLogin = segments[0] === 'login';
    const inChooseUsername = segments[0] === 'choose-username';

    if (!isAuthenticated && !inLogin) {
      console.log('[AuthGate] Not authenticated, redirecting to login');
      router.replace('/login');
    } else if (isAuthenticated && inLogin) {
      if (needsUsername) {
        console.log('[AuthGate] Needs username, redirecting to choose-username');
        router.replace('/choose-username');
      } else {
        console.log('[AuthGate] Authenticated, redirecting to home');
        router.replace('/');
      }
    } else if (isAuthenticated && needsUsername && !inChooseUsername) {
      console.log('[AuthGate] Needs username, redirecting to choose-username');
      router.replace('/choose-username');
    } else if (isAuthenticated && !needsUsername && inChooseUsername) {
      console.log('[AuthGate] Has username, redirecting to home');
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, gameLoading, needsUsername, segments, router]);

  useEffect(() => {
    if (!isLoading) {
      void SplashScreen.hideAsync();
    }
  }, [isLoading]);

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerBackTitle: "Back",
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="choose-username" options={{ headerShown: false }} />
      <Stack.Screen name="messages" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="compose-message" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="message-detail" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="friends" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="send-fleet" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="fleet-overview" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="reports" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="espionage-report" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="combat-report" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="transport-report" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="statistics" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="colonies" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="colony-detail" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

export default function RootLayout() {
  if (isMaintenanceMode) {
    void SplashScreen.hideAsync();
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="light" />
        <MaintenanceScreen />
      </GestureHandlerRootView>
    );
  }

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView>
        <AuthProvider>
          <GameProvider>
            <FleetProvider>
              <AllianceProvider>
                <NotificationSettingsProvider>
                <TutorialProvider>
                  <StatusBar style="light" />
                  <GameAlertProvider>
                    <AuthGate>
                      <RootLayoutNav />
                      <TutorialWidget />
                      <NotificationToast />
                    </AuthGate>
                  </GameAlertProvider>
                </TutorialProvider>
                </NotificationSettingsProvider>
              </AllianceProvider>
            </FleetProvider>
          </GameProvider>
        </AuthProvider>
      </GestureHandlerRootView>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
