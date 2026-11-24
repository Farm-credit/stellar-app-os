import type { DefaultSession, NextAuthOptions } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id?: string;
      companyId?: string;
    };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [],
};
