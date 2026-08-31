import type { Meta, StoryObj } from '@storybook/react';
import { FormField } from './FormField';

const meta: Meta<typeof FormField> = {
  title: 'Molecules/FormField',
  component: FormField,
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    helperText: { control: 'text' },
    errorMessage: { control: 'text' },
    disabled: { control: 'boolean' },
    placeholder: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof FormField>;

export const Default: Story = {
  args: {
    label: 'Tree Species',
    placeholder: 'Enter species name',
  },
};

export const WithHelperText: Story = {
  args: {
    label: 'Carbon Offset (tons)',
    placeholder: '0.00',
    helperText: 'Estimated CO₂ offset per year',
  },
};

export const WithError: Story = {
  args: {
    label: 'Wallet Address',
    placeholder: 'ST...',
    errorMessage: 'Invalid Stellar address format',
  },
};

export const Disabled: Story = {
  args: {
    label: 'Project Name',
    value: 'Amazon Reforestation',
    disabled: true,
  },
};

export const WithValue: Story = {
  args: {
    label: 'Donation Amount (XLM)',
    value: '100',
    helperText: 'Minimum donation: 10 XLM',
  },
};
