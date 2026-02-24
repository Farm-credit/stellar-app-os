import { useForm } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Slider } from '../ui/slider';
import { useWizardStore } from '../../store/wizard-store';
import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';

interface Step2FormData {
  estimatedCredits: number;
  projectSize: number;
  projectDuration: number;
  pricePerCredit: number;
}

export function Step2ProjectParameters() {
  const { projectData, updateProjectData, nextStep, prevStep } = useWizardStore();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<Step2FormData>({
    defaultValues: {
      estimatedCredits: projectData.estimatedCredits || 0,
      projectSize: projectData.projectSize || 0,
      projectDuration: projectData.projectDuration || 12,
      pricePerCredit: projectData.pricePerCredit || 15,
    },
  });

  const watchedFields = watch();

  // Update store in real-time for live calculations
  useEffect(() => {
    updateProjectData(watchedFields);
  }, [watchedFields, updateProjectData]);

  const onSubmit = (data: Step2FormData) => {
    updateProjectData(data);
    nextStep();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Carbon Credits Estimation</CardTitle>
          <CardDescription>Estimate the carbon credits your project will generate</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="estimatedCredits" className="text-base">
              Estimated Carbon Credits (tonnes CO₂) *
            </Label>
            <Input
              id="estimatedCredits"
              type="number"
              placeholder="e.g., 500"
              className="h-12 text-base"
              {...register('estimatedCredits', {
                required: 'Estimated credits is required',
                min: { value: 1, message: 'Must be at least 1' },
                valueAsNumber: true,
              })}
            />
            {errors.estimatedCredits && (
              <p className="text-sm text-red-600">{errors.estimatedCredits.message}</p>
            )}
            <p className="text-sm text-gray-500">
              Enter the expected CO₂ tonnes your project will offset
            </p>
          </div>

          <div className="space-y-3">
            <Label htmlFor="pricePerCredit" className="text-base">
              Price per Credit (USD) *
            </Label>
            <Input
              id="pricePerCredit"
              type="number"
              step="0.01"
              placeholder="e.g., 15"
              className="h-12 text-base"
              {...register('pricePerCredit', {
                required: 'Price per credit is required',
                min: { value: 0.01, message: 'Must be greater than 0' },
                valueAsNumber: true,
              })}
            />
            {errors.pricePerCredit && (
              <p className="text-sm text-red-600">{errors.pricePerCredit.message}</p>
            )}
            <p className="text-sm text-gray-500">Current market rate or your target price</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Project Specifications</CardTitle>
          <CardDescription>Define the scope and timeline of your project</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="projectSize" className="text-base">
              Project Size (hectares) *
            </Label>
            <Input
              id="projectSize"
              type="number"
              step="0.01"
              placeholder="e.g., 10.5"
              className="h-12 text-base"
              {...register('projectSize', {
                required: 'Project size is required',
                min: { value: 0.01, message: 'Must be greater than 0' },
                valueAsNumber: true,
              })}
            />
            {errors.projectSize && (
              <p className="text-sm text-red-600">{errors.projectSize.message}</p>
            )}
            <p className="text-sm text-gray-500">Total land area dedicated to the project</p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="projectDuration" className="text-base">
                Project Duration: {watchedFields.projectDuration} months
              </Label>
            </div>
            <Slider
              id="projectDuration"
              min={6}
              max={120}
              step={6}
              value={[watchedFields.projectDuration]}
              onValueChange={([value]) => setValue('projectDuration', value)}
              className="py-4"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>6 months</span>
              <span>10 years</span>
            </div>
            <p className="text-sm text-gray-500">Expected timeframe for project completion</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between gap-4">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={prevStep}
          className="h-12 px-6 text-base"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button type="submit" size="lg" className="h-12 px-8 text-base">
          Continue to Review
        </Button>
      </div>
    </form>
  );
}
