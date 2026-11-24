/**
 * Test suite for Issue #1668: AR Tree Visualisation for Sponsors
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ARTreeViewer } from '../components/organisms/ARTreeViewer';

describe('ARTreeViewer (Issue #1668)', () => {
  it('renders tree ID and species correctly', () => {
    render(<ARTreeViewer treeId="TREE-999" species="Teak" />);
    expect(screen.getByText(/AR Tree Visualisation: Teak/i)).toBeDefined();
    expect(screen.getByText(/TREE-999/i)).toBeDefined();
  });

  it('triggers shareable AR screenshot capture workflow', () => {
    render(<ARTreeViewer treeId="TREE-101" species="Moringa" />);
    const captureButton = screen.getByRole('button', { name: /Capture AR Snapshot/i });
    fireEvent.click(captureButton);
    expect(screen.getByText(/AR Screenshot saved successfully/i)).toBeDefined();
  });
});
