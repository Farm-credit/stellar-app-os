// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Team Challenges Dashboard Page
 * Issue #1423: Corporate offset goals - team challenges
 */

import { TeamChallengesDashboard } from '@/components/TeamChallengesDashboard';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export default async function TeamChallengesPage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.companyId) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">
            You must be part of a company to access team challenges.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <TeamChallengesDashboard companyId={session.user.companyId} />
    </div>
  );
}