import { useWizardStore } from '../store/wizard-store';
import { Step1ProjectSelection } from './steps/step1-project-selection';
import { Step2ProjectParameters } from './steps/step2-project-parameters';
import { Step3BlockchainReview } from './steps/step3-blockchain-review';
import { CalculationSidebar } from './calculation-sidebar';
import { Progress } from './ui/progress';
import { Card } from './ui/card';
import { cn } from './ui/utils';

export function ProjectWizard() {
  const currentStep = useWizardStore((state) => state.currentStep);

  const steps = [
    { number: 1, title: 'Project Selection', description: 'Choose project type' },
    { number: 2, title: 'Project Parameters', description: 'Define specifications' },
    { number: 3, title: 'Blockchain Review', description: 'Review and submit' },
  ];

  const progressPercentage = ((currentStep - 1) / (steps.length - 1)) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">
            Submit Your Environmental Project
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            List your carbon credit or tree-planting project to connect with buyers and donors
            worldwide
          </p>
        </div>

        {/* Progress Bar */}
        <Card className="mb-8 p-6 border-2">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              {steps.map((step, index) => (
                <div key={step.number} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={cn(
                        'w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg border-2 transition-all',
                        currentStep > step.number && 'bg-green-500 border-green-500 text-white',
                        currentStep === step.number && 'bg-blue-500 border-blue-500 text-white',
                        currentStep < step.number && 'bg-white border-gray-300 text-gray-400'
                      )}
                    >
                      {step.number}
                    </div>
                    <div className="mt-2 text-center hidden md:block">
                      <p
                        className={cn(
                          'text-sm font-semibold',
                          currentStep >= step.number ? 'text-gray-900' : 'text-gray-400'
                        )}
                      >
                        {step.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{step.description}</p>
                    </div>
                  </div>

                  {index < steps.length - 1 && (
                    <div className="flex-1 h-1 mx-2 md:mx-4 -mt-8 md:-mt-16">
                      <div
                        className={cn(
                          'h-full rounded',
                          currentStep > step.number ? 'bg-green-500' : 'bg-gray-200'
                        )}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <Progress value={progressPercentage} className="h-2" />

            {/* Mobile step indicator */}
            <div className="md:hidden text-center">
              <p className="text-sm font-semibold text-gray-900">{steps[currentStep - 1].title}</p>
              <p className="text-xs text-gray-500">{steps[currentStep - 1].description}</p>
            </div>
          </div>
        </Card>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form Content */}
          <div className="lg:col-span-2">
            {currentStep === 1 && <Step1ProjectSelection />}
            {currentStep === 2 && <Step2ProjectParameters />}
            {currentStep === 3 && <Step3BlockchainReview />}
          </div>

          {/* Sidebar */}
          {currentStep === 2 && (
            <div className="lg:col-span-1">
              <div className="sticky top-8">
                <CalculationSidebar />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
