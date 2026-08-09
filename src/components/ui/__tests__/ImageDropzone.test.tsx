import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageDropzone } from '../ImageDropzone';
import * as compressionUtils from '@/lib/utils/imageCompression';
import { vi } from 'vitest';

vi.mock('@/lib/utils/imageCompression', () => ({
  compressImage: vi.fn(),
}));

describe('ImageDropzone Component', () => {
  const mockOnImageProcessed = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn(() => 'mock-url');
  });

  it('renders default dropzone UI correctly', () => {
    render(<ImageDropzone onImageProcessed={mockOnImageProcessed} />);
    expect(screen.getByText(/Drag & drop your image here/i)).toBeInTheDocument();
    expect(screen.getByText(/JPEG, PNG, WebP up to 5MB/i)).toBeInTheDocument();
  });

  it('handles invalid file types', () => {
    render(<ImageDropzone onImageProcessed={mockOnImageProcessed} />);
    const file = new File(['dummy content'], 'document.pdf', { type: 'application/pdf' });
    const input = screen.getByLabelText(/Image upload dropzone/i).querySelector('input');

    fireEvent.change(input!, { target: { files: [file] } });

    expect(screen.getByText(/Please upload a valid image file/i)).toBeInTheDocument();
    expect(mockOnImageProcessed).not.toHaveBeenCalled();
  });

  it('handles file size limits', async () => {
    render(<ImageDropzone onImageProcessed={mockOnImageProcessed} maxSizeMB={1} />);

    const file = new File([new ArrayBuffer(2 * 1024 * 1024)], 'large.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText(/Image upload dropzone/i).querySelector('input');

    await userEvent.upload(input!, file);

    expect(screen.getByText(/File size exceeds the 1MB limit/i)).toBeInTheDocument();
    expect(mockOnImageProcessed).not.toHaveBeenCalled();
  });

  it('processes image successfully on valid drop', async () => {
    const mockFile = new File(['image'], 'test.jpg', { type: 'image/jpeg' });
    const compressedFile = new File(['compressed'], 'test-compressed.jpg', { type: 'image/jpeg' });

    vi.mocked(compressionUtils.compressImage).mockResolvedValueOnce(compressedFile);

    render(<ImageDropzone onImageProcessed={mockOnImageProcessed} />);

    const dropzone = screen.getByRole('button', { name: /Image upload dropzone/i });

    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [mockFile],
        clearData: vi.fn(),
      },
    });

    expect(screen.getByText(/Compressing & optimizing/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(mockOnImageProcessed).toHaveBeenCalledWith(compressedFile);
    });

    expect(screen.getByAltText(/Upload preview/i)).toBeInTheDocument();
  });

  it('supports keyboard navigation', () => {
    render(<ImageDropzone onImageProcessed={mockOnImageProcessed} />);
    const dropzone = screen.getByRole('button', { name: /Image upload dropzone/i });

    dropzone.focus();
    expect(dropzone).toHaveFocus();

    const inputClickSpy = vi.spyOn(dropzone.querySelector('input')!, 'click');
    fireEvent.keyDown(dropzone, { key: 'Enter', code: 'Enter' });

    expect(inputClickSpy).toHaveBeenCalled();
  });
});
