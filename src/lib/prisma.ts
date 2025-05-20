// As per PRD: Using @prisma/client/edge for Accelerate
// This client is optimized for serverless environments, especially Edge Functions.
// Server Actions in Next.js App Router typically run in a Node.js serverless function environment.
// Accelerate works well in both.
import { PrismaClient } from '@prisma/client/edge';
import { withAccelerate } from '@prisma/extension-accelerate';

// PrismaClient is instantiated with Accelerate extension.
// It will use the DATABASE_URL environment variable.
// For Vercel "Prisma Postgres", this DATABASE_URL is expected to be your Accelerate connection string.

declare global {
  // allow global `var` declarations
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prismaClientSingleton = () => {
  return new PrismaClient().$extends(withAccelerate());
};

const prisma = global.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;
