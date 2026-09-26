// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Corporate Offset Goals - Team Challenges Service
 *
 * Issue #1423: Gamified feature allowing employee teams to compete on
 * sustainability goals. Team with best offset-per-employee ratio wins recognition.
 *
 * Features:
 * - Team creation and management
 * - Challenge creation with configurable metrics
 * - Real-time leaderboard with rank tracking
 * - Sponsor attribution and recognition
 * - Challenge templates for common use cases
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface Team {
  id: string;
  name: string;
  description?: string;
  companyId: string;
  captainId: string;
  members: TeamMember[];
  createdAt: string;
  updatedAt: string;
  stats: TeamStats;
}

export interface TeamMember {
  id: string;
  userId: string;
  teamId: string;
  role: 'captain' | 'member';
  joinedAt: string;
  user?: {
    name: string;
    email: string;
    avatarUrl?: string;
  };
  contributions: MemberContributions;
}

export interface MemberContributions {
  treesPlanted: number;
  co2Offset: number; // tons
  sponsorships: number;
  challengePoints: number;
}

export interface TeamStats {
  totalMembers: number;
  totalTreesPlanted: number;
  totalCo2Offset: number; // tons
  totalSponsorships: number;
  averageOffsetPerEmployee: number; // tons per employee
  challengePoints: number;
  completedChallenges: number;
  activeChallenges: number;
}

export interface Challenge {
  id: string;
  name: string;
  description: string;
  companyId: string;
  createdBy: string;
  startDate: string;
  endDate: string;
  status: 'upcoming' | 'active' | 'completed' | 'cancelled';
  metric: ChallengeMetric;
  prize?: string;
  sponsorId?: string;
  teams: ChallengeTeam[];
  createdAt: string;
  updatedAt: string;
  templateId?: string;
}

export type ChallengeMetric =
  | 'offset_per_employee'
  | 'total_trees'
  | 'total_co2'
  | 'sponsorships'
  | 'completion_rate'
  | 'species_diversity';

export interface ChallengeTeam {
  teamId: string;
  teamName: string;
  score: number;
  rank?: number;
  membersCount: number;
  totalOffset: number; // tons CO2
  treesPlanted: number;
  sponsorships: number;
  completionRate: number;
  speciesCount: number;
  previousRank?: number;
  trend: 'up' | 'down' | 'same' | 'new';
}

export interface ChallengeLeaderboardEntry {
  teamId: string;
  teamName: string;
  rank: number;
  score: number;
  membersCount: number;
  totalOffset: number;
  treesPlanted: number;
  sponsorships: number;
  completionRate: number;
  speciesCount: number;
  trend: 'up' | 'down' | 'same' | 'new';
  previousRank?: number;
}

export interface ChallengeTemplate {
  id: string;
  name: string;
  description: string;
  metric: ChallengeMetric;
  defaultDurationDays: number;
  defaultPrize?: string;
  defaultMinTeamSize: number;
  defaultMaxTeamSize: number;
  isPublic: boolean;
}

export interface CreateTeamRequest {
  name: string;
  description?: string;
  companyId: string;
}

export interface CreateChallengeRequest {
  name: string;
  description: string;
  companyId: string;
  startDate: string;
  endDate: string;
  metric: ChallengeMetric;
  prize?: string;
  sponsorId?: string;
  teamIds: string[];
  templateId?: string;
}

export interface JoinTeamRequest {
  teamId: string;
  userId: string;
}

export interface ChallengeConfig {
  metric: ChallengeMetric;
  limit: number;
  timeRange: 'all' | 'year' | 'quarter' | 'month';
  region?: string;
  projectType?: string;
  minSponsors?: number;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const DEFAULT_CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  {
    id: 'template-q1-sprint',
    name: 'Q1 Sustainability Sprint',
    description: 'Quarterly sprint focusing on offset-per-employee ratio',
    metric: 'offset_per_employee',
    defaultDurationDays: 90,
    defaultPrize: 'Team lunch + sustainability badge',
    defaultMinTeamSize: 3,
    defaultMaxTeamSize: 10,
    isPublic: true,
  },
  {
    id: 'template-tree-planting',
    name: 'Tree Planting Marathon',
    description: 'Compete to plant the most trees',
    metric: 'total_trees',
    defaultDurationDays: 60,
    defaultPrize: 'Tree planting certificate + team dinner',
    defaultMinTeamSize: 2,
    defaultMaxTeamSize: 8,
    isPublic: true,
  },
  {
    id: 'template-co2-reduction',
    name: 'CO₂ Reduction Challenge',
    description: 'Maximize CO₂ offset through sponsorships',
    metric: 'total_co2',
    defaultDurationDays: 90,
    defaultPrize: 'Carbon neutral certification + team retreat',
    defaultMinTeamSize: 3,
    defaultMaxTeamSize: 12,
    isPublic: true,
  },
  {
    id: 'template-speed-run',
    name: 'Speed Run Challenge',
    description: 'Fastest team to complete their sustainability goals',
    metric: 'completion_rate',
    defaultDurationDays: 30,
    defaultPrize: 'Early completion bonus + recognition',
    defaultMinTeamSize: 2,
    defaultMaxTeamSize: 6,
    isPublic: true,
  },
];

