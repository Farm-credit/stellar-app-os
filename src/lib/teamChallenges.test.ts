// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Team Challenges Library Tests
 * Issue #1423
 */

import {
  Team,
  TeamMember,
  TeamChallenge,
  ChallengeLeaderboardEntry,
} from './teamChallenges';

describe('Team Challenges Types', () => {
  it('should have valid Team interface', () => {
    const team: Team = {
      id: 'team-1',
      name: 'Green Warriors',
      description: 'Sustainability champions',
      companyId: 'company-1',
      members: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    expect(team.name).toBe('Green Warriors');
    expect(team.companyId).toBe('company-1');
  });

  it('should have valid TeamMember interface', () => {
    const member: TeamMember = {
      id: 'member-1',
      userId: 'user-1',
      teamId: 'team-1',
      role: 'captain',
      joinedAt: '2024-01-01T00:00:00Z',
    };
    expect(member.role).toBe('captain');
  });

  it('should have valid TeamChallenge interface', () => {
    const challenge: TeamChallenge = {
      id: 'challenge-1',
      name: 'Q1 Sprint',
      description: 'Quarterly sustainability challenge',
      companyId: 'company-1',
      startDate: '2024-01-01',
      endDate: '2024-03-31',
      status: 'active',
      metric: 'offset_per_employee',
      prize: 'Team lunch',
      teams: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    expect(challenge.status).toBe('active');
    expect(challenge.metric).toBe('offset_per_employee');
  });

  it('should have valid ChallengeLeaderboardEntry interface', () => {
    const entry: ChallengeLeaderboardEntry = {
      teamId: 'team-1',
      teamName: 'Green Warriors',
      rank: 1,
      score: 95.5,
      membersCount: 5,
      totalOffset: 100.5,
      treesPlanted: 500,
      trend: 'up',
    };
    expect(entry.rank).toBe(1);
    expect(entry.trend).toBe('up');
  });
});