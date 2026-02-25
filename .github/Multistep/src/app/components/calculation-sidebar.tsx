import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Leaf, DollarSign, TrendingUp } from 'lucide-react';
import { useWizardStore } from '../store/wizard-store';

export function CalculationSidebar() {
  const projectData = useWizardStore((state) => state.projectData);

  const estimatedEarnings = projectData.estimatedCredits * projectData.pricePerCredit;
  const earningsPerHectare =
    projectData.projectSize > 0 ? estimatedEarnings / projectData.projectSize : 0;

  return (
    <div className="space-y-4">
      <Card className="border-2 bg-gradient-to-br from-green-50 to-emerald-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-800">
            <Leaf className="w-5 h-5" />
            Live Calculations
          </CardTitle>
          <CardDescription>Real-time estimates based on your inputs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">Estimated Credits</span>
              <div className="flex items-center gap-1">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <span className="text-2xl font-bold text-green-700">
                  {projectData.estimatedCredits.toLocaleString()}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-500">Total CO₂ tonnes offset</p>
          </div>

          <div className="h-px bg-gray-200" />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">Potential Earnings</span>
              <div className="flex items-center gap-1">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                <span className="text-2xl font-bold text-emerald-700">
                  ${estimatedEarnings.toLocaleString()}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-500">Based on ${projectData.pricePerCredit}/credit</p>
          </div>

          {projectData.projectSize > 0 && (
            <>
              <div className="h-px bg-gray-200" />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600">Earnings per Hectare</span>
                  <span className="text-xl font-bold text-blue-700">
                    ${earningsPerHectare.toFixed(2)}
                  </span>
                </div>
                <p className="text-xs text-gray-500">Revenue efficiency metric</p>
              </div>
            </>
          )}

          <div className="h-px bg-gray-200" />

          <div className="rounded-lg bg-blue-50 p-4 border border-blue-200">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-blue-900">Project Duration</p>
                <p className="text-lg font-bold text-blue-700">
                  {projectData.projectDuration} months
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-2 bg-amber-50">
        <CardContent className="pt-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-amber-900">💡 Optimization Tip</p>
            <p className="text-xs text-amber-800 leading-relaxed">
              {projectData.estimatedCredits === 0
                ? 'Start by entering your project parameters to see potential earnings.'
                : projectData.estimatedCredits < 100
                  ? 'Consider expanding project size to increase carbon credit potential.'
                  : 'Your project shows strong carbon offset potential!'}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
