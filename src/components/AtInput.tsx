import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  style?: object;
}

// Strips any leading @ the user types so we don't double up
function stripAt(text: string) {
  return text.startsWith('@') ? text.slice(1) : text;
}

export default function AtInput({ value, onChangeText, placeholder = 'yourhandle', style }: Props) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.atBox}>
        <Text style={styles.at}>@</Text>
      </View>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={t => onChangeText(stripAt(t))}
        placeholder={placeholder}
        placeholderTextColor="#CBD5E1"
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  atBox: {
    paddingHorizontal: 12,
    paddingVertical: 13,
    backgroundColor: '#F8FAFC',
    borderRightWidth: 1.5,
    borderRightColor: '#E2E8F0',
  },
  at: {
    fontSize: 15,
    fontWeight: '700',
    color: '#94A3B8',
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 13,
    fontSize: 15,
    color: '#0F172A',
  },
});
