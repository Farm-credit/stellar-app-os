'use client';

import { useState, useEffect } from 'react';
import { useWalletContext } from '@/contexts/WalletContext';
import { fetchLeaderboard, getMockUserStats } from '@/lib/api/mock/leaderboard';
import { LeaderboardSponsor, LeaderboardPeriod } from '@/lib/types/leaderboard';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/molecules/Card';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  Trophy,
  Leaf,
  ChevronUp,
  ChevronDown,
  Minus,
  Loader2,
  TreePine,
  Sparkles,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';

function formatAddress(address: string) {
  if (address.length <= 12) return address;
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

export default function LeaderboardPage() {
  const { wallet } = useWalletContext() || { wallet: null };
  const isConnected = !!wallet?.isConnected;
  const [period, setPeriod] = useState<LeaderboardPeriod>('monthly');
  const [sponsors, setSponsors] = useState<LeaderboardSponsor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const data = await fetchLeaderboard(period);
        setSponsors(data);
      } catch (err) {
        console.error('Failed to load leaderboard data', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [period]);

  const topThree = sponsors.slice(0, 3);
  const remainingSponsors = sponsors.slice(3);

  // User details
  const userAddress = wallet?.publicKey || '';
  const userStats = userAddress ? getMockUserStats(userAddress, period) : null;
  const isUserInTop10 = userStats
    ? sponsors.some((s) => s.address.toLowerCase() === userAddress.toLowerCase())
    : false;

  // Global Impact Stats
  const globalTrees = period === 'monthly' ? 6650 : 63500;
  const globalCO2 = period === 'monthly' ? 332.5 : 3175.0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-stellar-blue/30 selection:text-white">
      {/* Background decoration */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[500px] pointer-events-none opacity-20 bg-[radial-gradient(ellipse_at_top,rgba(20,182,231,0.15),transparent_60%)]" />

      <div className="container mx-auto px-4 py-12 max-w-5xl relative z-10">
        {/* Navigation & Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <Text variant="h1" className="text-white font-extrabold tracking-tight mb-2">
              Leaderboard
            </Text>
            <Text variant="muted" as="p" className="text-base text-slate-400">
              Honoring the sponsors who make our planet greener, one tree at a time.
            </Text>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPeriod('monthly')}
              className={`rounded-lg px-4 py-2 border transition-all ${
                period === 'monthly'
                  ? 'bg-stellar-blue border-stellar-blue text-white shadow-lg shadow-stellar-blue/25'
                  : 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              Monthly
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPeriod('all-time')}
              className={`rounded-lg px-4 py-2 border transition-all ${
                period === 'all-time'
                  ? 'bg-stellar-blue border-stellar-blue text-white shadow-lg shadow-stellar-blue/25'
                  : 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              All-Time
            </Button>
          </div>
        </div>

        {/* Global Impact Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <Card className="bg-slate-900/40 backdrop-blur-md border-stellar-blue/15 hover:border-stellar-blue/30 transition-all duration-300">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 bg-stellar-green/10 rounded-xl border border-stellar-green/20 text-stellar-green">
                <TreePine className="w-6 h-6" />
              </div>
              <div>
                <Text variant="muted" className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                  Total Trees Sponsored
                </Text>
                <Text variant="h3" className="font-extrabold text-white">
                  {globalTrees.toLocaleString()}
                </Text>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/40 backdrop-blur-md border-stellar-blue/15 hover:border-stellar-blue/30 transition-all duration-300">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 bg-stellar-blue/10 rounded-xl border border-stellar-blue/20 text-stellar-blue">
                <Leaf className="w-6 h-6" />
              </div>
              <div>
                <Text variant="muted" className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                  Total CO₂ Offset
                </Text>
                <Text variant="h3" className="font-extrabold text-white">
                  {globalCO2.toLocaleString()} tons
                </Text>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/40 backdrop-blur-md border-stellar-blue/15 hover:border-stellar-blue/30 transition-all duration-300">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 bg-stellar-purple/10 rounded-xl border border-stellar-purple/20 text-stellar-purple">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <Text variant="muted" className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                  Active Global Sponsors
                </Text>
                <Text variant="h3" className="font-extrabold text-white">
                  148
                </Text>
              </div>
            </CardContent>
          </Card>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="w-10 h-10 text-stellar-blue animate-spin" />
            <Text variant="muted" className="text-sm">Fetching leader statistics...</Text>
          </div>
        ) : (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-3 duration-500">
            {/* Podium for top 3 sponsors */}
            {topThree.length >= 3 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end pt-8 md:pt-16 pb-8 border-b border-slate-900">
                {/* 2nd Place */}
                <div className="order-2 md:order-1 flex flex-col items-center">
                  <div className="relative group flex flex-col items-center p-6 w-full max-w-[280px] bg-slate-900/30 backdrop-blur-md border border-slate-800 rounded-2xl text-center hover:border-slate-700/80 transition-all duration-300">
                    <div className="absolute -top-10 flex items-center justify-center w-14 h-14 rounded-full border border-slate-400/30 bg-gradient-to-br from-slate-400 to-slate-600 text-white font-bold shadow-lg shadow-slate-500/20 text-lg">
                      2
                    </div>
                    {topThree[1].avatarUrl && (
                      <img
                        src={topThree[1].avatarUrl}
                        alt={topThree[1].name || topThree[1].address}
                        className="w-16 h-16 rounded-full border-2 border-slate-400 object-cover mt-4 mb-3"
                      />
                    )}
                    <span className="font-bold text-white text-lg block truncate max-w-full">
                      {topThree[1].name || formatAddress(topThree[1].address)}
                    </span>
                    <span className="text-xs text-slate-400 block mb-4 truncate max-w-full">
                      {topThree[1].name ? formatAddress(topThree[1].address) : ''}
                    </span>
                    <div className="grid grid-cols-2 gap-4 w-full border-t border-slate-800/80 pt-3">
                      <div>
                        <span className="text-xs text-slate-500 block uppercase font-medium">Trees</span>
                        <span className="font-extrabold text-stellar-green">{topThree[1].totalTrees}</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 block uppercase font-medium">CO₂</span>
                        <span className="font-extrabold text-stellar-blue">{topThree[1].co2Offset}t</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 1st Place */}
                <div className="order-1 md:order-2 flex flex-col items-center pb-6 md:pb-12">
                  <div className="relative group flex flex-col items-center p-8 w-full max-w-[300px] bg-stellar-blue/5 backdrop-blur-md border border-stellar-blue/30 rounded-2xl text-center hover:border-stellar-blue/50 transition-all duration-300 shadow-xl shadow-stellar-blue/5">
                    <div className="absolute -top-12 flex items-center justify-center w-16 h-16 rounded-full border-2 border-amber-400 bg-gradient-to-br from-amber-300 to-amber-500 text-slate-950 font-bold shadow-lg shadow-amber-500/30 text-xl">
                      <Trophy className="w-7 h-7" />
                    </div>
                    {topThree[0].avatarUrl && (
                      <img
                        src={topThree[0].avatarUrl}
                        alt={topThree[0].name || topThree[0].address}
                        className="w-20 h-20 rounded-full border-2 border-amber-400 object-cover mt-4 mb-3"
                      />
                    )}
                    <span className="font-bold text-white text-xl block truncate max-w-full">
                      {topThree[0].name || formatAddress(topThree[0].address)}
                    </span>
                    <span className="text-xs text-slate-400 block mb-4 truncate max-w-full">
                      {topThree[0].name ? formatAddress(topThree[0].address) : ''}
                    </span>
                    <div className="grid grid-cols-2 gap-4 w-full border-t border-slate-800/80 pt-3">
                      <div>
                        <span className="text-xs text-slate-500 block uppercase font-medium">Trees</span>
                        <span className="font-extrabold text-stellar-green">{topThree[0].totalTrees}</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 block uppercase font-medium">CO₂</span>
                        <span className="font-extrabold text-stellar-blue">{topThree[0].co2Offset}t</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3rd Place */}
                <div className="order-3 flex flex-col items-center">
                  <div className="relative group flex flex-col items-center p-6 w-full max-w-[280px] bg-slate-900/30 backdrop-blur-md border border-slate-800 rounded-2xl text-center hover:border-slate-700/80 transition-all duration-300">
                    <div className="absolute -top-10 flex items-center justify-center w-14 h-14 rounded-full border border-amber-700/30 bg-gradient-to-br from-amber-600 to-amber-800 text-white font-bold shadow-lg shadow-amber-700/20 text-lg">
                      3
                    </div>
                    {topThree[2].avatarUrl && (
                      <img
                        src={topThree[2].avatarUrl}
                        alt={topThree[2].name || topThree[2].address}
                        className="w-16 h-16 rounded-full border-2 border-amber-700 object-cover mt-4 mb-3"
                      />
                    )}
                    <span className="font-bold text-white text-lg block truncate max-w-full">
                      {topThree[2].name || formatAddress(topThree[2].address)}
                    </span>
                    <span className="text-xs text-slate-400 block mb-4 truncate max-w-full">
                      {topThree[2].name ? formatAddress(topThree[2].address) : ''}
                    </span>
                    <div className="grid grid-cols-2 gap-4 w-full border-t border-slate-800/80 pt-3">
                      <div>
                        <span className="text-xs text-slate-500 block uppercase font-medium">Trees</span>
                        <span className="font-extrabold text-stellar-green">{topThree[2].totalTrees}</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 block uppercase font-medium">CO₂</span>
                        <span className="font-extrabold text-stellar-blue">{topThree[2].co2Offset}t</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Table View (Ranks 4-10) */}
            <div className="bg-slate-900/20 border border-slate-900 rounded-2xl overflow-hidden backdrop-blur-sm">
              <div className="p-5 border-b border-slate-900 bg-slate-900/30">
                <Text variant="h4" className="text-white font-bold">
                  Sponsors Ranked 4 - 10
                </Text>
              </div>
              <Table>
                <TableHeader className="bg-slate-900/40 border-b border-slate-900">
                  <TableRow className="hover:bg-transparent border-slate-900">
                    <TableHead className="w-[100px] text-slate-400 font-semibold py-4 pl-6">Rank</TableHead>
                    <TableHead className="text-slate-400 font-semibold py-4">Sponsor</TableHead>
                    <TableHead className="text-slate-400 font-semibold py-4 text-right">Trees Sponsored</TableHead>
                    <TableHead className="text-slate-400 font-semibold py-4 text-right">CO₂ Offset</TableHead>
                    <TableHead className="w-[120px] text-slate-400 font-semibold py-4 text-center pr-6">Trend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {remainingSponsors.map((sponsor) => {
                    const isUserRow = userAddress && sponsor.address.toLowerCase() === userAddress.toLowerCase();
                    return (
                      <TableRow
                        key={sponsor.address}
                        className={`border-slate-900 hover:bg-slate-900/30 transition-colors ${
                          isUserRow ? 'bg-stellar-blue/10 hover:bg-stellar-blue/15 border-l-2 border-l-stellar-blue' : ''
                        }`}
                      >
                        <TableCell className="font-bold text-slate-300 py-4 pl-6">
                          #{sponsor.rank}
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="flex items-center gap-3">
                            {sponsor.avatarUrl && (
                              <img
                                src={sponsor.avatarUrl}
                                alt={sponsor.name || sponsor.address}
                                className="w-8 h-8 rounded-full object-cover"
                              />
                            )}
                            <div>
                              <span className="font-semibold text-white block">
                                {sponsor.name || formatAddress(sponsor.address)}
                              </span>
                              {sponsor.name && (
                                <span className="text-xs text-slate-500">
                                  {formatAddress(sponsor.address)}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-bold text-stellar-green py-4">
                          {sponsor.totalTrees}
                        </TableCell>
                        <TableCell className="text-right font-bold text-stellar-blue py-4">
                          {sponsor.co2Offset.toFixed(1)}t
                        </TableCell>
                        <TableCell className="text-center py-4 pr-6">
                          <div className="inline-flex justify-center items-center">
                            {sponsor.change === 'up' && (
                              <ChevronUp className="w-5 h-5 text-stellar-green" />
                            )}
                            {sponsor.change === 'down' && (
                              <ChevronDown className="w-5 h-5 text-destructive" />
                            )}
                            {sponsor.change === 'same' && (
                              <Minus className="w-4 h-4 text-slate-500" />
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Current Connected User Stats (Sticky/Highlight Widget) */}
            {userStats && (
              <div className="mt-8 p-6 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-900/80 border border-stellar-blue/20 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 pointer-events-none opacity-5 bg-[radial-gradient(circle_at_top_right,var(--stellar-blue),transparent)]" />
                <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-stellar-blue/10 border border-stellar-blue/20 text-stellar-blue font-bold">
                      #{userStats.rank}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-lg">Your Position</span>
                        <span className="text-xs bg-stellar-blue/20 text-stellar-blue px-2 py-0.5 rounded-full font-medium border border-stellar-blue/30">
                          Connected
                        </span>
                      </div>
                      <span className="text-sm text-slate-400">
                        {formatAddress(userAddress)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-8 sm:gap-12">
                    <div className="text-center sm:text-left">
                      <span className="text-xs text-slate-500 uppercase block font-medium">Trees Sponsored</span>
                      <span className="font-extrabold text-stellar-green text-lg">{userStats.totalTrees}</span>
                    </div>
                    <div className="text-center sm:text-left">
                      <span className="text-xs text-slate-500 uppercase block font-medium">CO₂ Offset</span>
                      <span className="font-extrabold text-stellar-blue text-lg">{userStats.co2Offset.toFixed(1)}t</span>
                    </div>
                  </div>

                  <Button asChild stellar="primary" size="sm">
                    <Link href="/credits/purchase">Increase Impact</Link>
                  </Button>
                </div>
              </div>
            )}

            {/* Not connected state for user position */}
            {!userStats && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 rounded-2xl bg-slate-900/20 border border-dashed border-slate-800 text-center sm:text-left">
                <div className="flex items-center gap-3">
                  <Wallet className="w-5 h-5 text-slate-500" />
                  <span className="text-sm text-slate-400 font-medium">
                    Connect your Stellar wallet to see your ranking and contributions on the leaderboard.
                  </span>
                </div>
                <Button asChild variant="outline" size="sm" className="border-slate-800 text-slate-300 hover:text-white hover:bg-slate-900 whitespace-nowrap">
                  <Link href="/">Go Connect Wallet</Link>
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
