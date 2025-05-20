import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';

// PrismaClient is instantiated with Accelerate extension.
// It will use the DATABASE_URL environment variable for Accelerate if it's an Accelerate string,
// or for direct connection if it's a direct connection string.
// Prisma Migrate will use the `directUrl` from schema.prisma if available.

declare global {
  // allow global `var` declarations
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prismaClientSingleton = () => {
  // When using Accelerate, Prisma Client uses the DATABASE_URL from your environment variables.
  // This DATABASE_URL should be your Prisma Accelerate connection string.
  return new PrismaClient().$extends(withAccelerate());
};

const prisma = global.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;
