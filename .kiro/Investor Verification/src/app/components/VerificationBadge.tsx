import React from 'react';
import { Shield, Check, AlertCircle, Clock } from 'lucide-react';

interface VerificationBadgeProps {
  lastVerified: Date;
  oracleProvider: string;
  blockchainNetwork: string;
}

const getVerificationStatus = (lastVerified: Date) => {
  const now = new Date();
  const hoursSinceVerification = (now.getTime() - lastVerified.getTime()) / (1000 * 60 * 60);

  if (hoursSinceVerification < 24) {
    return {
      status: 'verified',
      color: 'green',
      icon: Check,
      message: 'Verified - Fresh Data',
      bgClass: 'bg-green-50 border-green-300',
      iconClass: 'text-green-600',
      badgeClass: 'bg-green-600',
    };
  } else if (hoursSinceVerification < 72) {
    return {
      status: 'stale',
      color: 'yellow',
      icon: Clock,
      message: 'Verified - Data Aging',
      bgClass: 'bg-yellow-50 border-yellow-300',
      iconClass: 'text-yellow-600',
      badgeClass: 'bg-yellow-600',
    };
  } else {
    return {
      status: 'expired',
      color: 'red',
      icon: AlertCircle,
      message: 'Verification Expired',
      bgClass: 'bg-red-50 border-red-300',
      iconClass: 'text-red-600',
      badgeClass: 'bg-red-600',
    };
  }
};

const formatTimeSince = (date: Date): string => {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

export const VerificationBadge: React.FC<VerificationBadgeProps> = ({
  lastVerified,
  oracleProvider,
  blockchainNetwork,
}) => {
  const verification = getVerificationStatus(lastVerified);
  const StatusIcon = verification.icon;

  return (
    <div className={`${verification.bgClass} border-2 rounded-xl p-6 shadow-lg`}>
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-full bg-white ${verification.iconClass} shadow-sm`}>
          <Shield className="w-8 h-8" strokeWidth={2.5} />
        </div>
        
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-lg font-bold text-gray-900">Oracle Verification</h3>
            <div className={`${verification.badgeClass} text-white rounded-full p-1 animate-pulse`}>
              <StatusIcon className="w-4 h-4" />
            </div>
          </div>
          
          <p className={`text-sm font-semibold ${verification.iconClass} mb-3`}>
            {verification.message}
          </p>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Oracle Provider:</span>
              <span className="font-medium text-gray-900">{oracleProvider}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Network:</span>
              <span className="font-medium text-gray-900">{blockchainNetwork}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Last Verified:</span>
              <span className="font-medium text-gray-900">{formatTimeSince(lastVerified)}</span>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                <div 
                  className={`h-full ${verification.badgeClass} transition-all duration-500`}
                  style={{ 
                    width: verification.status === 'verified' ? '100%' : 
                           verification.status === 'stale' ? '60%' : '30%' 
                  }}
                />
              </div>
              <span className="text-xs font-medium text-gray-600">
                {verification.status === 'verified' ? '100%' : 
                 verification.status === 'stale' ? '60%' : '30%'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-2">Data freshness indicator</p>
          </div>
        </div>
      </div>
    </div>
  );
};
