/**
 * Merchant detection from free-text transaction descriptions.
 *
 * Transactions don't carry a merchant column — the merchant is embedded in the
 * description the AI parser wrote ("Swiggy Instamart Groceries: milk, ...",
 * "Zepto Groceries: ...", "Star Bazaar Groceries: ..."). This module pulls it
 * back out with a rule table so merchant KPIs are instant, free, and offline.
 *
 * THE ORDERING RULE: patterns are matched most-specific-first, and the first
 * hit wins. "Swiggy Instamart" is a grocery run and "Swiggy" is a restaurant
 * order — they are different KPIs and must not collapse into each other. Same
 * for Amazon Now vs Amazon, Flipkart Minutes vs Flipkart, Zepto Cafe vs Zepto.
 * Anything added below must respect `specificity`: higher wins.
 */

export type MerchantGroup = 'quick_commerce' | 'food_delivery' | 'ecommerce' | 'grocery' | 'travel' | 'other';

export interface MerchantRule {
  /** Stable key used in URLs and as a React key. */
  id: string;
  /** Display name shown on the KPI tile. */
  name: string;
  group: MerchantGroup;
  /**
   * Higher wins when several rules match the same description. Multi-word
   * brands ("swiggy instamart") must outrank their prefix ("swiggy").
   */
  specificity: number;
  /** Matched case-insensitively against the normalized description. */
  patterns: RegExp[];
}

/**
 * Word-ish boundary that tolerates the punctuation these descriptions use:
 * "Zepto:", "(Blinkit)", "Swiggy-Instamart", "Zepto/Blinkit".
 */
function brand(...alternatives: string[]): RegExp {
  const body = alternatives.map(a => a.replace(/\s+/g, '[\\s\\-_.]*')).join('|');
  return new RegExp(`(?:^|[^a-z0-9])(?:${body})(?:$|[^a-z0-9])`, 'i');
}

