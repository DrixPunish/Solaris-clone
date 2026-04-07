import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect, useCallback, useMemo } from 'react';

const STORAGE_KEY = 'solaris_notification_settings';

interface NotificationSettings {
  buildPopups: boolean;
  attackBanner: boolean;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  buildPopups: true,
  attackBanner: true,
};

export const [NotificationSettingsProvider, useNotificationSettings] = createContextHook(() => {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<NotificationSettings>;
          setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        } catch (e) {
          console.log('[NotifSettings] Error parsing settings:', e);
        }
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const updateSetting = useCallback(<K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return useMemo(() => ({
    settings,
    loaded,
    updateSetting,
  }), [settings, loaded, updateSetting]);
});
