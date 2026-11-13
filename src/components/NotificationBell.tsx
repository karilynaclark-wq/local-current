// Bell in the top right of Browse / My Currents. Red dot when anything is unread.

import React, { useCallback, useEffect, useState } from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { C } from '../theme';
import { Icon } from './Icon';

export default function NotificationBell() {
  const navigation = useNavigation<any>();
  const [unread, setUnread] = useState(false);
  const [uid, setUid] = useState<string | null>(null);

  const check = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUid(user.id);
    const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true })
      .eq('profile_id', user.id).is('read_at', null);
    setUnread((count ?? 0) > 0);
  }, []);

  useFocusEffect(useCallback(() => { check(); }, [check]));

  // New alerts while the screen is open.
  useEffect(() => {
    if (!uid) return;
    const ch = supabase.channel(`bell-${uid}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `profile_id=eq.${uid}` }, () => check())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [uid, check]);

  return (
    <TouchableOpacity onPress={() => navigation.navigate('Notifications')} hitSlop={10} style={st.btn}
      accessibilityLabel={unread ? 'Notifications, unread' : 'Notifications'}>
      <Icon name="bell" size={22} color={C.ink} />
      {unread && <View style={st.dot} />}
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  btn: { padding: 4 },
  dot: { position: 'absolute', top: 3, right: 4, width: 9, height: 9, borderRadius: 5, backgroundColor: '#D9412B', borderWidth: 1.5, borderColor: C.paper },
});