export const MERCHANT_RULES: MerchantRule[] = [
  // --- Quick commerce (10-minute delivery) ---------------------------------
  // Specificity 30: two-word brands that contain a one-word brand.
  { id: 'swiggy-instamart', name: 'Swiggy Instamart', group: 'quick_commerce', specificity: 30,
    patterns: [brand('swiggy instamart', 'swiggy insta mart', 'instamart', 'insta mart')] },
  { id: 'flipkart-minutes', name: 'Flipkart Minutes', group: 'quick_commerce', specificity: 30,
    patterns: [brand('flipkart minutes', 'flipkart minute')] },
  { id: 'amazon-now', name: 'Amazon Now', group: 'quick_commerce', specificity: 30,
    patterns: [brand('amazon now', 'amazon fresh')] },
  { id: 'zepto-cafe', name: 'Zepto Cafe', group: 'food_delivery', specificity: 30,
    patterns: [brand('zepto cafe', 'zepto café')] },
  { id: 'bigbasket-now', name: 'BB Now', group: 'quick_commerce', specificity: 30,
    patterns: [brand('bb now', 'bigbasket now', 'big basket now')] },

  // Specificity 20: single-word quick-commerce brands.
  { id: 'zepto', name: 'Zepto', group: 'quick_commerce', specificity: 20, patterns: [brand('zepto')] },
  { id: 'blinkit', name: 'Blinkit', group: 'quick_commerce', specificity: 20, patterns: [brand('blinkit', 'grofers')] },
  { id: 'dunzo', name: 'Dunzo', group: 'quick_commerce', specificity: 20, patterns: [brand('dunzo')] },

  // --- Food delivery / dining ----------------------------------------------
  { id: 'swiggy', name: 'Swiggy', group: 'food_delivery', specificity: 10, patterns: [brand('swiggy')] },
  { id: 'zomato', name: 'Zomato', group: 'food_delivery', specificity: 20, patterns: [brand('zomato', 'eternal')] },
  { id: 'eatsure', name: 'EatSure', group: 'food_delivery', specificity: 20, patterns: [brand('eatsure', 'faasos', 'behrouz', 'ovenstory')] },
  { id: 'dominos', name: "Domino's", group: 'food_delivery', specificity: 20, patterns: [brand("domino s", 'dominos', 'domino')] },
  { id: 'kfc', name: 'KFC', group: 'food_delivery', specificity: 20, patterns: [brand('kfc')] },
  { id: 'mcdonalds', name: "McDonald's", group: 'food_delivery', specificity: 20, patterns: [brand('mcdonald s', 'mcdonalds', 'mcd')] },
  { id: 'starbucks', name: 'Starbucks', group: 'food_delivery', specificity: 20, patterns: [brand('starbucks')] },
  { id: 'third-wave', name: 'Third Wave Coffee', group: 'food_delivery', specificity: 20, patterns: [brand('third wave')] },
  { id: 'chaayos', name: 'Chaayos', group: 'food_delivery', specificity: 20, patterns: [brand('chaayos', 'chai point')] },

  // --- E-commerce -----------------------------------------------------------
  { id: 'amazon', name: 'Amazon', group: 'ecommerce', specificity: 10, patterns: [brand('amazon', 'amzn')] },
  { id: 'flipkart', name: 'Flipkart', group: 'ecommerce', specificity: 10, patterns: [brand('flipkart')] },
  { id: 'myntra', name: 'Myntra', group: 'ecommerce', specificity: 20, patterns: [brand('myntra')] },
  { id: 'ajio', name: 'Ajio', group: 'ecommerce', specificity: 20, patterns: [brand('ajio')] },
  { id: 'nykaa', name: 'Nykaa', group: 'ecommerce', specificity: 20, patterns: [brand('nykaa')] },
  { id: 'meesho', name: 'Meesho', group: 'ecommerce', specificity: 20, patterns: [brand('meesho')] },
  { id: 'jiomart', name: 'JioMart', group: 'ecommerce', specificity: 20, patterns: [brand('jiomart', 'jio mart')] },

  // --- Grocery / retail -----------------------------------------------------
  { id: 'bigbasket', name: 'BigBasket', group: 'grocery', specificity: 10, patterns: [brand('bigbasket', 'big basket')] },
  { id: 'star-bazaar', name: 'Star Bazaar', group: 'grocery', specificity: 20, patterns: [brand('star bazaar', 'star bazar')] },
  { id: 'dmart', name: 'DMart', group: 'grocery', specificity: 20, patterns: [brand('dmart', 'd mart', 'avenue supermart')] },
  { id: 'reliance-fresh', name: 'Reliance Fresh', group: 'grocery', specificity: 20, patterns: [brand('reliance fresh', 'reliance smart')] },
  { id: 'licious', name: 'Licious', group: 'grocery', specificity: 20, patterns: [brand('licious')] },
  { id: 'country-delight', name: 'Country Delight', group: 'grocery', specificity: 20, patterns: [brand('country delight')] },
  { id: 'milkbasket', name: 'Milkbasket', group: 'grocery', specificity: 20, patterns: [brand('milkbasket', 'milk basket')] },

  // --- Travel / mobility ----------------------------------------------------
  { id: 'uber', name: 'Uber', group: 'travel', specificity: 20, patterns: [brand('uber')] },
  { id: 'ola', name: 'Ola', group: 'travel', specificity: 20, patterns: [brand('ola', 'ola cabs')] },
  { id: 'rapido', name: 'Rapido', group: 'travel', specificity: 20, patterns: [brand('rapido')] },
  { id: 'irctc', name: 'IRCTC', group: 'travel', specificity: 20, patterns: [brand('irctc')] },
  { id: 'makemytrip', name: 'MakeMyTrip', group: 'travel', specificity: 20, patterns: [brand('makemytrip', 'make my trip', 'mmt')] },
  { id: 'indigo', name: 'IndiGo', group: 'travel', specificity: 20, patterns: [brand('indigo', '6e')] },
  { id: 'redbus', name: 'redBus', group: 'travel', specificity: 20, patterns: [brand('redbus', 'red bus')] },

  // --- Entertainment / subscriptions ---------------------------------------
  { id: 'bookmyshow', name: 'BookMyShow', group: 'other', specificity: 20, patterns: [brand('bookmyshow', 'book my show', 'bms')] },
  { id: 'netflix', name: 'Netflix', group: 'other', specificity: 20, patterns: [brand('netflix')] },
  { id: 'spotify', name: 'Spotify', group: 'other', specificity: 20, patterns: [brand('spotify')] },
  { id: 'hotstar', name: 'JioHotstar', group: 'other', specificity: 20, patterns: [brand('hotstar', 'jiohotstar', 'jio cinema')] },
  { id: 'prime-video', name: 'Prime Video', group: 'other', specificity: 30, patterns: [brand('prime video')] },

  // --- Recurring bills / services ------------------------------------------
  // These showed up often enough in the unmatched tail to be worth their own
  // tiles; they're real monthly spend even though they aren't "shopping".
  { id: 'airtel', name: 'Airtel', group: 'other', specificity: 20, patterns: [brand('airtel')] },
  { id: 'jio', name: 'Jio', group: 'other', specificity: 20, patterns: [brand('jio recharge', 'reliance jio')] },
  { id: 'act-fibernet', name: 'ACT Fibernet', group: 'other', specificity: 20, patterns: [brand('act broadband', 'act fibernet', 'actcorp')] },
  { id: 'cultfit', name: 'cult.fit', group: 'other', specificity: 20, patterns: [brand('cult fit', 'cultfit', 'cure fit', 'curefit')] },
  { id: 'google', name: 'Google', group: 'other', specificity: 20, patterns: [brand('google one', 'google play', 'google storage')] },
  { id: 'yatra', name: 'Yatra', group: 'travel', specificity: 20, patterns: [brand('yatra')] },
];

