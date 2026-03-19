import { Tabs } from "expo-router";
import { Globe, Hammer, FlaskConical, Rocket, Compass, Shield, Trophy } from "lucide-react-native";
import React from "react";
import { StyleSheet, Platform, View, Text } from "react-native";
import Colors from "@/constants/colors";
import { useAlliance } from "@/contexts/AllianceContext";

function AllianceTabIcon({ color, size }: { color: string; size: number }) {
  const { totalNotifications } = useAlliance();
  return (
    <View style={badgeStyles.iconWrap}>
      <Shield size={size} color={color} />
      {totalNotifications > 0 && (
        <View style={badgeStyles.badge}>
          <Text style={badgeStyles.badgeText}>
            {totalNotifications > 99 ? '99+' : totalNotifications}
          </Text>
        </View>
      )}
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  iconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  badge: {
    position: 'absolute' as const,
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700' as const,
    lineHeight: 12,
  },
});

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          ...(Platform.OS !== 'web' ? {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -3 },
            shadowOpacity: 0.15,
            shadowRadius: 6,
            elevation: 10,
          } : {}),
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: "600" as const,
          letterSpacing: 0.2,
        },
      }}
    >
      <Tabs.Screen
        name="(planet)"
        options={{
          title: "Planète",
          tabBarIcon: ({ color, size }) => <Globe size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="buildings"
        options={{
          title: "Bâtiments",
          tabBarIcon: ({ color, size }) => <Hammer size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="research"
        options={{
          title: "Recherche",
          tabBarIcon: ({ color, size }) => <FlaskConical size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="shipyard"
        options={{
          title: "Chantier",
          tabBarIcon: ({ color, size }) => <Rocket size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="galaxy"
        options={{
          title: "Atlas",
          tabBarIcon: ({ color, size }) => <Compass size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: "Classement",
          tabBarIcon: ({ color, size }) => <Trophy size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="alliance"
        options={{
          title: "Alliance",
          tabBarIcon: ({ color, size }) => <AllianceTabIcon color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
