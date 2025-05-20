import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Categories based on the Google Sheet image
const expenseCategoryNames: string[] = [
  'Food and Dining', 'Groceries', 'Rent', 'Auto & Transportation', 
  'Loan Repayment', 'Stocks', 'Mutual Funds', 'Utilities', 
  'Education', 'Subscriptions', 'Home Expense', 'Maid', 
  'Fitness', 'Shopping', 'Entertainment', 'Gifts', 
  'Travel', 'Recurring Deposit', 'Grooming', 'Others'
];

const incomeCategoryNames: string[] = [
  'Salary', 'Freelance Income', 'Bonus', 
  'Investment Income', 'Cashback', 'Other Income'
];

// Payment Methods based on the Google Sheet image
const paymentMethodData: { name: string, type: string }[] = [
  { name: 'UPI (HDFC)', type: 'UPI' },
  { name: 'CC HDFC 7950', type: 'Credit Card' },
  { name: 'CC HDFC 8502', type: 'Credit Card' },
  { name: 'CC ICICI 9007', type: 'Credit Card' },
  { name: 'CC AXIS 6152', type: 'Credit Card' },
  { name: 'CC SBI 0616', type: 'Credit Card' },
  { name: 'CC YES 2106', type: 'Credit Card' },
  { name: 'CC Tanshu', type: 'Credit Card' }, // Assuming 'Tanshu' is a placeholder for a specific card
  { name: 'Cash', type: 'Cash' },
  { name: 'Others', type: 'Others' }
];

async function main() {
  console.log('Start seeding ...');

  // Seed Expense Categories
  for (const name of expenseCategoryNames) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: {
        name,
        type: 'expense',
      },
    });
    console.log(`Created/verified expense category: ${name}`);
  }

  // Seed Income Categories
  for (const name of incomeCategoryNames) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: {
        name,
        type: 'income',
      },
    });
    console.log(`Created/verified income category: ${name}`);
  }

  // Seed Payment Methods
  for (const pm of paymentMethodData) {
    await prisma.paymentMethod.upsert({
      where: { name: pm.name },
      update: {},
      create: {
        name: pm.name,
        type: pm.type,
      },
    });
    console.log(`Created/verified payment method: ${pm.name}`);
  }
  
  // Optional: Seed some initial transactions for testing if the table is empty
  const existingTransactions = await prisma.transaction.count();
  if (existingTransactions === 0) {
    const salaryCategory = await prisma.category.findUnique({ where: { name: 'Salary' } });
    const groceriesCategory = await prisma.category.findUnique({ where: { name: 'Groceries' } });
    const upiHdfc = await prisma.paymentMethod.findUnique({ where: { name: 'UPI (HDFC)' } });

    if (salaryCategory) {
      await prisma.transaction.create({
        data: {
          type: 'income',
          date: new Date(2024, 6, 1), // July 1, 2024
          amount: 75000,
          description: 'Monthly Salary July',
          source: salaryCategory.name, // Using name as source for income
          categoryId: salaryCategory.id,
        }
      });
      console.log('Created sample income transaction.');
    }

    if (groceriesCategory && upiHdfc) {
      await prisma.transaction.create({
        data: {
          type: 'expense',
          date: new Date(2024, 6, 5), // July 5, 2024
          amount: 3500,
          description: 'Weekly Groceries',
          categoryId: groceriesCategory.id,
          paymentMethodId: upiHdfc.id,
          expenseType: 'need',
        }
      });
      console.log('Created sample expense transaction.');
    }
  }


  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
