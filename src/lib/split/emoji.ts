// A fitting emoji for an expense description (server and client).
const EMOJI_HINTS: [RegExp, string][] = [
  [/dinner|lunch|breakfast|food|restaurant|biryani|pizza|burger|swiggy|zomato/i, '🍽️'],
  [/coffee|cafe|chai|tea|starbucks/i, '☕'],
  [/drink|beer|wine|bar|pub/i, '🍻'],
  [/cab|uber|ola|taxi|auto|metro|bus|train|fuel|petrol|diesel/i, '🚕'],
  [/flight|air|plane/i, '✈️'],
  [/hotel|stay|airbnb|room|hostel/i, '🏨'],
  [/rent|house|flat/i, '🏠'],
  [/grocer|blinkit|zepto|bigbasket|vegetable|milk/i, '🛒'],
  [/movie|cinema|netflix|show|concert|ticket/i, '🎬'],
  [/electric|power|wifi|internet|bill|gas|water/i, '💡'],
  [/gift|birthday|party/i, '🎁'],
  [/shop|cloth|amazon|flipkart|myntra/i, '🛍️'],
];
export function emojiFor(description: string): string {
  return EMOJI_HINTS.find(([re]) => re.test(description))?.[1] ?? '🧾';
}

