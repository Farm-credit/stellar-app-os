// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Team Challenges UI Components
 * Issue #1423: Corporate offset goals - team challenges
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trophy, Users, Target, TrendingUp, Calendar } from 'lucide-react';
import {
  Team,
  TeamChallenge,
  ChallengeLeaderboardEntry,
  createTeam,
  getCompanyTeams,
  joinTeam,
  createChallenge,
  getCompanyChallenges,
  getChallengeLeaderboard,
  getTeamStats,
} from '@/lib/teamChallenges';
import { useAuth } from '@/hooks/useAuth';

interface TeamChallengesDashboardProps {
  companyId: string;
}

export function TeamChallengesDashboard({ companyId }: TeamChallengesDashboardProps) {
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [challenges, setChallenges] = useState<TeamChallenge[]>([]);
  const [activeTab, setActiveTab] = useState<'teams' | 'challenges' | 'leaderboard'>('teams');
  const [loading, setLoading] = useState(true);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [showCreateChallenge, setShowCreateChallenge] = false;

  useEffect(() => {
    loadData();
  }, [companyId]);

  const loadData = async () => {
    try {
      const [teamsData, challengesData] = await Promise.all([
        getCompanyTeams(companyId),
        getCompanyChallenges(companyId),
      ]);
      setTeams(teamsData);
      setChallenges(challengesData);
    } catch (error) {
      console.error('Failed to load team challenges data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTeam = async (name: string, description: string) => {
    try {
      const team = await createTeam({ name, description, companyId });
      setTeams(prev => [team, ...prev]);
      setShowCreateTeam(false);
    } catch (error) {
      console.error('Failed to create team:', error);
    }
  };

  const handleCreateChallenge = async (data: {
    name: string;
    description: string;
    startDate: string;
    endDate: string;
    metric: TeamChallenge['metric'];
    prize?: string;
  }) => {
    try {
      const challenge = await createChallenge({ ...data, companyId });
      setChallenges(prev => [challenge, ...prev]);
      setShowCreateChallenge(false);
    } catch (error) {
      console.error('Failed to create challenge:', error);
    }
  };

  const handleJoinTeam = async (teamId: string) => {
    if (!user) return;
    try {
      await joinTeam(teamId, user.id);
      await loadData();
    } catch (error) {
      console.error('Failed to join team:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Team Challenges</h1>
          <p className="text-muted-foreground">
            Compete with colleagues on sustainability goals
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowCreateTeam(true)}>
            <Users className="w-4 h-4 mr-2" />
            Create Team
          </Button>
          <Button variant="outline" onClick={() => setShowCreateChallenge(true)}>
            <Target className="w-4 h-4 mr-2" />
            New Challenge
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {[
          { id: 'teams', label: 'Teams', count: teams.length },
          { id: 'challenges', label: 'Challenges', count: challenges.length },
          { id: 'leaderboard', label: 'Leaderboard' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-muted rounded-full">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'teams' && (
        <TeamsTab teams={teams} onJoin={handleJoinTeam} userId={user?.id} />
      )}
      {activeTab === 'challenges' && (
        <ChallengesTab challenges={challenges} companyId={companyId} />
      )}
      {activeTab === 'leaderboard' && (
        <LeaderboardTab challenges={challenges} />
      )}

      {/* Modals */}
      {showCreateTeam && (
        <CreateTeamModal onClose={() => setShowCreateTeam(false)} onSubmit={handleCreateTeam} />
      )}
      {showCreateChallenge && (
        <CreateChallengeModal onClose={() => setShowCreateChallenge(false)} onSubmit={handleCreateChallenge} />
      )}
    </div>
  );
}

function TeamsTab({ teams, onJoin, userId }: { teams: Team[]; onJoin: (id: string) => void; userId?: string }) {
  if (teams.length === 0) {
    return (
      <div className="text-center py-12">
        <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">No teams yet</h3>
        <p className="text-muted-foreground mt-1">Create a team to start competing</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {teams.map(team => {
        const isMember = team.members.some(m => m.userId === userId);
        return (
          <TeamCard key={team.id} team={team} isMember={isMember} onJoin={() => onJoin(team.id)} />
        );
      })}
    </div>
  );
}

function TeamCard({ team, isMember, onJoin }: { team: Team; isMember: boolean; onJoin: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          {team.name}
          <Badge variant={isMember ? 'default' : 'outline'}>
            {isMember ? 'Member' : 'Join'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {team.description && <p className="text-sm text-muted-foreground">{team.description}</p>}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{team.members.length} members</span>
          {!isMember && (
            <Button size="sm" onClick={onJoin}>
              Join Team
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ChallengesTab({ challenges, companyId }: { challenges: TeamChallenge[]; companyId: string }) {
  if (challenges.length === 0) {
    return (
      <div className="text-center py-12">
        <Target className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">No active challenges</h3>
        <p className="text-muted-foreground mt-1">Create a challenge to start competing</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {challenges.map(challenge => (
        <ChallengeCard key={challenge.id} challenge={challenge} companyId={companyId} />
      ))}
    </div>
  );
}

function ChallengeCard({ challenge, companyId }: { challenge: TeamChallenge; companyId: string }) {
  const statusColors = {
    upcoming: 'bg-yellow-100 text-yellow-800',
    active: 'bg-green-100 text-green-800',
    completed: 'bg-gray-100 text-gray-800',
  };

  const daysLeft = challenge.status === 'active'
    ? Math.ceil((new Date(challenge.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold">{challenge.name}</h3>
              <Badge className={statusColors[challenge.status]}>
                {challenge.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-3">{challenge.description}</p>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(challenge.startDate).toLocaleDateString()} - {new Date(challenge.endDate).toLocaleDateString()}
              </span>
              {daysLeft !== null && (
                <span className="flex items-center gap-1 text-orange-600">
                  <TrendingUp className="w-3 h-3" />
                  {daysLeft} days left
                </span>
              )}
              <span>Metric: {challenge.metric.replace('_', ' ')}</span>
              {challenge.prize && (
                <span className="flex items-center gap-1 text-amber-600">
                  <Trophy className="w-3 h-3" />
                  Prize: {challenge.prize}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LeaderboardTab({ challenges }: { challenges: TeamChallenge[] }) {
  const [selectedChallenge, setSelectedChallenge] = useState<TeamChallenge | null>(challenges[0] || null);
  const [leaderboard, setLeaderboard] = useState<ChallengeLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedChallenge) {
      loadLeaderboard(selectedChallenge.id);
    }
  }, [selectedChallenge]);

  const loadLeaderboard = async (challengeId: string) => {
    setLoading(true);
    try {
      const data = await getChallengeLeaderboard(challengeId);
      setLeaderboard(data);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (challenges.length === 0) {
    return (
      <div className="text-center py-12">
        <Trophy className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">No challenges to show</h3>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium">Select Challenge:</label>
        <select
          value={selectedChallenge?.id || ''}
          onChange={e => setSelectedChallenge(challenges.find(c => c.id === e.target.value) || null)}
          className="flex-1 max-w-xs px-3 py-2 border rounded-md"
        >
          {challenges.map(c => (
            <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">Rank</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Team</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Score</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Members</th>
                <th className="px-4 py-3 text-left text-sm font-medium">CO₂ Offset</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Trees</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Trend</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry, index) => (
                <tr key={entry.teamId} className={index === 0 ? 'bg-yellow-50' : ''}>
                  <td className="px-4 py-3">
                    {entry.rank === 1 && <Trophy className="w-5 h-5 text-amber-500 mx-auto" />}
                    {entry.rank > 1 && <span className="font-medium">#{entry.rank}</span>}
                  </td>
                  <td className="px-4 py-3 font-medium">{entry.teamName}</td>
                  <td className="px-4 py-3">{entry.score.toFixed(1)}</td>
                  <td className="px-4 py-3">{entry.membersCount}</td>
                  <td className="px-4 py-3">{entry.totalOffset.toFixed(1)}t</td>
                  <td className="px-4 py-3">{entry.treesPlanted}</td>
                  <td className="px-4 py-3">
                    {entry.trend === 'up' && <TrendingUp className="w-4 h-4 text-green-500 mx-auto" />}
                    {entry.trend === 'down' && <span className="text-red-500">↓</span>}
                    {entry.trend === 'same' && <span className="text-gray-400">→</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateTeamModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (name: string, description: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Create Team</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Team Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="e.g., Green Warriors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              rows={3}
              placeholder="Team mission, goals, etc."
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onSubmit(name, description); onClose(); }} disabled={!name}>
            Create Team
          </Button>
        </div>
      </div>
    </div>
  );
}

function CreateChallengeModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: any) => void }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    metric: 'offset_per_employee' as TeamChallenge['metric'],
    prize: '',
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Create Challenge</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Challenge Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="e.g., Q1 Sustainability Sprint"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border rounded-md"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={e => setForm({ ...form, startDate: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Date</label>
              <input
                type="date"
                value={form.endDate}
                onChange={e => setForm({ ...form, endDate: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Metric</label>
            <select
              value={form.metric}
              onChange={e => setForm({ ...form, metric: e.target.value as any })}
              className="w-full px-3 py-2 border rounded-md"
            >
              <option value="offset_per_employee">Offset per Employee</option>
              <option value="total_trees">Total Trees Planted</option>
              <option value="total_co2">Total CO₂ Offset</option>
              <option value="participation_rate">Participation Rate</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Prize (optional)</label>
            <input
              type="text"
              value={form.prize}
              onChange={e => setForm({ ...form, prize: e.target.value })}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="e.g., Team lunch, extra PTO, donation match"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onSubmit(form); onClose(); }} disabled={!form.name}>
            Create Challenge
          </Button>
        </div>
      </div>
    </div>
  );
}