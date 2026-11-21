/**
 * Prisma client accessor (recreated — module was lost in a bad merge on
 * main). Prisma is not currently a project dependency; until the schema is
 * restored, this throws a descriptive error so callers fail loudly instead
 * of importing an empty stub silently.
 */

class PrismaUnavailableError extends Error {
  constructor() {
    super(
      'lib/prisma: Prisma is not configured in this project. Use lib/db/client (pg Pool) for database access, or restore the Prisma schema and add the prisma dependency.'
    );
    this.name = 'PrismaUnavailableError';
  }
}

export const prisma = new Proxy({} as Record<string, never>, {
  get() {
    throw new PrismaUnavailableError();
  },
});

export default prisma;
