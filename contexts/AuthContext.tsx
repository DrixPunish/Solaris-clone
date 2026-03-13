import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/utils/supabase';

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log('[AuthContext] Checking initial session...');
    supabase.auth.getSession().then(({ data: { session: s }, error }) => {
      if (error) {
        console.warn('[AuthContext] Session restore error:', error.message);
        supabase.auth.signOut().catch(() => {});
        setSession(null);
        setUser(null);
        setIsLoading(false);
        return;
      }
      console.log('[AuthContext] Initial session:', s ? 'found' : 'none');
      setSession(s);
      setUser(s?.user ?? null);
      setIsLoading(false);
    }).catch((err) => {
      console.warn('[AuthContext] Unexpected session error:', err);
      supabase.auth.signOut().catch(() => {});
      setSession(null);
      setUser(null);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      console.log('[AuthContext] Auth state changed:', _event, s?.user?.email);
      if (_event === 'TOKEN_REFRESHED' && !s) {
        console.warn('[AuthContext] Token refresh failed, signing out');
        supabase.auth.signOut().catch(() => {});
        setSession(null);
        setUser(null);
        return;
      }
      if (_event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        setIsLoading(false);
        return;
      }
      setSession(s);
      setUser(s?.user ?? null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const sendOtp = useMutation({
    mutationFn: async (email: string) => {
      console.log('[AuthContext] Sending OTP to', email);
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
      return true;
    },
  });

  const verifyOtp = useMutation({
    mutationFn: async ({ email, token }: { email: string; token: string }) => {
      console.log('[AuthContext] Verifying OTP for', email);
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
      });
      if (error) throw error;
      console.log('[AuthContext] OTP verified, user:', data.user?.id);
      return data;
    },
  });

  const signOut = useCallback(async () => {
    console.log('[AuthContext] Signing out');
    await supabase.auth.signOut();
  }, []);

  return useMemo(() => ({
    session,
    user,
    isLoading,
    isAuthenticated: !!session,
    sendOtp,
    verifyOtp,
    signOut,
  }), [session, user, isLoading, sendOtp, verifyOtp, signOut]);
});
