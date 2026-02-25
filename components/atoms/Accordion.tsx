'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

interface AccordionItem {
  id: string;
  title: string;
  content: string;
}
interface AccordionProps {
  items: AccordionItem[];
  className?: string;
}

export function Accordion({ items, className = '' }: AccordionProps): React.ReactNode {
  const [openId, setOpenId] = useState<string | null>(null);

  const toggleAccordion = (id: string): void => {
    setOpenId(openId === id ? null : id);
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {items.map((item) => (
        <div key={item.id} className="border border-border rounded-lg overflow-hidden bg-card">
          <button
            onClick={() => toggleAccordion(item.id)}
            aria-expanded={openId === item.id}
            aria-controls={`accordion-content-${item.id}`}
            className="w-full px-4 py-3 text-left font-semibold text-foreground hover:bg-muted/50 transition-colors flex items-center justify-between focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-blue"
          >
            <span>{item.title}</span>
            <motion.span
              animate={{ rotate: openId === item.id ? 180 : 0 }}
              transition={{ duration: 0.3 }}
              className="text-stellar-blue"
            >
              <ChevronDown className="w-4 h-4" />
            </motion.span>
          </button>

          <AnimatePresence>
            {openId === item.id && (
              <motion.div
                id={`accordion-content-${item.id}`}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="px-4 py-3 border-t border-border text-sm text-muted-foreground">
                  {item.content}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
