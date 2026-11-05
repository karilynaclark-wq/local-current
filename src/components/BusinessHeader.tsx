// Business profile header (own profile and the public one creators see):
// centered logo, name, social handle pills, address line, about, website.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Linking, ActivityIndicator } from 'react-native';
import { C, F, R } from '../theme';
import { Icon, SocialIcon } from './Icon';

export default function BusinessHeader({ business, neighborhood, onAvatarPress, uploading }: {
  business: any;
  neighborhood?: string | null;
  /** Own profile only: tap the logo to upload a new one. */
  onAvatarPress?: () => void;
  uploading?: boolean;
}) {
  const ig = business?.instagram_handle?.replace('@', '');
  const tt = business?.tiktok_handle?.replace('@', '');
  const place = (business?.address ?? '').trim(); // full address, e.g. "1234 Street, Chicago, IL 60601"

  const avatar = (
    <View style={styles.avatar}>
      {business?.avatar_url ? (
        <Image source={{ uri: business.avatar_url }} style={styles.avatarImage} />
      ) : (
        <Icon name="storefront" size={36} color={C.muted2} />
      )}
      {uploading && (
        <View style={styles.avatarOverlay}><ActivityIndicator color="#fff" /></View>
      )}
    </View>
  );

  return (
    <View style={styles.wrap}>
      {onAvatarPress ? (
        <TouchableOpacity onPress={onAvatarPress} activeOpacity={0.85}>
          {avatar}
          <View style={styles.plusBadge}><Icon name="plus" size={13} color="#fff" stroke={2.4} /></View>
        </TouchableOpacity>
      ) : avatar}

      <Text style={styles.name}>{business?.business_name ?? '—'}</Text>

      {(ig || tt) && (
        <View style={styles.pills}>
          {ig ? (
            <TouchableOpacity style={styles.pill} accessibilityLabel={`Instagram @${ig}`} onPress={() => Linking.openURL(`https://www.instagram.com/${ig}`)} activeOpacity={0.7}>
              <SocialIcon kind="ig" size={20} color={C.ink} />
            </TouchableOpacity>
          ) : null}
          {tt ? (
            <TouchableOpacity style={styles.pill} accessibilityLabel={`TikTok @${tt}`} onPress={() => Linking.openURL(`https://www.tiktok.com/@${tt}`)} activeOpacity={0.7}>
              <SocialIcon kind="tt" size={20} color={C.ink} />
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {!!place && (
        <View style={styles.placeRow}>
          <Icon name="pin" size={13} color={C.muted} />
          <Text style={styles.placeText}>{place}</Text>
        </View>
      )}

      {!!business?.description && <Text style={styles.about}>{business.description}</Text>}

      {!!business?.website && (
        <TouchableOpacity onPress={() => Linking.openURL(business.website)} style={styles.webRow} activeOpacity={0.7}>
          <Icon name="link" size={13} color={C.accent} />
          <Text style={styles.webText} numberOfLines={1}>{business.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 18, gap: 10 },
  avatar: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: C.accentTint, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImage: { width: 96, height: 96 },
  avatarOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  plusBadge: {
    position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14,
    borderWidth: 2, borderColor: C.paper, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
  },
  name: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 28, letterSpacing: -0.5, color: C.ink, textAlign: 'center', marginTop: 2 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  pill: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: C.card,
    borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center',
  },
  pillText: { fontFamily: F.bodySemi, fontSize: 14, color: C.ink },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  placeText: { fontFamily: F.body, fontSize: 13.5, color: C.muted },
  about: { fontFamily: F.body, fontSize: 14.5, lineHeight: 21, color: C.inkSoft, textAlign: 'center', maxWidth: 340 },
  webRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  webText: { fontFamily: F.bodySemi, fontSize: 13.5, color: C.accent },
} as any);
