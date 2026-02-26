import { motion } from 'motion/react';
import { Users, TrendingUp, Award } from 'lucide-react';

interface VoterWeightCardProps {
  farmerInfluence: number;
  investorInfluence: number;
  totalVotingPower: number;
  participationRate: number;
}

export function VoterWeightCard({
  farmerInfluence,
  investorInfluence,
  totalVotingPower,
  participationRate,
}: VoterWeightCardProps) {
  const farmerPercentage = (farmerInfluence / totalVotingPower) * 100;
  const investorPercentage = (investorInfluence / totalVotingPower) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm"
    >
      <div className="flex items-center gap-2 mb-4">
        <Award className="w-5 h-5 text-purple-600" />
        <h3 className="font-semibold text-gray-900">Your Voting Power</h3>
      </div>

      {/* Total Voting Power */}
      <div className="mb-6">
        <p className="text-3xl font-bold text-gray-900">
          {totalVotingPower.toLocaleString()}
        </p>
        <p className="text-sm text-gray-500 mt-1">Total Voting Power</p>
      </div>

      {/* Farmer Influence */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-green-600" />
            <span className="text-sm text-gray-700">Farmer Influence</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">
            {farmerInfluence.toLocaleString()}
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${farmerPercentage}%` }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="bg-green-500 h-full rounded-full"
          />
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {farmerPercentage.toFixed(1)}% of your voting power
        </p>
      </div>

      {/* Investor Influence */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <span className="text-sm text-gray-700">Investor Influence</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">
            {investorInfluence.toLocaleString()}
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${investorPercentage}%` }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="bg-blue-500 h-full rounded-full"
          />
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {investorPercentage.toFixed(1)}% of your voting power
        </p>
      </div>

      {/* Participation Rate */}
      <div className="pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Participation Rate</span>
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="text-sm font-semibold text-purple-600"
          >
            {participationRate}%
          </motion.span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 mt-2 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${participationRate}%` }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="bg-purple-500 h-full rounded-full"
          />
        </div>
      </div>

      {/* Info text */}
      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
        <p className="text-xs text-blue-800">
          Your influence is calculated based on your participation history as both a
          farmer and investor in the platform.
        </p>
      </div>
    </motion.div>
  );
}
