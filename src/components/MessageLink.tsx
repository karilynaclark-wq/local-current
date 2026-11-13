// Small "Message …" entry point into an event thread, with an unread dot.
// variant 'link' = text row (creator event screen); 'icon' = chat icon (business lists).

import React, { useCallback, useState } from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { C, F } from '../theme';
import { Icon } from './Icon';

export default function MessageLink({ redemptionId, label, variant = 'link' }: {
  redemptionId: string; label?: string; variant?: 'link' | 'icon';
}) {
  const navigation = useNavigation<any>();
  const [unread, setUnread] = useState(0);

  useFocusEffect(useCallback(() => {
    supabase.rpc('unread_message_counts', { p_redemption_ids: [redemptionId] })
      .then(({ data }) => setUnread((data as any[])?.[0]?.unread ?? 0));
  }, [redemptionId]));

  const open = () => navigation.navigate('MessageThread', { redemptionId });

  if (variant === 'icon') {
    return (
      <TouchableOpacity onPress={open} hitSlop={8} style={st.iconBtn} accessibilityLabel="Message">
        <Icon name="chat" size={18} color={C.accent} />
        {unread > 0 && <View style={st.dot} />}
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity onPress={open} style={st.link} activeOpacity={0.7}>
      <Icon name="chat" size={16} color={C.accent} />
      <Text style={st.linkText}>{label ?? 'Message'}</Text>
      {unread > 0 && <View style={st.badge}><Text style={st.badgeText}>{unread}</Text></View>}
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  linkText: { fontFamily: F.bodySemi, fontSize: 14, color: C.accent },
  badge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#D9412B', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { fontFamily: F.bodySemi, fontSize: 11, color: '#fff' },
  iconBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: C.line2, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card },
  dot: { position: 'absolute', top: -1, right: -1, width: 10, height: 10, borderRadius: 5, backgroundColor: '#D9412B', borderWidth: 1.5, borderColor: C.card },
});
