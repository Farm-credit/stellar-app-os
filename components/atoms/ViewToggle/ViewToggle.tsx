import { LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/atoms/Button';

export interface ViewToggleProps {
  view: 'grid' | 'list';
  onViewChange: (view: 'grid' | 'list') => void;
  className?: string;
}

export function ViewToggle({ view, onViewChange, className }: ViewToggleProps) {
  return (
    <div className={`inline-flex rounded-md border border-border ${className || ''}`} role="group">
      <Button
        onClick={() => onViewChange('grid')}
        variant="ghost"
        size="sm"
        className={`rounded-r-none border-r ${
          view === 'grid' ? 'bg-stellar-blue text-white hover:bg-stellar-blue/90' : 'hover:bg-muted'
        }`}
        aria-label={view === 'grid' ? 'Grid view active' : 'Switch to grid view'}
        aria-pressed={view === 'grid'}
      >
        <LayoutGrid className="h-4 w-4" />
        <span className="ml-2 hidden sm:inline">Grid</span>
      </Button>
      <Button
        onClick={() => onViewChange('list')}
        variant="ghost"
        size="sm"
        className={`rounded-l-none ${
          view === 'list' ? 'bg-stellar-blue text-white hover:bg-stellar-blue/90' : 'hover:bg-muted'
        }`}
        aria-label={view === 'list' ? 'List view active' : 'Switch to list view'}
        aria-pressed={view === 'list'}
      >
        <List className="h-4 w-4" />
        <span className="ml-2 hidden sm:inline">List</span>
      </Button>
    </div>
  );
}
