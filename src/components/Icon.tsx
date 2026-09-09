/**
 * Circuit — "Current" icon system
 * All icons are 2px-stroke line marks that inherit `color` via currentColor.
 * Use the `Mark` export for the brand loop mark.
 */
import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

type IconName =
  | 'search' | 'plus' | 'person' | 'clipboard' | 'pin' | 'link'
  | 'arrow' | 'back' | 'close' | 'gear' | 'check' | 'star' | 'star-fill'
  | 'bell' | 'eye' | 'film' | 'phone' | 'switch' | 'logout' | 'storefront'
  | 'sparkles' | 'trophy' | 'mark';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  stroke?: number;
}

export function Icon({ name, size = 22, color = '#241D17', stroke = 2 }: IconProps) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
  };
  const s = { stroke: color, strokeWidth: stroke, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  switch (name) {
    case 'search':
      return <Svg {...props}><Circle cx="11" cy="11" r="7" {...s}/><Path d="M16.5 16.5L21 21" {...s}/></Svg>;
    case 'plus':
      return <Svg {...props}><Path d="M12 5v14M5 12h14" {...s}/></Svg>;
    case 'person':
      return <Svg {...props}><Circle cx="12" cy="8" r="4" {...s}/><Path d="M4 21c0-4.2 3.6-7 8-7s8 2.8 8 7" {...s}/></Svg>;
    case 'clipboard':
      return <Svg {...props}><Rect x="6" y="4" width="12" height="17" rx="2.5" {...s}/><Path d="M9 4.5a2 2 0 0 1 2-1.5h2a2 2 0 0 1 2 1.5M9 11h6M9 15h4" {...s}/></Svg>;
    case 'pin':
      return <Svg {...props}><Path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" {...s}/><Circle cx="12" cy="10" r="2.5" {...s}/></Svg>;
    case 'link':
      return <Svg {...props}><Path d="M10 14a4 4 0 0 0 6 .5l2-2a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-6-.5l-2 2A4 4 0 0 0 11.7 17l1-1" {...s}/></Svg>;
    case 'arrow':
      return <Svg {...props}><Path d="M5 12h13M13 6l6 6-6 6" {...s}/></Svg>;
    case 'back':
      return <Svg {...props}><Path d="M19 12H6M11 6l-6 6 6 6" {...s}/></Svg>;
    case 'close':
      return <Svg {...props}><Path d="M6 6l12 12M18 6L6 18" {...s}/></Svg>;
    case 'gear':
      return <Svg {...props}><Circle cx="12" cy="12" r="3" {...s}/><Path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9L5.3 5.3" {...s}/></Svg>;
    case 'check':
      return <Svg {...props}><Path d="M5 12.5l4.5 4.5L19 7" {...s}/></Svg>;
    case 'star':
      return <Svg {...props}><Path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8L3.5 9.7l5.9-.9z" {...s}/></Svg>;
    case 'star-fill':
      return <Svg {...props}><Path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8L3.5 9.7l5.9-.9z" fill={color} stroke="none"/></Svg>;
    case 'bell':
      return <Svg {...props}><Path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" {...s}/><Path d="M10 19a2 2 0 0 0 4 0" {...s}/></Svg>;
    case 'eye':
      return <Svg {...props}><Path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" {...s}/><Circle cx="12" cy="12" r="2.5" {...s}/></Svg>;
    case 'film':
      return <Svg {...props}><Rect x="3" y="4" width="18" height="16" rx="2.5" {...s}/><Path d="M8 4v16M16 4v16M3 9h5M16 9h5M3 15h5M16 15h5" {...s}/></Svg>;
    case 'phone':
      return <Svg {...props}><Rect x="6.5" y="2.5" width="11" height="19" rx="2.5" {...s}/><Path d="M10.5 18.5h3" {...s}/></Svg>;
    case 'switch':
      return <Svg {...props}><Path d="M4 8h13l-3-3M20 16H7l3 3" {...s}/></Svg>;
    case 'logout':
      return <Svg {...props}><Path d="M14 4h-7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7M15 12H9M16.5 8.5L20 12l-3.5 3.5" {...s}/></Svg>;
    case 'storefront':
      return <Svg {...props}><Path d="M4 9.5L5 4.5h14l1 5M4 9.5V20h16V9.5M4 9.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0M9.5 20v-5h5v5" {...s}/></Svg>;
    case 'sparkles':
      return <Svg {...props}><Path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z" {...s}/></Svg>;
    case 'trophy':
      return <Svg {...props}><Path d="M8 4h8v4a4 4 0 0 1-8 0zM8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 12v3M9 19h6M10 19l.5-4h3l.5 4" {...s}/></Svg>;
    default:
      return null;
  }
}

/** The "current wave" mark — AC waveform between two nodes */
export function Mark({ size = 26, color = '#C2623F', nodeColor = '#241D17' }: {
  size?: number;
  color?: string;
  nodeColor?: string;
}) {
  const h = size * (28 / 52);
  const sw = size < 24 ? 3.6 : 3.2;
  const nr = size < 24 ? 4 : 3.6;
  return (
    <Svg width={size} height={h} viewBox="0 0 52 28" fill="none">
      <Path d="M6 14 q5 -11 10 0 t10 0 t10 0" stroke={color} strokeWidth={sw} strokeLinecap="round" fill="none"/>
      <Circle cx="6" cy="14" r={nr} fill={nodeColor}/>
      <Circle cx="46" cy="14" r={nr} fill={color}/>
    </Svg>
  );
}

/** Monochrome social glyphs — no full-color brand logos */
export function SocialIcon({ kind, size = 16, color = '#241D17' }: {
  kind: 'ig' | 'tt';
  size?: number;
  color?: string;
}) {
  const s = { stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, fill: 'none' as const };
  if (kind === 'ig') return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke={color} strokeWidth="1.8"/>
      <Circle cx="12" cy="12" r="4" stroke={color} strokeWidth="1.8"/>
      <Circle cx="17" cy="7" r="1.2" fill={color}/>
    </Svg>
  );
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M13 4v9.5a3.5 3.5 0 1 1-3-3.46" {...s}/>
      <Path d="M13 4c.4 2.4 2 3.8 4.3 4" {...s}/>
    </Svg>
  );
}
