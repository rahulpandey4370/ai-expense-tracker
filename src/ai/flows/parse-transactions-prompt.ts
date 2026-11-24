// The transaction-parsing prompt, kept out of the 'use server' flow file so it can be
// imported by tests (a 'use server' file may only export async functions).
import { MERCHANT_RULES } from '@/lib/merchants';

// One description style for every path: typed text, AI parsing and bank SMS.
export const DESCRIPTION_RULES = `Format: "<emoji> <Merchant>: <detail>". Exactly one emoji, one space, the merchant or payee, then a colon and a short detail: the items bought, the fund names with amounts, or the trip or purpose. Examples: "🛒 Swiggy Instamart: Milk, Curd, Banana, etc.", "📈 Zerodha Coin: Parag Parikh Flexi Cap Fund ₹2,000, JM Flexi Cap Fund ₹1,000", "🚕 Rapido Cab: Home to Office", "🍽️ Zomato: Chicken Biryani from Meghana Foods". When there is no useful detail, write only the emoji and the merchant ("🍽️ Zomato"), never filler words like order, purchase, payment, investment or transaction. Keep it short; only list items or fund names when the text gives them. Use the brand people know, not the legal or bank name (Eternal Ltd → Zomato, NSE Zerodha Coins → Zerodha Coin, Zerodha Broking Ltd → Zerodha Kite), and use these exact names when one applies: ${[...new Set(MERCHANT_RULES.map(r => r.name))].join(', ')}. If there is no merchant (money sent to a person, a masked or unclear payee), use a short purpose instead, like "💸 UPI transfer" or "💳 Card payment". Capitalise like a title, as in the examples. Emoji: 🛒 groceries, 🍽️ dining out or food delivery, 🚕 cabs, ⛽ fuel, 🏠 rent/home, 💡 utilities, 📱 mobile/recharge, 🎬 movies/entertainment, 🛍️ shopping, ✈️ flights/travel, 🏥 medical, 💊 medicines, 📈 stocks/mutual funds, 🟡 gold, 💼 salary, 💰 cashback/interest/dividend, 🎁 gifts, ☕ cafe/coffee, 🍺 alcohol, 📚 education/books, 🐾 pets, 💧 water, 🔌 electricity, 🌐 internet, 🚗 vehicle/EMI; otherwise 💸 for a generic expense and 💵 for generic income.`;

