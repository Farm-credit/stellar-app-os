'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { 
  CheckCircle, 
  Download, 
  Twitter, 
  Facebook, 
  Linkedin, 
  RefreshCcw,
  ExternalLink,
  Trees,
  DollarSign,
  Share2
} from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Badge } from '@/components/atoms/Badge';
import { useDonationContext } from '@/contexts/DonationContext';
import { formatCurrency, formatNumber, TREES_PER_DOLLAR } from '@/lib/constants/donation';
import { generateCertificatePdf, type CertificateData } from '@/lib/certificate';
import QRCode from 'qrcode';
import { cn } from '@/lib/utils';

interface DonationConfirmationProps {
  className?: string;
}

function DonationConfirmationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, resetFlow } = useDonationContext();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const txHash = searchParams.get('txHash') || searchParams.get('txId') || 'pending';
  const method = searchParams.get('method') || 'card';
  
  // Get donor name and amount from state, fallback to search params or defaults if state lost on refresh
  const donorName = state.donorInfo.name || 'Generous Donor';
  const amount = state.amount || parseFloat(searchParams.get('amount') || '0');
  const trees = Math.round(amount * TREES_PER_DOLLAR);
  const projectName = 'Stellar Amazon Reforestation'; // Default or project selection if available

  useEffect(() => {
    // Fire analytics event
    console.log('Analytics Event: donation_completed', {
      transaction_id: txHash,
      amount: amount,
      method: method,
      trees: trees
    });

    // Generate QR code for certificate
    const generateQR = async () => {
      try {
        const url = `https://stellar.expert/explorer/public/tx/${txHash}`;
        const dataUrl = await QRCode.toDataURL(url);
        setQrDataUrl(dataUrl);
      } catch (err) {
        console.error('Failed to generate QR code', err);
      }
    };

    if (txHash && txHash !== 'pending') {
      generateQR();
    }
  }, [txHash, amount, method, trees]);

  const handleDownloadCertificate = async () => {
    if (!qrDataUrl) return;
    
    setIsGeneratingPdf(true);
    try {
      const certificateData: CertificateData = {
        userName: donorName,
        walletAddress: method === 'stellar' ? 'Stellar Wallet' : 'Stripe Payment',
        quantityRetired: trees,
        projectName: projectName,
        projectDescription: 'Restoring critical biomes by planting native species in the heart of the Amazon rainforest.',
        transactionHash: txHash,
        retirementDate: new Date(),
        explorerBaseUrl: 'https://stellar.expert/explorer/public/tx'
      };

      generateCertificatePdf({
        qrDataUrl,
        data: certificateData
      });
    } catch (err) {
      console.error('Failed to generate certificate', err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const shareText = `I just donated to help plant ${trees} trees with ${projectName}! Join me in restoring our planet. 🌍🌳`;
  const shareUrl = typeof window !== 'undefined' ? window.location.origin : 'https://stellar-os.org';

  const shareOnTwitter = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, '_blank');
  };

  const shareOnFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank');
  };

  const shareOnLinkedin = () => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`, '_blank');
  };

  const handleDonateAgain = () => {
    resetFlow();
    router.push('/donate');
  };

  return (
    <div className="w-full max-w-2xl mx-auto py-12 px-4 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        {/* Success Icon Animation */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ 
            type: "spring",
            stiffness: 260,
            damping: 20,
            delay: 0.2 
          }}
          className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-stellar-green/10 mb-8"
        >
          <CheckCircle className="w-12 h-12 text-stellar-green" />
        </motion.div>

        <Badge variant="success" className="mb-4">
          COMPLETED
        </Badge>
        
        <Text variant="h1" className="text-4xl font-bold mb-4 text-gray-900">
          Thank you for your gift!
        </Text>
        
        <Text variant="muted" className="text-lg mb-10 max-w-lg mx-auto">
          Your donation has been confirmed and is already working to restore our local ecosystems. 
          A confirmation email has been sent to your inbox.
        </Text>

        {/* Donation Summary Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-10">
          <div className="bg-gray-50 px-6 py-4 border-bottom border-gray-200 flex justify-between items-center text-left">
            <Text className="font-semibold text-gray-700">Donation Summary</Text>
            <Text className="text-xs text-gray-400 font-mono select-all">TX: {txHash.slice(0, 8)}...{txHash.slice(-8)}</Text>
          </div>
          
          <div className="p-6 sm:p-8 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-stellar-green/5 p-4 rounded-xl border border-stellar-green/10 text-center">
                <Trees className="w-6 h-6 text-stellar-green mx-auto mb-2" />
                <Text className="text-2xl font-bold text-stellar-green">{formatNumber(trees)}</Text>
                <Text className="text-xs font-medium text-stellar-green uppercase">Trees Planted</Text>
              </div>
              <div className="bg-stellar-blue/5 p-4 rounded-xl border border-stellar-blue/10 text-center">
                <DollarSign className="w-6 h-6 text-stellar-blue mx-auto mb-2" />
                <Text className="text-2xl font-bold text-stellar-blue">{formatCurrency(amount)}</Text>
                <Text className="text-xs font-medium text-stellar-blue uppercase">Total Amount</Text>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-left">
              <div>
                <Text className="text-sm font-medium text-gray-500">Project</Text>
                <Text className="font-semibold text-gray-800">{projectName}</Text>
              </div>
              <div className="text-right">
                <Text className="text-sm font-medium text-gray-500">Donor</Text>
                <Text className="font-semibold text-gray-800">{donorName}</Text>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          <Button
            onClick={handleDownloadCertificate}
            disabled={!qrDataUrl || isGeneratingPdf}
            stellar="primary"
            size="lg"
            className="h-14 font-semibold"
          >
            {isGeneratingPdf ? (
              <span className="flex items-center gap-2">Generating...</span>
            ) : (
              <span className="flex items-center gap-2">
                <Download className="w-5 h-5" />
                Download Certificate
              </span>
            )}
          </Button>

          <Button
            onClick={handleDonateAgain}
            stellar="primary-outline"
            size="lg"
            className="h-14 font-semibold"
          >
            <span className="flex items-center gap-2">
              <RefreshCcw className="w-5 h-5" />
              Donate Again
            </span>
          </Button>
        </div>

        {/* Explorer Link */}
        <div className="mb-10">
          <a
            href={`https://stellar.expert/explorer/public/tx/${txHash}`}
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
            Share your impact with the world
          </Text>
          <div className="flex justify-center gap-4">
            <button
              onClick={shareOnTwitter}
              className="w-12 h-12 flex items-center justify-center rounded-full bg-[#1DA1F2] text-white hover:opacity-90 transition-opacity"
              aria-label="Share on X (Twitter)"
            >
              <Twitter className="w-6 h-6" />
            </button>
            <button
              onClick={shareOnFacebook}
              className="w-12 h-12 flex items-center justify-center rounded-full bg-[#1877F2] text-white hover:opacity-90 transition-opacity"
              aria-label="Share on Facebook"
            >
              <Facebook className="w-6 h-6" />
            </button>
            <button
              onClick={shareOnLinkedin}
              className="w-12 h-12 flex items-center justify-center rounded-full bg-[#0A66C2] text-white hover:opacity-90 transition-opacity"
              aria-label="Share on LinkedIn"
            >
              <Linkedin className="w-6 h-6" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function DonationConfirmation({ className }: DonationConfirmationProps) {
  return (
    <div className={cn("min-h-screen bg-gray-50", className)}>
      <Suspense fallback={
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-12 h-12 border-4 border-stellar-green border-t-transparent rounded-full animate-spin mb-4" />
          <Text>Verifying your donation...</Text>
        </div>
      }>
        <DonationConfirmationContent />
      </Suspense>
    </div>
  );
}
