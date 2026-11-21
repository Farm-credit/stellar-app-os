import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Modal } from './Modal';
import { Button } from '@/components/atoms/Button';

const meta: Meta<typeof Modal> = {
  title: 'UI/Modal',
  component: Modal,
  tags: ['autodocs'],
  argTypes: {
    open: { control: 'boolean' },
    title: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof Modal>;

const ModalWithState = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button stellar="primary" onClick={() => setOpen(true)}>
        Open Modal
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Sponsor a Tree">
        <div className="space-y-4">
          <p>Choose a tree species and quantity to sponsor.</p>
          <div className="flex gap-2 justify-end">
            <Button stellar="primary-outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button stellar="success" onClick={() => setOpen(false)}>
              Confirm Sponsorship
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export const Interactive: Story = {
  render: () => <ModalWithState />,
};

export const OpenWithTitle: Story = {
  args: {
    open: true,
    title: 'Confirm Donation',
    children: (
      <div className="space-y-4">
        <p>You are about to donate 50 XLM to the Amazon Reforestation project.</p>
        <p className="text-sm text-muted-foreground">
          This action will transfer tokens from your wallet.
        </p>
      </div>
    ),
  },
};

export const OpenWithoutTitle: Story = {
  args: {
    open: true,
    children: (
      <div className="space-y-4">
        <p>This modal has no title header.</p>
      </div>
    ),
  },
};
