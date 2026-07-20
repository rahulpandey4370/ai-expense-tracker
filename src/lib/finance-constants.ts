// Single source of truth for category-name-based classification used across the
// dashboard, yearly overview, and the Postgres aggregation RPCs (passed in as
// parameters so SQL and JS never drift).

export const investmentCategoryNames = [
  "Stocks", "Mutual Funds", "Recurring Deposit", "Equity", "Debt", "Gold/Silver", "US Stocks", "Crypto",
];

export const cashbackAndInterestAndDividendCategoryNames = [
  "Cashback", "Investment Income", "Dividends",
];
