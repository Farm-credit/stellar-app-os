import Link from 'next/link';
import { CO2_METHODOLOGY_PATH } from '@/lib/carbon/ipcc-tier1';

interface Co2MethodologyLinkProps {
  className?: string;
  label?: string;
}

/** Link shown next to CO₂ figures so each number can be traced to its method (#1699). */
export function Co2MethodologyLink({
  className = '',
  label = 'How is this calculated?',
}: Co2MethodologyLinkProps) {
  return (
    <Link
      href={CO2_METHODOLOGY_PATH}
      className={`text-xs font-medium text-stellar-blue underline underline-offset-2 hover:text-stellar-blue/80 ${className}`}
    >
      {label}
    </Link>
  );
}
