import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  title: 'Atoms/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    stellar: {
      control: 'select',
      options: [
        'primary',
        'accent',
        'cyan',
        'success',
        'primary-outline',
        'accent-outline',
        'success-outline',
      ],
    },
    width: {
      control: 'select',
      options: ['short', 'medium', 'long', 'full', 'auto'],
    },
    disabled: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    children: 'Sponsor Tree',
    stellar: 'primary',
  },
};

export const Accent: Story = {
  args: {
    children: 'Donate',
    stellar: 'accent',
  },
};

export const Cyan: Story = {
  args: {
    children: 'Learn More',
    stellar: 'cyan',
  },
};

export const Success: Story = {
  args: {
    children: 'Verify Planting',
    stellar: 'success',
  },
};

export const PrimaryOutline: Story = {
  args: {
    children: 'Cancel',
    stellar: 'primary-outline',
  },
};

export const AccentOutline: Story = {
  args: {
    children: 'View Details',
    stellar: 'accent-outline',
  },
};

export const SuccessOutline: Story = {
  args: {
    children: 'Download Report',
    stellar: 'success-outline',
  },
};

export const Disabled: Story = {
  args: {
    children: 'Disabled',
    stellar: 'primary',
    disabled: true,
  },
};

export const FullWidth: Story = {
  args: {
    children: 'Full Width Button',
    stellar: 'primary',
    width: 'full',
  },
};
