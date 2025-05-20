import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';

// PrismaClient is instantiated with Accelerate extension.
// It will use the DATABASE_URL environment variable,
// which should be set by Vercel's "Prisma Postgres" integration
// to the Accelerate connection string.

declare global {
  // allow global `var` declarations
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prismaClientSingleton = () => {
  // When using Accelerate, Prisma Client uses the DATABASE_URL
  // from your environment variables.
  return new PrismaClient().$extends(withAccelerate());
};

const prisma = global.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;
