import { useForm } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Leaf, Trees } from 'lucide-react';
import { useWizardStore, type ProjectType } from '../../store/wizard-store';
import { useEffect } from 'react';

interface Step1FormData {
  projectType: ProjectType;
  projectName: string;
  location: string;
}

export function Step1ProjectSelection() {
  const { projectData, updateProjectData, nextStep } = useWizardStore();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<Step1FormData>({
    defaultValues: {
      projectType: projectData.projectType,
      projectName: projectData.projectName,
      location: projectData.location,
    },
  });

  const projectType = watch('projectType');

  useEffect(() => {
    register('projectType', { required: 'Please select a project type' });
  }, [register]);

  const onSubmit = (data: Step1FormData) => {
    updateProjectData(data);
    nextStep();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Select Project Type</CardTitle>
          <CardDescription>
            Choose the type of environmental project you want to create
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <Label className="text-base">Project Type *</Label>
            <RadioGroup
              value={projectType || ''}
              onValueChange={(value) => setValue('projectType', value as ProjectType)}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              <div>
                <RadioGroupItem value="carbon-credit" id="carbon-credit" className="peer sr-only" />
                <Label
                  htmlFor="carbon-credit"
                  className="flex flex-col items-center justify-between rounded-xl border-2 border-gray-300 bg-white p-6 hover:bg-gray-50 peer-data-[state=checked]:border-green-600 peer-data-[state=checked]:bg-green-50 cursor-pointer transition-all min-h-[160px]"
                >
                  <Leaf className="w-12 h-12 text-green-600 mb-3" />
                  <div className="text-center space-y-1">
                    <p className="font-semibold text-lg">Carbon Credit Project</p>
                    <p className="text-sm text-gray-600">Earn from verified carbon offsetting</p>
                  </div>
                </Label>
              </div>

              <div>
                <RadioGroupItem value="tree-planting" id="tree-planting" className="peer sr-only" />
                <Label
                  htmlFor="tree-planting"
                  className="flex flex-col items-center justify-between rounded-xl border-2 border-gray-300 bg-white p-6 hover:bg-gray-50 peer-data-[state=checked]:border-emerald-600 peer-data-[state=checked]:bg-emerald-50 cursor-pointer transition-all min-h-[160px]"
                >
                  <Trees className="w-12 h-12 text-emerald-600 mb-3" />
                  <div className="text-center space-y-1">
                    <p className="font-semibold text-lg">Tree Planting Project</p>
                    <p className="text-sm text-gray-600">Receive support for reforestation</p>
                  </div>
                </Label>
              </div>
            </RadioGroup>
            {errors.projectType && (
              <p className="text-sm text-red-600 mt-2">{errors.projectType.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Basic Project Details</CardTitle>
          <CardDescription>Provide essential information about your project</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="projectName" className="text-base">
              Project Name *
            </Label>
            <Input
              id="projectName"
              placeholder="e.g., Green Valley Reforestation"
              className="h-12 text-base"
              {...register('projectName', {
                required: 'Project name is required',
                minLength: {
                  value: 3,
                  message: 'Project name must be at least 3 characters',
                },
              })}
            />
            {errors.projectName && (
              <p className="text-sm text-red-600">{errors.projectName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="location" className="text-base">
              Location *
            </Label>
            <Input
              id="location"
              placeholder="e.g., Maharashtra, India"
              className="h-12 text-base"
              {...register('location', {
                required: 'Location is required',
                minLength: {
                  value: 3,
                  message: 'Location must be at least 3 characters',
                },
              })}
            />
            {errors.location && <p className="text-sm text-red-600">{errors.location.message}</p>}
            <p className="text-sm text-gray-500">City, State/Province, Country</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" className="h-12 px-8 text-base">
          Continue to Project Parameters
        </Button>
      </div>
    </form>
  );
}
