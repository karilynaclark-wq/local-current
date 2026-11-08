import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';
import { identifyUser, resetAnalytics } from '../lib/analytics';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id, session.user.email ?? '');
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id, session.user.email ?? '');
      else { setProfile(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string, email: string) {
    try {
      const { data } = await supabase.from('profiles').select('id, full_name, role, created_at, avatar_url, email_opt_out').eq('id', userId).single();
      setProfile(data ? ({ ...data, email } as any) : null);
      if (data) identifyUser(userId, { role: data.role });
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  return { session, profile, loading };
}