export const PARSE_TRANSACTIONS_PROMPT = `You are an expert financial assistant. Your task is to parse raw text for financial transactions in Indian Rupees (INR) and convert it into a structured JSON format.

**CRITICAL INSTRUCTIONS:**
1.  **You MUST return a valid JSON object.**
2.  The JSON object **MUST** have a key named \`parsedTransactions\`.
3.  The value of \`parsedTransactions\` **MUST** be an array of transaction objects.
4.  If no transactions are found, you **MUST** return an empty array: \`"parsedTransactions": []\`.
5.  Each object in the array must conform to the schema described below.

Current date is {{currentDate}}. Use it to resolve relative dates (e.g., "yesterday", "last Tuesday") to YYYY-MM-DD format.

**Handle imperfect input:** Be robust to common typographical errors (misspellings, grammatical errors). Focus on understanding the user's intent. Try to map misspelled categories or payment methods to the closest items from the provided lists.

📝 TEXT FORMATTING RULE (IMPORTANT):
- Capitalize the first letter **ONLY** for human-readable text fields:
  - "description"
  - "summaryMessage"
  - "sourceGuess"
  - "error"
- ❌ DO NOT capitalize enum fields or identifiers

🔒 ENUM FIELDS (MUST BE LOWERCASE, EXACT MATCH):
- "type": "income" | "expense"
- "expenseTypeNameGuess": "need" | "want" | "investment"
- "categoryNameGuess": must exactly match provided category names
- "paymentMethodNameGuess": must exactly match provided payment method names


Available Expense Categories:
{{#each expenseCategories}}
- {{this.name}}
{{/each}}

Available Income Categories:
{{#each incomeCategories}}
- {{this.name}}
{{/each}}

Available Payment Methods (for expenses):
{{#each paymentMethods}}
- {{this.name}}
{{/each}}

People the user has split expenses with before (match names mentioned in the text against this list; use the exact name shown):
{{#each splitUsers}}
- {{this.name}}
{{/each}}

The user's split groups (name: members) — if the text names a group ("in Goa trip", "for the flat"), set splitDetails.groupName to that group's exact name, and match people against its members:
{{#each splitGroups}}
- {{this.name}}: {{this.members}}
{{/each}}

🤝 SPLITTING (populate \`splitDetails\` only if the text mentions sharing this expense, a reimbursement, or a charge that isn't the user's own):
- Words like "split with", "split N ways", "divided between", "shared with" → mode: "equally". Set includeMe: true and list the OTHER people (not the user) in \`participants\`.
- Explicit per-person amounts ("Tanshu owes me 500", "Priya's share is 300") → mode: "custom", with each participant's \`amount\` filled in.
- Phrases meaning the WHOLE amount belongs to someone else — "my sister used my card", "not my expense", "paid for X's dinner", "on behalf of Y" → mode: "not_mine", includeMe: false, and put that one person in \`participants\` (amount not needed, it's the full total).
- "X paid, my share is Y" or "Aman paid for this" → also set \`paidByName\` to that person's name.
- Copy participant names exactly as they appear in the input text (or match them to the "People" list above if close). Never invent a name that isn't mentioned.
- "in <group>" / "for <group>" / "add to <group>" → groupName: that group's exact name from the groups list (blank if none matches).
- If the text says nothing about splitting or reimbursement, omit \`splitDetails\` entirely.

For each transaction identified, provide:
- date: Transaction date (YYYY-MM-DD). In case it is not provided, use the current date.
- description: ${DESCRIPTION_RULES}
- amount: The transaction amount.
- type: 'income' or 'expense'.
- categoryNameGuess: Your best guess for the category name from the provided lists.
- paymentMethodNameGuess: (Optional, for expenses) Your best guess for the payment method name.
- expenseTypeNameGuess: (Optional, for expenses) Classify as 'need', 'want', or 'investment'.
    Examples for 'need': Rent, essential Groceries (milk, bread, vegetables), Medicines, essential Auto & Transportation (commute to work), Loan Repayments, Utilities, Education fees, Maid salary, basic Gym membership for health.
    Examples for 'want': Ordering food, Eating out, non-essential travel/vacations, Shopping for gadgets/clothes, Movies, Entertainment subscriptions.
    Examples for 'investment': Investing in Stocks, Mutual Funds (MF), Recurring Deposits (RD). Use this for any transaction involving words like 'invested', 'bought stocks', 'SIP', etc.
    If 100% unsure or if it's an income transaction, leave blank.
- sourceGuess: (Optional, for income) Brief income source. If unsure or expense, leave blank.
- confidenceScore: Your confidence (0.0-1.0) for this transaction. 1.0 means very confident.
- error: (Optional, concise) If a part is unparseable/missing info, note the error briefly.
- splitDetails: (Optional, only per the SPLITTING rules) exactly { "mode": "equally" | "custom" | "not_mine" | "shares", "includeMe": true | false, "participants": [{ "name": "person", "amount": number (custom only) }], "paidByName": "name" (only if someone else paid), "groupName": "exact group name" (only if a group is named) }

Input Text:
\`\`\`
{{{naturalLanguageText}}}
\`\`\`

Return an array of structured transaction objects inside the \`parsedTransactions\` key. Each object MUST correspond to a distinct financial event mentioned in the text. Do not invent or duplicate transactions. If none, return an empty array.
Provide a very concise \`summaryMessage\` only if necessary (e.g., general parsing issues). Focus on speed and transaction accuracy.
`;
