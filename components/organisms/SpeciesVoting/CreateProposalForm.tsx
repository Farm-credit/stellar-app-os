'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Info } from 'lucide-react';

export function CreateProposalForm() {
  const [formData, setFormData] = useState({
    slug: '',
    name: '',
    co2KgPerYear: '',
    maturityYears: '',
    description: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // Validate inputs
      if (!formData.slug || !formData.name || !formData.co2KgPerYear || !formData.maturityYears) {
        throw new Error('All fields are required');
      }

      const co2_scaled = parseFloat(formData.co2KgPerYear) * 100;
      const maturity_years = parseInt(formData.maturityYears);

      if (co2_scaled <= 0) {
        throw new Error('CO₂ sequestration must be positive');
      }

      if (maturity_years <= 0) {
        throw new Error('Maturity years must be greater than 0');
      }

      // TODO: Submit proposal transaction
      console.log('Submitting proposal:', {
        slug: formData.slug,
        name: formData.name,
        co2_scaled,
        maturity_years,
      });

      // Reset form on success
      setFormData({
        slug: '',
        name: '',
        co2KgPerYear: '',
        maturityYears: '',
        description: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit proposal');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Proposals require community approval. Your TREE token holdings determine your voting power.
          Ensure CO₂ data is sourced from FAO/IPCC Tier-1 methodologies.
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label htmlFor="slug">Species Slug</Label>
        <Input
          id="slug"
          placeholder="e.g., mahogany"
          value={formData.slug}
          onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase() })}
          required
        />
        <p className="text-xs text-muted-foreground">
          Short identifier (lowercase, no spaces)
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Species Name</Label>
        <Input
          id="name"
          placeholder="e.g., Mahogany"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="co2">CO₂ Sequestration (kg/year)</Label>
          <Input
            id="co2"
            type="number"
            step="0.01"
            placeholder="e.g., 25.00"
            value={formData.co2KgPerYear}
            onChange={(e) => setFormData({ ...formData, co2KgPerYear: e.target.value })}
            required
          />
          <p className="text-xs text-muted-foreground">
            Based on FAO/IPCC Tier-1 data
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="maturity">Maturity (years)</Label>
          <Input
            id="maturity"
            type="number"
            placeholder="e.g., 25"
            value={formData.maturityYears}
            onChange={(e) => setFormData({ ...formData, maturityYears: e.target.value })}
            required
          />
          <p className="text-xs text-muted-foreground">
            Years to biomass maturity
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description (Optional)</Label>
        <Textarea
          id="description"
          placeholder="Additional context about this species..."
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Submitting...
          </>
        ) : (
          'Submit Proposal'
        )}
      </Button>
    </form>
  );
}
