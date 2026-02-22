// components/organisms/ListCreditForm/PortfolioSelector.tsx
import React from 'react';
import { CreditAsset } from '@/lib/types'; // Mock type
import { ChevronDown } from 'lucide-react';

interface PortfolioSelectorProps {
  credits: CreditAsset[];
  onSelect: (asset: CreditAsset) => void;
  selectedAsset: CreditAsset | undefined;
}

const PortfolioSelector: React.FC<PortfolioSelectorProps> = ({ credits, onSelect, selectedAsset }) => {
  const [isOpen, setIsOpen] = React.useState(false);

  const displayValue = selectedAsset 
    ? `${selectedAsset.symbol} (Owned: ${selectedAsset.quantity})`
    : "Select Asset to List";

  return (
    <div className="relative mb-4">
      <label className="block text-sm font-medium text-foreground/80 dark:text-white/80 mb-1">
        Select Credit Asset
      </label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="w-full flex justify-between items-center p-3 border border-foreground/30 rounded-lg bg-white/10 dark:bg-white/10 text-left text-foreground dark:text-white focus:ring-primary focus:border-primary transition"
      >
        {displayValue}
        <ChevronDown className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <ul 
          className="absolute z-10 mt-1 w-full rounded-md bg-darkblue shadow-lg max-h-60 overflow-auto ring-1 ring-black ring-opacity-5 focus:outline-none"
          role="listbox"
        >
          {credits.map((asset) => (
            <li
              key={asset.asset}
              onClick={() => {
                onSelect(asset);
                setIsOpen(false);
              }}
              className="cursor-pointer select-none relative py-2 pl-3 pr-9 text-foreground/90 hover:bg-primary/20"
              role="option"
            >
              {`${asset.symbol} (Owned: ${asset.quantity})`}
              {selectedAsset?.asset === asset.asset && (
                <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-primary">
                  <CheckIcon className="h-5 w-5" />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// Mock Check Icon (assuming Lucide icons are used)
const CheckIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
);

export default PortfolioSelector;