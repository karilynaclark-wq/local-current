// Circuit — "Current" design system tokens
// Single source of truth. All screens import from here — no hard-coded hex anywhere.

export const C = {
  // Backgrounds
  paper:       '#FBF6EF',   // app background (warm linen)
  card:        '#FFFFFF',   // card / sheet surfaces

  // Text
  ink:         '#241D17',   // primary text, dark fills
  inkSoft:     '#3A322A',   // body copy in dense blocks
  muted:       '#8B8073',   // secondary text, subtitles
  muted2:      '#A89C8D',   // tertiary text, meta labels, inactive icons

  // Brand accent — clay
  accent:      '#C2623F',
  accentPress: '#A8512F',
  accentSoft:  '#F1DFD4',   // completed status bg, chip bg
  accentTint:  '#FBEEE6',   // subtle wash: icon tiles, seg track, focus ring

  // Borders
  line:        '#ECE2D6',   // hairline borders, dividers
  line2:       '#E3D8CA',   // stronger borders (inputs, ghost buttons)

  // Status: active/live
  ok:          '#6B8E5E',
  okSoft:      '#E4EDDF',

  // Status: claimed (creator in-progress)
  claimedText: '#7A6A2E',
  claimedBg:   '#F3EAD0',
  claimedDot:  '#C39A3A',
} as const;

export const R = {
  sm:   12,
  md:   16,
  lg:   22,
  btn:  16,
  pill: 999,
} as const;

// Shadows — use with StyleSheet.create shadow props
export const S = {
  card: {
    shadowColor: 'rgba(60,30,12,1)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 11,       // ~22px total spread mapped to RN
    elevation: 4,
  },
  button: {
    shadowColor: 'rgba(194,98,63,1)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.70,
    shadowRadius: 12,
    elevation: 6,
  },
  menu: {
    shadowColor: 'rgba(36,29,23,1)',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 25,
    elevation: 16,
  },
} as const;

// Font family names — must match what useFonts registers
export const F = {
  display:     'BricolageGrotesque_700Bold',
  displayXBold:'BricolageGrotesque_800ExtraBold',
  body:        'Figtree_400Regular',
  bodyMedium:  'Figtree_500Medium',
  bodySemi:    'Figtree_600SemiBold',
  bodyBold:    'Figtree_700Bold',
  mono:        'JetBrainsMono_400Regular',
  monoMedium:  'JetBrainsMono_500Medium',
  monoBold:    'JetBrainsMono_700Bold',
} as const;