// Sorted once at module load so `detectMerchant` can return on first hit.
const RULES_BY_SPECIFICITY = [...MERCHANT_RULES].sort((a, b) => b.specificity - a.specificity);

export interface DetectedMerchant {
  id: string;
  name: string;
  group: MerchantGroup;
}

const detectionCache = new Map<string, DetectedMerchant | null>();

/**
 * Returns the merchant a description belongs to, or null if none matched.
 * Cached by description because the dashboard re-runs this over the same rows
 * on every render pass.
 */
export function detectMerchant(description: string | undefined | null): DetectedMerchant | null {
  if (!description) return null;
  const key = description.slice(0, 200);
  const cached = detectionCache.get(key);
  if (cached !== undefined) return cached;

  // Pad so a brand at the very start or end still sees a boundary character.
  const haystack = ` ${key.toLowerCase()} `;
  let hit: DetectedMerchant | null = null;
  for (const rule of RULES_BY_SPECIFICITY) {
    if (rule.patterns.some(p => p.test(haystack))) {
      hit = { id: rule.id, name: rule.name, group: rule.group };
      break;
    }
  }
  detectionCache.set(key, hit);
  return hit;
}

export const MERCHANT_GROUP_LABELS: Record<MerchantGroup, string> = {
  quick_commerce: 'Quick commerce',
  food_delivery: 'Food & dining',
  ecommerce: 'Online shopping',
  grocery: 'Grocery & retail',
  travel: 'Travel & rides',
  other: 'Other',
};

// ---------------------------------------------------------------------------
// Brand identity
//
// A merchant tile is far easier to find at a glance when it wears the colour
// you already associate with the brand. Each entry carries the brand's own
// hues, kept as raw CSS colours (not Tailwind classes) so a tile can render a
// two-stop gradient for the brands that genuinely have two.
//
// `fg` is chosen for contrast against a very light tint of `from`, and is
// nudged darker than the true brand colour where the real one would fail
// contrast on white (e.g. Rapido's yellow, Amazon's beige).
// ---------------------------------------------------------------------------
export interface MerchantBrand {
  /** Primary brand colour — drives the accent bar and the tinted background. */
  from: string;
  /** Second colour for genuinely two-tone brands. Omit for single-colour ones. */
  to?: string;
  /** Readable text/icon colour in light mode. */
  fg: string;
  /** Readable text/icon colour in dark mode. */
  fgDark: string;
}

