import type { Meta, StoryObj } from '@storybook/react';
import { ProjectCard } from './ProjectCard';
import type { CarbonProject } from '@/lib/types/carbon';

const meta: Meta<typeof ProjectCard> = {
  title: 'Molecules/ProjectCard',
  component: ProjectCard,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ProjectCard>;

const mockProject: CarbonProject = {
  id: '1',
  name: 'Amazon Reforestation Initiative',
  type: 'Reforestation',
  location: 'Amazon Basin, Brazil',
  description:
    'Restoring 10,000 hectares of degraded rainforest through native species planting and community engagement.',
  pricePerTon: 15,
  availableSupply: 5000,
  totalSupply: 10000,
  isOutOfStock: false,
  imageUrl: null,
};

export const Default: Story = {
  args: {
    project: mockProject,
  },
};

export const MangroveRestoration: Story = {
  args: {
    project: {
      ...mockProject,
      id: '2',
      name: 'Sundarbans Mangrove Restoration',
      type: 'Mangrove Restoration',
      location: 'Sundarbans, Bangladesh',
      description:
        'Restoring coastal mangrove ecosystems to protect against storm surges and sequester carbon.',
      pricePerTon: 20,
    },
  },
};

export const RenewableEnergy: Story = {
  args: {
    project: {
      ...mockProject,
      id: '3',
      name: 'Kenya Solar Farm',
      type: 'Renewable Energy',
      location: 'Nairobi, Kenya',
      description: 'Building a 50MW solar farm to provide clean energy to rural communities.',
      pricePerTon: 12,
    },
  },
};

export const SoldOut: Story = {
  args: {
    project: {
      ...mockProject,
      id: '4',
      name: 'Costa Rica Conservation',
      type: 'Conservation',
      location: 'Costa Rica',
      description: 'Protecting 5,000 hectares of primary rainforest.',
      availableSupply: 0,
      isOutOfStock: true,
    },
  },
};
