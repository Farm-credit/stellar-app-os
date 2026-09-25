// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Corporate Offset Goals - Team Challenges
 * 
 * Issue #1423: Gamified feature allowing employee teams to compete on 
 * sustainability goals. Team with best offset-per-employee ratio wins recognition.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface Team {
  id: string;
  name: string;
  description?: string;
  companyId: string;
  members: TeamMember[];
  createdAt: string;
  updatedAt: string;
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
}

export interface TeamChallenge {
  id: string;
  name: string;
  description: string;
  companyId: string;
  startDate: string;
  endDate: string;
  status: 'upcoming' | 'active' | 'completed';
  metric: 'offset_per_employee' | 'total_trees' | 'total_co2' | 'participation_rate';
  prize?: string;
  teams: ChallengeTeam[];
  createdAt: string;
  updatedAt: string;
}

export interface ChallengeTeam {
  teamId: string;
  teamName: string;
  score: number;
  rank?: number;
  membersCount: number;
  totalOffset: number; // in tons CO2
  treesPlanted: number;
}

export interface ChallengeLeaderboardEntry {
  teamId: string;
  teamName: string;
  rank: number;
  score: number;
  membersCount: number;
  totalOffset: number;
  treesPlanted: number;
  trend: 'up' | 'down' | 'same';
  previousRank?: number;
}

const supabase = createClient();

/**
 * Create a new team
 */
export async function createTeam(data: {
  name: string;
  description?: string;
  companyId: string;
}): Promise<Team> {
  const { data: team, error } = await supabase
    .from('teams')
    .insert({
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create team: ${error.message}`);
  return team as Team;
}

/**
 * Get teams for a company
 */
export async function getCompanyTeams(companyId: string): Promise<Team[]> {
  const { data, error } = await supabase
    .from('teams')
    .select(`
      *,
      members:team_members(
        *,
        user:users(name, email, avatar_url)
      )
    `)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch teams: ${error.message}`);
  return data as Team[];
}

/**
 * Join a team
 */
export async function joinTeam(teamId: string, userId: string): Promise<TeamMember> {
  const { data, error } = await supabase
    .from('team_members')
    .insert({
      team_id: teamId,
      user_id: userId,
      role: 'member',
      joined_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to join team: ${error.message}`);
  return data as TeamMember;
}

/**
 * Leave a team
 */
export async function leaveTeam(teamId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId);

  if (error) throw new Error(`Failed to leave team: ${error.message}`);
}

/**
 * Create a team challenge
 */
export async function createChallenge(data: {
  name: string;
  description: string;
  companyId: string;
  startDate: string;
  endDate: string;
  metric: TeamChallenge['metric'];
  prize?: string;
}): Promise<TeamChallenge> {
  const { data: challenge, error } = await supabase
    .from('team_challenges')
    .insert({
      ...data,
      status: 'upcoming',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create challenge: ${error.message}`);
  return challenge as TeamChallenge;
}

/**
 * Get active/upcoming challenges for a company
 */
export async function getCompanyChallenges(companyId: string): Promise<TeamChallenge[]> {
  const { data, error } = await supabase
    .from('team_challenges')
    .select(`
      *,
      teams:challenge_teams(
        team_id,
        team:teams(name)
      )
    `)
    .eq('company_id', companyId)
    .in('status', ['upcoming', 'active'])
    .order('start_date', { ascending: true });

  if (error) throw new Error(`Failed to fetch challenges: ${error.message}`);
  return data as TeamChallenge[];
}

/**
 * Get challenge leaderboard
 */
export async function getChallengeLeaderboard(challengeId: string): Promise<ChallengeLeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('challenge_leaderboard')
    .select('*')
    .eq('challenge_id', challengeId)
    .order('rank', { ascending: true });

  if (error) throw new Error(`Failed to fetch leaderboard: ${error.message}`);
  return data as ChallengeLeaderboardEntry[];
}

/**
 * Calculate team score for a challenge
 * This would be called periodically or via trigger
 */
export async function calculateTeamScores(challengeId: string): Promise<void> {
  // In production, this would:
  // 1. Get all teams in the challenge
  // 2. For each team, aggregate member contributions (offset purchases, tree planting, etc.)
  // 3. Calculate the metric (offset_per_employee, total_trees, etc.)
  // 4. Update challenge_teams table
  // 5. Recompute rankings
  
  // Simulated implementation:
  const { data: teams } = await supabase
    .from('challenge_teams')
    .select('*')
    .eq('challenge_id', challengeId);

  if (!teams) return;

  for (const team of teams) {
    // Simulate score calculation
    const score = Math.random() * 1000;
    
    await supabase
      .from('challenge_teams')
      .update({ score })
      .eq('id', team.id);
  }

  // Update leaderboard view
  await supabase.rpc('refresh_challenge_leaderboard', { p_challenge_id: challengeId });
}

/**
 * Get user's team memberships
 */
export async function getUserTeams(userId: string): Promise<Team[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select(`
      team:teams(
        *,
        members:team_members(
          *,
          user:users(name, email, avatar_url)
        )
      )
    `)
    .eq('user_id', userId);

  if (error) throw new Error(`Failed to fetch user teams: ${error.message}`);
  return data?.map(d => d.team).filter(Boolean) as Team[];
}

/**
 * Get team statistics
 */
export async function getTeamStats(teamId: string): Promise<{
  totalMembers: number;
  totalOffset: number;
  treesPlanted: number;
  activeChallenges: number;
  completedChallenges: number;
  currentRank?: number;
}> {
  // This would aggregate from multiple tables
  // Simulated for now
  return {
    totalMembers: 5 + Math.floor(Math.random() * 20),
    totalOffset: Math.random() * 500,
    treesPlanted: Math.floor(Math.random() * 1000),
    activeChallenges: Math.floor(Math.random() * 3),
    completedChallenges: Math.floor(Math.random() * 5),
    currentRank: Math.floor(Math.random() * 10) + 1,
  };
}