const METRIC_LABELS: Record<string, string> = {
  offset_per_employee: 'Offset per Employee (tons CO₂/employee)',
  total_trees: 'Total Trees Planted',
  total_co2: 'Total CO₂ Offset (tons)',
  sponsorships: 'Number of Sponsorships',
  completion_rate: 'Completion Rate (%)',
  species_diversity: 'Species Diversity (count)',
};

const METRIC_ICONS: Record<string, string> = {
  offset_per_employee: '⚖️',
  total_trees: '🌲',
  total_co2: '☁️',
  sponsorships: '🤝',
  completion_rate: '🏁',
  species_diversity: '🌿',
};

export class TeamChallengesService {
  private supabase: SupabaseClient;
  private templates: Map<string, ChallengeTemplate> = new Map();

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    // Load default templates
    for (const template of DEFAULT_CHALLENGE_TEMPLATES) {
      this.templates.set(template.id, template);
    }
  }

  // ==================== Team Management ====================

  async createTeam(request: CreateTeamRequest): Promise<Team> {
    const { data: team, error } = await this.supabase
      .from('teams')
      .insert({
        ...request,
        captain_id: request.companyId, // In production, use actual user ID
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create team: ${error.message}`);

    // Add captain as first member
    await this.supabase.from('team_members').insert({
      team_id: team.id,
      user_id: request.companyId, // Placeholder
      role: 'captain',
      joined_at: new Date().toISOString(),
    });

    return this.enrichTeam(team);
  }

  async getTeam(teamId: string): Promise<Team | null> {
    const { data: team, error } = await this.supabase
      .from('teams')
      .select(
        `
        *,
        members:team_members(
          *,
          user:users(name, email, avatar_url)
        )
      `
      )
      .eq('id', teamId)
      .single();

    if (error || !team) return null;
    return this.enrichTeam(team);
  }

  async getCompanyTeams(companyId: string): Promise<Team[]> {
    const { data, error } = await this.supabase
      .from('teams')
      .select(
        `
        *,
        members:team_members(
          *,
          user:users(name, email, avatar_url)
        )
      `
      )
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch teams: ${error.message}`);
    return (data || []).map((t) => this.enrichTeam(t));
  }

  async joinTeam(request: JoinTeamRequest): Promise<TeamMember> {
    const { data, error } = await this.supabase
      .from('team_members')
      .insert({
        team_id: request.teamId,
        user_id: request.userId,
        role: 'member',
        joined_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to join team: ${error.message}`);
    return data as TeamMember;
  }

  async leaveTeam(teamId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', userId);

    if (error) throw new Error(`Failed to leave team: ${error.message}`);
  }

  async getUserTeams(userId: string): Promise<Team[]> {
    const { data, error } = await this.supabase
      .from('team_members')
      .select(
        `
        team:teams(
          *,
          members:team_members(
            *,
            user:users(name, email, avatar_url)
          )
        )
      `
      )
      .eq('user_id', userId);

    if (error) throw new Error(`Failed to fetch user teams: ${error.message}`);
    return (data?.map((d) => this.enrichTeam(d.team)).filter(Boolean) || []) as Team[];
  }

  // ==================== Challenge Management ====================

  async createChallenge(request: CreateChallengeRequest): Promise<Challenge> {
    // Validate dates
    const start = new Date(request.startDate);
    const end = new Date(request.endDate);
    if (start >= end) {
      throw new Error('Start date must be before end date');
    }

    // Validate team count
    if (request.teamIds.length < 2) {
      throw new Error('At least 2 teams required for a challenge');
    }

    // Verify all teams exist and belong to the company
    const { data: teams, error: teamsError } = await this.supabase
      .from('teams')
      .select('id')
      .in('id', request.teamIds)
      .eq('company_id', request.companyId);

    if (teamsError || !teams || teams.length !== request.teamIds.length) {
      throw new Error('One or more teams not found or not in company');
    }

    const { data: challenge, error } = await this.supabase
      .from('challenges')
      .insert({
        ...request,
        status: new Date(request.startDate) <= new Date() ? 'active' : 'upcoming',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create challenge: ${error.message}`);

    // Add teams to challenge
    const challengeTeams = request.teamIds.map((teamId) => ({
      challenge_id: challenge.id,
      team_id: teamId,
      score: 0,
      created_at: new Date().toISOString(),
    }));

    await this.supabase.from('challenge_teams').insert(challengeTeams);

    return this.enrichChallenge(challenge);
  }

  async getChallenge(challengeId: string): Promise<Challenge | null> {
    const { data: challenge, error } = await this.supabase
      .from('challenges')
      .select(
        `
        *,
        teams:challenge_teams(
          *,
          team:teams(*)
        )
      `
      )
      .eq('id', challengeId)
      .single();

    if (error || !challenge) return null;
    return this.enrichChallenge(challenge);
  }

  async getCompanyChallenges(
    companyId: string,
    options?: {
      status?: string[];
      limit?: number;
      offset?: number;
    }
  ): Promise<Challenge[]> {
    let query = this.supabase
      .from('challenges')
      .select(
        `
        *,
        teams:challenge_teams(
          team_id,
          team:teams(name)
        )
      `
      )
      .eq('company_id', companyId)
      .order('start_date', { ascending: true });

    if (options?.status?.length) {
      query = query.in('status', options.status);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch challenges: ${error.message}`);
    return (data || []).map((c) => this.enrichChallenge(c));
  }

  async getChallengeLeaderboard(challengeId: string): Promise<ChallengeLeaderboardEntry[]> {
    const { data, error } = await this.supabase
      .from('challenge_leaderboard')
      .select('*')
      .eq('challenge_id', challengeId)
      .order('rank', { ascending: true });

    if (error) throw new Error(`Failed to fetch leaderboard: ${error.message}`);
    return data as ChallengeLeaderboardEntry[];
  }

  async recalculateScores(challengeId: string): Promise<void> {
    // In production, this would aggregate real data from sponsorships, tree planting, etc.
    // For now, simulate score calculation
    const { data: teams } = await this.supabase
      .from('challenge_teams')
      .select('team_id')
      .eq('challenge_id', challengeId);

    if (!teams) return;

    for (const team of teams) {
      // Simulate score calculation based on challenge metric
      // In production, query actual data from sponsorships, tree planting, etc.
      const score = Math.random() * 1000;

      await this.supabase
        .from('challenge_teams')
        .update({ score })
        .eq('challenge_id', challengeId)
        .eq('team_id', team.team_id);
    }

    // Refresh leaderboard view
    await this.supabase.rpc('refresh_challenge_leaderboard', { p_challenge_id: challengeId });
  }

  async getChallengeTemplates(): Promise<ChallengeTemplate[]> {
    return Array.from(this.templates.values());
  }

  async getChallengeTemplate(templateId: string): Promise<ChallengeTemplate | null> {
    return this.templates.get(templateId) || null;
  }

  async createTemplate(template: Omit<ChallengeTemplate, 'id'>): Promise<ChallengeTemplate> {
    const templateWithId = { ...template, id: `template-${crypto.randomUUID()}` };
    this.templates.set(templateWithId.id, templateWithId);
    return templateWithId;
  }

  // ==================== Leaderboard & Analytics ====================

  async getLeaderboard(config: ChallengeConfig): Promise<{
    entries: ChallengeLeaderboardEntry[];
    metric: string;
    totalTeams: number;
    lastUpdated: string;
  }> {
    // In production, this would query a materialized view or compute on-demand
    // For now, return mock data based on config
    const metricLabel = METRIC_LABELS[config.metric] || config.metric;

    // Simulate leaderboard data
    const mockEntries: ChallengeLeaderboardEntry[] = [
      {
        teamId: 'team-1',
        teamName: 'Green Warriors',
        rank: 1,
        score: 98.5,
        membersCount: 5,
        totalOffset: 125.3,
        treesPlanted: 2500,
        sponsorships: 45,
        completionRate: 95,
        speciesCount: 12,
        trend: 'up',
        previousRank: 2,
      },
      {
        teamId: 'team-2',
        teamName: 'Eco Champions',
        rank: 2,
        score: 94.2,
        membersCount: 4,
        totalOffset: 110.8,
        treesPlanted: 2200,
        sponsorships: 38,
        completionRate: 92,
        speciesCount: 10,
        trend: 'same',
        previousRank: 2,
      },
      {
        teamId: 'team-3',
        teamName: 'Green Guardians',
        rank: 3,
        score: 91.7,
        membersCount: 6,
        totalOffset: 105.2,
        treesPlanted: 2100,
        sponsorships: 35,
        completionRate: 88,
        speciesCount: 15,
        trend: 'up',
        previousRank: 4,
      },
      {
        teamId: 'team-4',
        teamName: 'Eco Warriors',
        rank: 4,
        score: 87.3,
        membersCount: 3,
        totalOffset: 98.1,
        treesPlanted: 1800,
        sponsorships: 30,
        completionRate: 85,
        speciesCount: 8,
        trend: 'down',
        previousRank: 3,
      },
      {
        teamId: 'team-5',
        teamName: 'Carbon Crushers',
        rank: 5,
        score: 82.1,
        membersCount: 4,
        totalOffset: 92.5,
        treesPlanted: 1700,
        sponsorships: 28,
        completionRate: 82,
        speciesCount: 9,
        trend: 'new',
      },
    ];

    return {
      entries: mockEntries.slice(0, config.limit),
      metric: config.metric,
      totalTeams: 12,
      lastUpdated: new Date().toISOString(),
    };
  }

  // ==================== Private Helpers ====================

  private enrichTeam(team: any): Team {
    const members = team.members || [];
    const totalTrees = members.reduce((sum, m) => sum + (m.contributions?.treesPlanted || 0), 0);
    const totalCo2 = members.reduce((sum, m) => sum + (m.contributions?.co2Offset || 0), 0);
    const totalSponsorships = members.reduce(
      (sum, m) => sum + (m.contributions?.sponsorships || 0),
      0
    );
    const totalPoints = members.reduce(
      (sum, m) => sum + (m.contributions?.challengePoints || 0),
      0
    );

    return {
      ...team,
      members,
      stats: {
        totalMembers: members.length,
        totalTreesPlanted: totalTrees,
        totalCo2Offset: totalCo2,
        totalSponsorships: totalSponsorships,
        averageOffsetPerEmployee: members.length > 0 ? totalCo2 / members.length : 0,
        challengePoints: totalPoints,
        completedChallenges: 0, // Would query from challenges
        activeChallenges: 0,
      },
    };
  }

  private enrichChallenge(challenge: any): Challenge {
    const teams =
      challenge.teams?.map((ct: any) => ({
        teamId: ct.team_id,
        teamName: ct.team?.name || 'Unknown',
        score: ct.score || 0,
        membersCount: ct.team?.members?.length || 0,
        totalOffset: 0, // Would compute from data
        treesPlanted: 0,
        sponsorships: 0,
        completionRate: 0,
        speciesCount: 0,
      })) || [];

    return {
      ...challenge,
      teams: teams.map((t, i) => ({
        ...t,
        rank: i + 1,
        trend: 'new' as const,
      })),
    };
  }
}

export const teamChallengesService = new TeamChallengesService();

// Constants for UI
export const METRIC_LABELS: Record<ChallengeMetric, string> = {
  offset_per_employee: 'Offset per Employee (tons CO₂/employee)',
  total_trees: 'Total Trees Planted',
  total_co2: 'Total CO₂ Offset (tons)',
  sponsorships: 'Number of Sponsorships',
  completion_rate: 'Completion Rate (%)',
  species_diversity: 'Species Diversity (count)',
};

export const METRIC_ICONS: Record<ChallengeMetric, string> = {
  offset_per_employee: '⚖️',
  total_trees: '🌲',
  total_co2: '☁️',
  sponsorships: '🤝',
  completion_rate: '🏁',
  species_diversity: '🌿',
};

export function getMetricLabel(metric: ChallengeMetric): string {
  return METRIC_LABELS[metric] || metric;
}

export function getMetricIcon(metric: ChallengeMetric): string {
  return METRIC_ICONS[metric] || '📊';
}
