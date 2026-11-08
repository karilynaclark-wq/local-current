// Simple month-grid date picker (pure JS, no native module).

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C, F, R } from '../theme';
import { Icon } from './Icon';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export default function DatePicker({ value, onChange, minDate }: {
  value: Date | null;
  onChange: (d: Date) => void;
  minDate?: Date;
}) {
  const start = value ?? minDate ?? new Date();
  const [month, setMonth] = useState(new Date(start.getFullYear(), start.getMonth(), 1));
  const min = minDate ? new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()) : null;

  const first = month.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const canPrev = !min || month > new Date(min.getFullYear(), min.getMonth(), 1);

  return (
    <View style={st.wrap}>
      <View style={st.head}>
        <TouchableOpacity onPress={() => canPrev && setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          style={[st.nav, !canPrev && { opacity: 0.3 }]} disabled={!canPrev} hitSlop={8}>
          <Icon name="back" size={16} color={C.ink} />
        </TouchableOpacity>
        <Text style={st.month}>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
        <TouchableOpacity onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} style={st.nav} hitSlop={8}>
          <Icon name="arrow" size={16} color={C.ink} />
        </TouchableOpacity>
      </View>
      <View style={st.row}>
        {DOW.map((d, i) => <Text key={i} style={st.dow}>{d}</Text>)}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, w) => (
        <View key={w} style={st.row}>
          {cells.slice(w * 7, w * 7 + 7).map((d, i) => {
            if (!d) return <View key={i} style={st.cell} />;
            const date = new Date(month.getFullYear(), month.getMonth(), d);
            const disabled = !!min && date < min;
            const on = !!value && sameDay(date, value);
            return (
              <TouchableOpacity key={i} style={st.cell} disabled={disabled} onPress={() => onChange(date)} activeOpacity={0.7}>
                <View style={[st.day, on && st.dayOn]}>
                  <Text style={[st.dayText, disabled && { color: C.line2 }, on && { color: '#fff', fontFamily: F.bodySemi }]}>{d}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md, backgroundColor: C.card, padding: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  nav: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  month: { fontFamily: F.bodySemi, fontSize: 15, color: C.ink },
  row: { flexDirection: 'row' },
  dow: { flex: 1, textAlign: 'center', fontFamily: F.body, fontSize: 12, color: C.muted2, paddingVertical: 4 },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: C.accent },
  dayText: { fontFamily: F.body, fontSize: 14.5, color: C.ink },
} as any);