const BRAND_COLORS: Record<string, MerchantBrand> = {
  // --- Explicitly specified ---
  swiggy:             { from: '#FC8019', fg: '#B4530A', fgDark: '#FDA05A' },
  'swiggy-instamart': { from: '#FC8019', to: '#1E4FCC', fg: '#1E4FCC', fgDark: '#8FAEFF' },
  zomato:             { from: '#E23744', fg: '#C0202D', fgDark: '#FF8590' },
  blinkit:            { from: '#F8CB46', fg: '#8A6D08', fgDark: '#F5D372' },
  zepto:              { from: '#7C3AED', fg: '#6D28D9', fgDark: '#C4A6FF' },
  airtel:             { from: '#FF0000', fg: '#D40000', fgDark: '#FF7373' },
  'act-fibernet':     { from: '#E31E24', to: '#FFFFFF', fg: '#C0181D', fgDark: '#FF8A8E' },
  'star-bazaar':      { from: '#12A150', to: '#FC8019', fg: '#0E7C3E', fgDark: '#5FD68F' },
  rapido:             { from: '#FFCE00', to: '#111111', fg: '#8A6D00', fgDark: '#FFDE59' },
  uber:               { from: '#000000', to: '#FFFFFF', fg: '#1F2937', fgDark: '#E5E7EB' },
  amazon:             { from: '#E3C9A0', fg: '#8A6A38', fgDark: '#E3C9A0' },
  'amazon-now':       { from: '#E3C9A0', to: '#146EB4', fg: '#146EB4', fgDark: '#7FC0F5' },
  flipkart:           { from: '#F9D423', to: '#2874F0', fg: '#2874F0', fgDark: '#8FBBFF' },
  'flipkart-minutes': { from: '#800000', fg: '#800000', fgDark: '#E58A8A' },

  // --- Everything else: the brand's actual colour where it has one ---
  'zepto-cafe':       { from: '#7C3AED', to: '#C2410C', fg: '#6D28D9', fgDark: '#C4A6FF' },
  'bigbasket-now':    { from: '#84C225', to: '#E4002B', fg: '#5C8A1A', fgDark: '#A9DE5F' },
  bigbasket:          { from: '#84C225', fg: '#5C8A1A', fgDark: '#A9DE5F' },
  dunzo:              { from: '#00D290', fg: '#028A60', fgDark: '#4FE3B8' },
  eatsure:            { from: '#E8452C', fg: '#C22F1A', fgDark: '#FF9382' },
  dominos:            { from: '#006491', to: '#E31837', fg: '#006491', fgDark: '#6FC2E8' },
  kfc:                { from: '#A2242F', fg: '#A2242F', fgDark: '#F09099' },
  mcdonalds:          { from: '#FFC72C', to: '#DA291C', fg: '#9A7200', fgDark: '#FFD65E' },
  starbucks:          { from: '#00704A', fg: '#00704A', fgDark: '#4FBF95' },
  'third-wave':       { from: '#4A2C2A', fg: '#4A2C2A', fgDark: '#D2A6A2' },
  chaayos:            { from: '#F26B21', fg: '#C34F0F', fgDark: '#FBA46E' },
  myntra:             { from: '#FF3F6C', fg: '#D81E4A', fgDark: '#FF8FAB' },
  ajio:               { from: '#2C4152', fg: '#2C4152', fgDark: '#9DB6C9' },
  nykaa:              { from: '#FC2779', fg: '#D40E5C', fgDark: '#FF7FAF' },
  meesho:             { from: '#570D63', fg: '#570D63', fgDark: '#D19EDB' },
  jiomart:            { from: '#0F3CC9', fg: '#0F3CC9', fgDark: '#8FAEFF' },
  dmart:              { from: '#00953B', fg: '#00762F', fgDark: '#4FD183' },
  'reliance-fresh':   { from: '#0057A8', fg: '#0057A8', fgDark: '#84BCF0' },
  licious:            { from: '#D32F2F', fg: '#B71C1C', fgDark: '#FF8A80' },
  'country-delight':  { from: '#00A650', fg: '#00803D', fgDark: '#5FD68F' },
  milkbasket:         { from: '#4CAF50', fg: '#2E7D32', fgDark: '#8FD694' },
  ola:                { from: '#B4D22B', to: '#000000', fg: '#6B7F0F', fgDark: '#CBE05F' },
  irctc:              { from: '#1B5E9E', fg: '#1B5E9E', fgDark: '#8CBEE8' },
  makemytrip:         { from: '#EB2226', to: '#0B7EC8', fg: '#0B7EC8', fgDark: '#7FC0F5' },
  indigo:             { from: '#09209A', fg: '#09209A', fgDark: '#93A5F5' },
  redbus:             { from: '#D84E55', fg: '#B93038', fgDark: '#F49AA0' },
  bookmyshow:         { from: '#C4242B', fg: '#C4242B', fgDark: '#F09499' },
  netflix:            { from: '#E50914', fg: '#C00810', fgDark: '#FF7B84' },
  spotify:            { from: '#1DB954', fg: '#12833A', fgDark: '#5FE08D' },
  hotstar:            { from: '#0F1B4C', to: '#E8117F', fg: '#1A2A6B', fgDark: '#A7B4E8' },
  'prime-video':      { from: '#00A8E1', fg: '#0077A0', fgDark: '#6FD3F5' },
  jio:                { from: '#0A2885', fg: '#0A2885', fgDark: '#93A5F5' },
  cultfit:            { from: '#FF3E5F', fg: '#D91C3C', fgDark: '#FF8FA2' },
  google:             { from: '#4285F4', to: '#EA4335', fg: '#1A73E8', fgDark: '#8AB4F8' },
  yatra:              { from: '#EE2E24', fg: '#C81E15', fgDark: '#FF8C86' },
};

