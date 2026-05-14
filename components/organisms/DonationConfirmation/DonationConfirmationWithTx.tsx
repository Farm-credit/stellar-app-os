'use client';

import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import html2canvas from 'html2canvas';
import {
  CheckCircle,
  Download,
  ExternalLink,
  Trees,
  DollarSign,
  Share2,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';
import { FaWhatsapp, FaXTwitter } from 'react-icons/fa6';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Badge } from '@/components/atoms/Badge';
import { formatNumber } from '@/lib/constants/donation';

interface TransactionDetails {
  hash: string;
  amount: number;
  asset: string;
  from: string;
  to: string;
  timestamp: string;
  memo?: string;
}

interface DonationConfirmationWithTxProps {
  txHash: string;
}

export function DonationConfirmationWithTx({ txHash }: DonationConfirmationWithTxProps) {
  const [txDetails, setTxDetails] = useState<TransactionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchTransactionDetails = async () => {
      try {
        setLoading(true);
        // Fetch from Horizon API
        const horizonUrl = process.env.NEXT_PUBLIC_HORIZON_URL || 'https://horizon-testnet.stellar.org';
        const response = await fetch(`${horizonUrl}/transactions/${txHash}`);
        
        if (!response.ok) {
          throw new Error('Transaction not found');
        }

        const data = await response.json();
        
        // Parse transaction operations to get payment details
        const opsResponse = await fetch(`${horizonUrl}/transactions/${txHash}/operations`);
        const opsData = await opsResponse.json();
        
        const paymentOp = opsData._embedded?.records?.find(
          (op: any) => op.type === 'payment' || op.type === 'path_payment_strict_send' || op.type === 'path_payment_strict_receive'
        );

        const amount = paymentOp?.amount ? parseFloat(paymentOp.amount) : 0;
        const asset = paymentOp?.asset_type === 'native' ? 'XLM' : paymentOp?.asset_code || 'USDC';

        setTxDetails({
          hash: data.hash,
          amount,
          asset,
          from: paymentOp?.from || data.source_account,
          to: paymentOp?.to || '',
          timestamp: data.created_at,
          memo: data.memo || undefined,
        });
      } catch (err) {
        console.error('Failed to fetch transaction:', err);
        setError('Unable to load transaction details. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchTransactionDetails();
  }, [txHash]);

  const trees = txDetails ? Math.round(txDetails.amount * 10) : 0; // Estimate: $1 = 10 trees
  const co2Offset = (trees * 0.022).toFixed(2); // ~22kg CO2 per tree per year
  const projectName = txDetails?.memo || 'FarmCredit Reforestation';

  const handleExportReceipt = async () => {
    if (!receiptRef.current) return;
    
    setIsExporting(true);
    try {
      const canvas = await html2canvas(receiptRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
      });
      
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/png');
      });
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `farmcredit-receipt-${txHash.slice(0, 8)}.png`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export receipt:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const shareText = `I just donated ${txDetails?.amount} ${txDetails?.asset} to plant ${trees} trees with FarmCredit! 🌍🌳`;
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  const handleShareTwitter = () => {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
      '_blank'
    );
  };

  const handleShareWhatsApp = () => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`,
      '_blank'
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center py-24">
        <Loader2 className="w-12 h-12 text-stellar-blue animate-spin mb-4" />
        <Text>Loading transaction details...</Text>
      </div>
    );
  }

  if (error || !txDetails) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center py-24 px-4">
        <div className="text-center max-w-md">
          <Text variant="h2" className="text-2xl font-bold mb-4 text-red-600">
            Transaction Not Found
          </Text>
          <Text variant="muted" className="mb-6">
            {error || 'Unable to load transaction details.'}
          </Text>
          <Button onClick={() => window.location.href = '/donate'} stellar="primary">
            Make a Donation
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6">
      <div className="w-full max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          {/* Success Icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              type: 'spring',
              stiffness: 260,
              damping: 20,
              delay: 0.2,
            }}
            className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-stellar-green/10 mb-8"
          >
            <CheckCircle className="w-12 h-12 text-stellar-green" />
          </motion.div>

          <Badge variant="success" className="mb-4">
            CONFIRMED ON-CHAIN
          </Badge>

          <Text variant="h1" className="text-4xl font-bold mb-4 text-gray-900">
            Thank you for your donation!
          </Text>

          <Text variant="muted" className="text-lg mb-10 max-w-lg mx-auto">
            Your donation has been confirmed on the Stellar blockchain and is already working to
            restore our planet.
          </Text>

          {/* Receipt Card */}
          <div
            ref={receiptRef}
            className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-8"
          >
            <div className="bg-gradient-to-r from-stellar-blue to-stellar-purple px-6 py-4 text-white">
              <Text className="font-bold text-lg">FarmCredit</Text>
              <Text className="text-xs opacity-90">On-Chain Donation Receipt</Text>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
              {/* Amount & Trees */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-stellar-blue/5 p-4 rounded-xl border border-stellar-blue/10 text-center">
                  <DollarSign className="w-6 h-6 text-stellar-blue mx-auto mb-2" />
                  <Text className="text-2xl font-bold text-stellar-blue">
                    {txDetails.amount} {txDetails.asset}
                  </Text>
                  <Text className="text-xs font-medium text-stellar-blue uppercase">
                    Donation Amount
                  </Text>
                </div>
                <div className="bg-stellar-green/5 p-4 rounded-xl border border-stellar-green/10 text-center">
                  <Trees className="w-6 h-6 text-stellar-green mx-auto mb-2" />
                  <Text className="text-2xl font-bold text-stellar-green">
                    {formatNumber(trees)}
                  </Text>
                  <Text className="text-xs font-medium text-stellar-green uppercase">
                    Trees Planted
                  </Text>
                </div>
              </div>

              {/* Impact Estimate */}
              <div className="bg-gradient-to-br from-stellar-green/10 to-stellar-blue/10 p-4 rounded-xl border border-stellar-green/20">
                <Text className="text-sm font-semibold text-gray-700 mb-2">
                  Estimated Annual Impact
                </Text>
                <div className="flex items-baseline gap-2">
                  <Text className="text-3xl font-bold text-stellar-green">{co2Offset}</Text>
                  <Text className="text-sm text-gray-600">tonnes CO₂ offset per year</Text>
                </div>
              </div>

              {/* Transaction Details */}
              <div className="pt-4 border-t border-gray-100 space-y-3 text-left">
                <div className="flex justify-between items-start">
                  <Text className="text-sm font-medium text-gray-500">Project</Text>
                  <Text className="font-semibold text-gray-800 text-right max-w-[60%]">
                    {projectName}
                  </Text>
                </div>
                <div className="flex justify-between items-start">
                  <Text className="text-sm font-medium text-gray-500">Date</Text>
                  <Text className="font-semibold text-gray-800">
                    {new Date(txDetails.timestamp).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </Text>
                </div>
                <div className="flex justify-between items-start">
                  <Text className="text-sm font-medium text-gray-500">Transaction</Text>
                  <Text className="font-mono text-xs text-gray-600 break-all text-right max-w-[60%]">
                    {txDetails.hash.slice(0, 12)}...{txDetails.hash.slice(-12)}
                  </Text>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
            <Button
              onClick={handleExportReceipt}
              disabled={isExporting}
              stellar="primary"
              size="lg"
              className="h-12"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Export Receipt
                </>
              )}
            </Button>

            <Button
              onClick={handleCopyLink}
              variant="outline"
              size="lg"
              className="h-12"
            >
              {linkCopied ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Link Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Link
                </>
              )}
            </Button>
          </div>

          {/* Blockchain Explorer Link */}
          <div className="mb-8">
            <a
              href={`https://stellar.expert/explorer/public/tx/${txDetails.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-stellar-blue hover:underline"
            >
              View on Stellar Explorer
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          {/* Social Sharing */}
          <div className="border-t border-gray-200 pt-8">
            <Text className="text-sm font-semibold text-gray-600 mb-6 flex items-center justify-center gap-2">
              <Share2 className="w-4 h-4" />
              Share your impact
            </Text>
            <div className="flex justify-center gap-4">
              <button
                onClick={handleShareTwitter}
                className="w-12 h-12 flex items-center justify-center rounded-full bg-black text-white hover:opacity-90 transition-opacity"
                aria-label="Share on X (Twitter)"
              >
                <FaXTwitter className="w-5 h-5" />
              </button>
              <button
                onClick={handleShareWhatsApp}
                className="w-12 h-12 flex items-center justify-center rounded-full bg-[#25D366] text-white hover:opacity-90 transition-opacity"
                aria-label="Share on WhatsApp"
              >
                <FaWhatsapp className="w-6 h-6" />
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
