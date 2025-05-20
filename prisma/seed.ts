// This file is a placeholder or can be removed if Prisma is not used.
// If you were using Prisma, your seed script would go here.
// For Vercel Blob storage, seeding is handled in the actions file if needed.

// Example of what it might have looked like:
// import { PrismaClient } from '@prisma/client';
// import { defaultCategories, defaultPaymentMethods } from '../src/lib/data'; // Adjust path as needed

// const prisma = new PrismaClient();

// async function main() {
//   console.log(`Start seeding ...`);

//   for (const category of defaultCategories) {
//     await prisma.category.upsert({
//       where: { name: category.name }, // Ensure name is unique for upsert
//       update: {},
//       create: category,
//     });
//     console.log(`Created/Verified category with name: ${category.name}`);
//   }

//   for (const pm of defaultPaymentMethods) {
//     await prisma.paymentMethod.upsert({
//       where: { name: pm.name }, // Ensure name is unique for upsert
//       update: {},
//       create: pm,
//     });
//     console.log(`Created/Verified payment method with name: ${pm.name}`);
//   }
  
//   // Optional: Seed some initial transactions for testing
//   const existingTransactions = await prisma.transaction.count();
//   if (existingTransactions === 0) {
//     const salaryCategory = await prisma.category.findFirst({ where: { name: 'Salary' } });
//     const groceriesCategory = await prisma.category.findFirst({ where: { name: 'Groceries' } });
//     const upiMethod = await prisma.paymentMethod.findFirst({ where: { name: 'UPI (HDFC)' }});

//     if (salaryCategory) {
//       await prisma.transaction.create({
//         data: {
//           type: 'income',
//           date: new Date(2024, 6, 1), // July 1, 2024
//           amount: 75000.00,
//           description: 'Monthly Salary July',
//           source: salaryCategory.name,
//           categoryId: salaryCategory.id,
//         }
//       });
//       console.log('Created sample income transaction.');
//     }

//     if (groceriesCategory && upiMethod) {
//       await prisma.transaction.create({
//         data: {
//           type: 'expense',
//           date: new Date(2024, 6, 5), // July 5, 2024
//           amount: 3500.00,
//           description: 'Weekly Groceries',
//           categoryId: groceriesCategory.id,
//           paymentMethodId: upiMethod.id,
//           expenseType: 'need',
//         }
//       });
//       console.log('Created sample expense transaction.');
//     }
//   }

//   console.log(`Seeding finished.`);
// }

// main()
//   .catch((e) => {
//     console.error(e);
//     process.exit(1);
//   })
//   .finally(async () => {
//     await prisma.$disconnect();
//   });
