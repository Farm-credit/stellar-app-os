'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Users, UserPlus, TreePine, Wind, Copy, Check } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { useWalletContext } from '@/contexts/WalletContext';
import type { TeamForestSummary } from '@/lib/team-forest';

export function TeamForestPanel() {
  const { wallet } = useWalletContext();
  const [team, setTeam] = useState<TeamForestSummary | null>(null);
  const [teamName, setTeamName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [treeRef, setTreeRef] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const walletAddress = wallet?.publicKey;

  const loadTeam = useCallback(
    async (teamId: string) => {
      if (!walletAddress) return;
      const response = await fetch(
        `/api/teams/${encodeURIComponent(teamId)}?wallet=${encodeURIComponent(walletAddress)}`
      );
      if (!response.ok) throw new Error('Unable to load team forest');
      setTeam((await response.json()) as TeamForestSummary);
    },
    [walletAddress]
  );

  useEffect(() => {
    const savedTeamId = window.localStorage.getItem('farmcredit-team-id');
    if (!savedTeamId || !walletAddress) return;
    void loadTeam(savedTeamId).catch(() => window.localStorage.removeItem('farmcredit-team-id'));
  }, [loadTeam, walletAddress]);

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!walletAddress || !teamName.trim()) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: teamName, ownerWallet: walletAddress }),
      });
      const result = (await response.json()) as {
        id?: string;
        error?: string;
        inviteCode?: string;
      };
      if (!response.ok || !result.id) throw new Error(result.error ?? 'Unable to create team');
      window.localStorage.setItem('farmcredit-team-id', result.id);
      setTeamName('');
      setMessage(`Team created. Invite code: ${result.inviteCode}`);
      await loadTeam(result.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create team');
    } finally {
      setLoading(false);
    }
  }

  async function joinTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!walletAddress || !inviteCode.trim()) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/teams/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inviteCode, wallet: walletAddress }),
      });
      const result = (await response.json()) as { error?: string; teamId?: string };
      if (!response.ok || !result.teamId) throw new Error(result.error ?? 'Unable to join team');
      window.localStorage.setItem('farmcredit-team-id', result.teamId);
      setInviteCode('');
      setMessage('You joined the team forest.');
      await loadTeam(result.teamId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to join team');
    } finally {
      setLoading(false);
    }
  }

  async function shareTree(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!walletAddress || !team || !treeRef.trim()) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/teams/${encodeURIComponent(team.id)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wallet: walletAddress, treeRef }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Unable to share tree');
      setTreeRef('');
      setMessage('Tree added to the team forest.');
      await loadTeam(team.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to share tree');
    } finally {
      setLoading(false);
    }
  }

  async function copyInvite() {
    if (!team) return;
    await navigator.clipboard.writeText(team.inviteCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  if (!walletAddress) {
    return (
      <section
        className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        aria-labelledby="team-forest-heading"
      >
        <h2 id="team-forest-heading" className="flex items-center gap-2 text-xl font-black">
          <Users className="h-5 w-5 text-stellar-purple" aria-hidden />
          Sponsor Team Forest
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect your wallet to create a team or join friends.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      aria-labelledby="team-forest-heading"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="team-forest-heading" className="flex items-center gap-2 text-xl font-black">
            <Users className="h-5 w-5 text-stellar-purple" aria-hidden />
            Sponsor Team Forest
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Collaborate with friends and see one shared impact total.
          </p>
        </div>
        {team && (
          <div className="flex items-center gap-2 rounded-full bg-stellar-purple/10 px-3 py-1.5 text-xs font-semibold text-stellar-purple">
            Invite {team.inviteCode}
            <button
              type="button"
              onClick={copyInvite}
              aria-label="Copy team invite code"
              className="rounded p-1 hover:bg-stellar-purple/10"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}
      </div>

      {!team ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <form onSubmit={createTeam} className="space-y-3 rounded-2xl border border-border p-4">
            <label htmlFor="team-name" className="text-sm font-semibold">
              Create a team
            </label>
            <input
              id="team-name"
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              maxLength={80}
              placeholder="Northern Grove"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
            <Button
              type="submit"
              disabled={loading || !teamName.trim()}
              stellar="accent"
              width="full"
            >
              <Users className="mr-2 h-4 w-4" /> Create team
            </Button>
          </form>
          <form onSubmit={joinTeam} className="space-y-3 rounded-2xl border border-border p-4">
            <label htmlFor="team-invite" className="text-sm font-semibold">
              Join by invite code
            </label>
            <input
              id="team-invite"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              placeholder="Paste invite code"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
            <Button
              type="submit"
              disabled={loading || !inviteCode.trim()}
              stellar="primary-outline"
              width="full"
            >
              <UserPlus className="mr-2 h-4 w-4" /> Join team
            </Button>
          </form>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-stellar-green/10 p-4">
              <TreePine className="h-5 w-5 text-stellar-green" />
              <p className="mt-2 text-2xl font-black">{team.totalTrees}</p>
              <p className="text-xs text-muted-foreground">shared trees</p>
            </div>
            <div className="rounded-2xl bg-stellar-cyan/10 p-4">
              <Wind className="h-5 w-5 text-stellar-cyan" />
              <p className="mt-2 text-2xl font-black">{team.totalCo2OffsetKgPerYear.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">kg CO₂ / year</p>
            </div>
            <div className="rounded-2xl bg-stellar-purple/10 p-4">
              <Users className="h-5 w-5 text-stellar-purple" />
              <p className="mt-2 text-2xl font-black">{team.members.length}</p>
              <p className="text-xs text-muted-foreground">members</p>
            </div>
            <div className="rounded-2xl bg-stellar-blue/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Team
              </p>
              <p className="mt-2 truncate text-lg font-black">{team.name}</p>
            </div>
          </div>
          <form onSubmit={shareTree} className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="team-tree-ref" className="sr-only">
              Tree reference
            </label>
            <input
              id="team-tree-ref"
              value={treeRef}
              onChange={(event) => setTreeRef(event.target.value)}
              placeholder="Tree reference to share, e.g. HRV-2024-0001"
              className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
            <Button type="submit" disabled={loading || !treeRef.trim()} stellar="success">
              Share tree
            </Button>
          </form>
          <div>
            <h3 className="mb-2 text-sm font-bold">Members</h3>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {team.members.map((member) => (
                <li key={member.wallet} className="rounded-lg bg-muted/40 px-3 py-2">
                  <span className="font-semibold text-foreground">{member.role}</span> ·{' '}
                  {member.wallet}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {message && (
        <p className="mt-4 text-sm text-stellar-green" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
