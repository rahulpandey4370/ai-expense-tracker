
import type { Category, PaymentMethod } from './types';

// Updated Default Categories based on user-provided list
export const defaultExpenseCategories: Category[] = [
  {
    "id": "cmbswlr790000ayskggdd29fn",
    "name": "Food and Dining",
    "type": "expense"
  },
  {
    "id": "cmbswlr7a0001ayske7jnc70x",
    "name": "Groceries",
    "type": "expense"
  },
  {
    "id": "cmbswlr7a0002ayskcc0m9n86",
    "name": "Rent",
    "type": "expense"
  },
  {
    "id": "cmbswlr7a0003aysk8j605r87",
    "name": "Auto & Transportation",
    "type": "expense"
  },
  {
    "id": "cmbswlr7a0004aysk6v4o47us",
    "name": "Loan Repayment",
    "type": "expense"
  },
  {
    "id": "cmbswlr7a0005aysk90oadmje",
    "name": "Stocks",
    "type": "expense"
  },
  {
    "id": "cmbswlr7a0006aysk9zjleef6",
    "name": "Mutual Funds",
    "type": "expense"
  },
  {
    "id": "cmbswlr7a0007ayskfzv4eazm",
    "name": "Utilities",
    "type": "expense"
  },
	{
    "id": "cmbswlr7a0007ayskfzv4eazWg",
    "name": "Health & Meds",
    "type": "expense"
	},
  {
    "id": "cmbswlr7a0008aysk2mcehwzg",
    "name": "Education",
    "type": "expense"
  },
  {
    "id": "cmbswlr7a0009aysk0xoncl85",
    "name": "Subscriptions",
    "type": "expense"
  },
  {
    "id": "cmbswlr7a000aaysk8k8qbyan",
    "name": "Home Expense",
    "type": "expense"
  },
  {
    "id": "cmbswlr7a000bayskcwmvdhsd",
    "name": "Maid",
    "type": "expense"
  },
  {
    "id": "cmbswlr7a000caysk38ly0s2j",
    "name": "Fitness",
    "type": "expense"
  },
  {
    "id": "cmbswlr7a000daysk8gykdif0",
    "name": "Shopping",
    "type": "expense"
  },
  {
    "id": "cmbswlr7a000eaysk8wllboe0",
    "name": "Entertainment",
    "type": "expense"
  },
  {
    "id": "cmbswlr7b000fayskb6fr0bs8",
    "name": "Gifts",
    "type": "expense"
  },
  {
    "id": "cmbswlr7b000gayskg46t3yy2",
    "name": "Travel",
    "type": "expense"
  },
  {
    "id": "cmbswlr7b000haysk7jh1f0zn",
    "name": "Recurring Deposit",
    "type": "expense"
  },
  {
    "id": "cmbswlr7b000iaysk110y57ue",
    "name": "Grooming",
    "type": "expense"
  },
  {
    "id": "cmbswlr7b000jaysk5xku7wbz",
    "name": "Others",
    "type": "expense"
  }
];

export const defaultIncomeCategories: Category[] = [
  {
    "id": "cmbswlr7b000kaysk85ua3jak",
    "name": "Salary",
    "type": "income"
  },
  {
    "id": "cmbswlr7b000laysk0e868n6z",
    "name": "Freelance Income",
    "type": "income"
  },
  {
    "id": "cmbswlr7b000maysk9mc8cemp",
    "name": "Bonus",
    "type": "income"
  },
  {
    "id": "cmbswlr7b000naysk8p0w1hzg",
    "name": "Investment Income",
    "type": "income"
  },
  {
    "id": "cmbswlr7b000oaysk32wa49ck",
    "name": "Cashback",
    "type": "income"
  },
  {
    "id": "cmbswlr7b000paysk1qex3szh",
    "name": "Dividends",
    "type": "income"
  },
  {
    "id": "cmbswlr7b000qayskcsuh95g3",
    "name": "Other Income",
    "type": "income"
  }
];

export const defaultCategories: Category[] = [
  ...defaultExpenseCategories,
  ...defaultIncomeCategories,
];

// Updated Default Payment Methods based on user-provided list
export const defaultPaymentMethods: PaymentMethod[] = [
  {
    "id": "cmbswlr7b000raysk1rjhfp6n",
    "name": "UPI (HDFC)",
    "type": "UPI"
  },
  {
    "id": "cmbswlr7b000saysk2ayle3nb",
    "name": "CC HDFC 7950",
    "type": "Credit Card"
  },
  {
    "id": "cmbswlr7b000tayskfuh07ru5",
    "name": "CC HDFC 8502",
    "type": "Credit Card"
  },
  {
    "id": "cmbswlr7b000uaysk8am3bw45",
    "name": "CC ICICI 9007",
    "type": "Credit Card"
  },
  {
    "id": "cmbswlr7b000vaysk75h00it8",
    "name": "CC AXIS 6152",
    "type": "Credit Card"
  },
  {
    "id": "cmbswlr7b000wayskcccj4qs2",
    "name": "CC SBI 0616",
    "type": "Credit Card"
  },
  {
    "id": "cmbswlr7b000xaysk9cd23223",
    "name": "CC YES 2106",
    "type": "Credit Card"
  },
  {
    "id": "cmbswlr7b000yayske1pxb3jk",
    "name": "CC Tanshu",
    "type": "Credit Card"
  },
  {
    "id": "cmbswlr7b000zayskfma5glhj",
    "name": "Cash",
    "type": "Cash"
  },
  {
    "id": "cmbswlr7b0010ayskdp69e8t1",
    "name": "Others",
    "type": "Others"
  }
];

    