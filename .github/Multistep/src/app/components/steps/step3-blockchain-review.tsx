import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useWizardStore } from '../../store/wizard-store';
import { TransactionStepper, type TransactionStep, type StepStatus } from '../transaction-stepper';
import {
  ArrowLeft,
  Leaf,
  Trees,
  MapPin,
  Calendar,
  Maximize2,
  DollarSign,
  CheckCircle,
} from 'lucide-react';

export function Step3BlockchainReview() {
  const { projectData, prevStep, resetWizard } = useWizardStore();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [currentTransactionStep, setCurrentTransactionStep] = useState<TransactionStep>('approve');
  const [stepStatuses, setStepStatuses] = useState<Record<TransactionStep, StepStatus>>({
    approve: 'pending',
    sign: 'pending',
    confirm: 'pending',
  });

  const handleSubmit = async () => {
    setIsSubmitting(true);

    // Step 1: Approve Asset
    setStepStatuses({
      approve: 'active',
      sign: 'pending',
      confirm: 'pending',
    });
    setCurrentTransactionStep('approve');

    await new Promise((resolve) => setTimeout(resolve, 2000));

    setStepStatuses({
      approve: 'completed',
      sign: 'active',
      confirm: 'pending',
    });
    setCurrentTransactionStep('sign');

    // Step 2: Sign Transaction
    await new Promise((resolve) => setTimeout(resolve, 2000));

    setStepStatuses({
      approve: 'completed',
      sign: 'completed',
      confirm: 'active',
    });
    setCurrentTransactionStep('confirm');

    // Step 3: Confirm
    await new Promise((resolve) => setTimeout(resolve, 2000));

    setStepStatuses({
      approve: 'completed',
      sign: 'completed',
      confirm: 'completed',
    });

    setIsSubmitting(false);
    setIsCompleted(true);
  };

  const estimatedEarnings = projectData.estimatedCredits * projectData.pricePerCredit;

  if (isCompleted) {
    return (
      <div className="space-y-6">
        <Card className="border-2 border-green-500 bg-green-50">
          <CardContent className="pt-8 pb-8">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-12 h-12 text-white" />
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-bold text-green-900">
                  Project Submitted Successfully!
                </h2>
                <p className="text-lg text-green-700">
                  Your{' '}
                  {projectData.projectType === 'carbon-credit' ? 'Carbon Credit' : 'Tree Planting'}{' '}
                  project has been published on the blockchain.
                </p>
              </div>
              <div className="pt-4">
                <p className="text-sm text-green-800 font-medium">
                  Transaction ID: 0x{Math.random().toString(16).substr(2, 40)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What's Next?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-blue-700">1</span>
                </div>
                <div>
                  <p className="font-medium">Buyers will review your project</p>
                  <p className="text-sm text-gray-600">
                    Your project is now visible to potential buyers and donors
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-blue-700">2</span>
                </div>
                <div>
                  <p className="font-medium">Monitor your project dashboard</p>
                  <p className="text-sm text-gray-600">
                    Track interest, offers, and verification progress
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-blue-700">3</span>
                </div>
                <div>
                  <p className="font-medium">Complete verification process</p>
                  <p className="text-sm text-gray-600">
                    Our team will contact you for on-site verification
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center">
          <Button size="lg" onClick={resetWizard} className="h-12 px-8 text-base">
            Submit Another Project
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Review Project Details</CardTitle>
          <CardDescription>
            Verify all information before submitting to the blockchain
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                {projectData.projectType === 'carbon-credit' ? (
                  <Leaf className="w-6 h-6 text-blue-700" />
                ) : (
                  <Trees className="w-6 h-6 text-blue-700" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-lg">{projectData.projectName}</h3>
                  <Badge variant="outline" className="text-xs">
                    {projectData.projectType === 'carbon-credit'
                      ? 'Carbon Credit'
                      : 'Tree Planting'}
                  </Badge>
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <MapPin className="w-4 h-4" />
                  {projectData.location}
                </div>
              </div>
            </div>

            <div className="h-px bg-gray-200" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <Leaf className="w-5 h-5 text-green-700" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Estimated Credits</p>
                    <p className="text-xl font-bold text-gray-900">
                      {projectData.estimatedCredits.toLocaleString()} tonnes
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Potential Earnings</p>
                    <p className="text-xl font-bold text-gray-900">
                      ${estimatedEarnings.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Maximize2 className="w-5 h-5 text-blue-700" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Project Size</p>
                    <p className="text-xl font-bold text-gray-900">
                      {projectData.projectSize} hectares
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-purple-700" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Duration</p>
                    <p className="text-xl font-bold text-gray-900">
                      {projectData.projectDuration} months
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {isSubmitting && (
        <Card className="border-2 border-blue-500">
          <CardHeader>
            <CardTitle>Blockchain Transaction Progress</CardTitle>
            <CardDescription>Please wait while we process your submission</CardDescription>
          </CardHeader>
          <CardContent>
            <TransactionStepper currentStep={currentTransactionStep} stepStatuses={stepStatuses} />
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between gap-4">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={prevStep}
          disabled={isSubmitting}
          className="h-12 px-6 text-base"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button
          size="lg"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="h-12 px-8 text-base"
        >
          {isSubmitting ? 'Submitting to Blockchain...' : 'Submit Project'}
        </Button>
      </div>
    </div>
  );
}
