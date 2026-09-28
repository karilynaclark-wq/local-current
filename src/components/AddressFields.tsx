// Street / City / State / Zip inputs for a business address.

import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { C, F, R } from '../theme';
import type { AddressParts } from '../lib/address';

export default function AddressFields({ value, onChange, required }: {
  value: AddressParts;
  onChange: (next: AddressParts) => void;
  required?: boolean;
}) {
  const set = (key: keyof AddressParts) => (text: string) => onChange({ ...value, [key]: text });
  const star = required ? ' *' : '';

  return (
    <View>
      <Text style={styles.label}>Street address{star}</Text>
      <TextInput
        style={styles.input} value={value.street} onChangeText={set('street')}
        placeholder="123 Main St" placeholderTextColor={C.muted2}
        autoCapitalize="words" textContentType="streetAddressLine1"
      />

      <Text style={styles.label}>City{star}</Text>
      <TextInput
        style={styles.input} value={value.city} onChangeText={set('city')}
        placeholder="Chicago" placeholderTextColor={C.muted2}
        autoCapitalize="words" textContentType="addressCity"
      />

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>State{star}</Text>
          <TextInput
            style={styles.input} value={value.state}
            onChangeText={t => set('state')(t.toUpperCase())}
            placeholder="IL" placeholderTextColor={C.muted2}
            autoCapitalize="characters" maxLength={2} textContentType="addressState"
          />
        </View>
        <View style={{ flex: 1.4 }}>
          <Text style={styles.label}>Zip code{star}</Text>
          <TextInput
            style={styles.input} value={value.zip} onChangeText={set('zip')}
            placeholder="60601" placeholderTextColor={C.muted2}
            keyboardType="number-pad" maxLength={5} textContentType="postalCode"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: F.bodySemi, fontSize: 13, color: C.inkSoft, marginTop: 14, marginBottom: 5 },
  input: {
    fontFamily: F.body, borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md,
    padding: 13, fontSize: 15, color: C.ink, backgroundColor: C.card,
  },
  row: { flexDirection: 'row', gap: 12 },
});