/**
 * Fallback palette for merchants with no brand entry, keyed off the group so
 * an unrecognised food place still reads as "food". Deterministic per id so a
 * tile keeps the same colour between renders and sessions.
 */
const GROUP_FALLBACKS: Record<MerchantGroup, MerchantBrand[]> = {
  quick_commerce: [{ from: '#8B5CF6', fg: '#6D28D9', fgDark: '#C4A6FF' }, { from: '#06B6D4', fg: '#0E7490', fgDark: '#67E8F9' }],
  food_delivery:  [{ from: '#F97316', fg: '#C2410C', fgDark: '#FDBA74' }, { from: '#EF4444', fg: '#B91C1C', fgDark: '#FCA5A5' }],
  ecommerce:      [{ from: '#3B82F6', fg: '#1D4ED8', fgDark: '#93C5FD' }, { from: '#6366F1', fg: '#4338CA', fgDark: '#A5B4FC' }],
  grocery:        [{ from: '#22C55E', fg: '#15803D', fgDark: '#86EFAC' }, { from: '#84CC16', fg: '#4D7C0F', fgDark: '#BEF264' }],
  travel:         [{ from: '#0EA5E9', fg: '#0369A1', fgDark: '#7DD3FC' }, { from: '#14B8A6', fg: '#0F766E', fgDark: '#5EEAD4' }],
  other:          [{ from: '#64748B', fg: '#475569', fgDark: '#CBD5E1' }, { from: '#A855F7', fg: '#7E22CE', fgDark: '#D8B4FE' }],
};

/** The brand palette for a merchant tile. Always returns something usable. */
export function getMerchantBrand(id: string, group: MerchantGroup = 'other'): MerchantBrand {
  const exact = BRAND_COLORS[id];
  if (exact) return exact;
  const options = GROUP_FALLBACKS[group] ?? GROUP_FALLBACKS.other;
  // Stable hash so the same merchant always lands on the same fallback colour.
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return options[hash % options.length];
}
