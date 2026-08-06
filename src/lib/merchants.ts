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
