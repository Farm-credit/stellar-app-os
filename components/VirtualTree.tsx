import React, { ReactNode } from 'react';
import { TreeNode } from '@/lib/treeUtils';
import { useVirtualTree } from '@/hooks/useVirtualTree';

export interface VirtualTreeRenderArgs<T> {
  node: TreeNode<T>;
  depth: number;
  isExpanded: boolean;
  hasChildren: boolean;
  onToggle: () => void;
}

interface VirtualTreeProps<T> {
  nodes: TreeNode<T>[];
  rowHeight?: number;
  overscan?: number;
  defaultExpandedIds?: string[];
  className?: string;
  renderNode: (args: VirtualTreeRenderArgs<T>) => ReactNode;
}

export function VirtualTree<T>({
  nodes,
  rowHeight = 32,
  overscan = 5,
  defaultExpandedIds = [],
  className,
  renderNode,
}: VirtualTreeProps<T>) {
  const {
    containerRef,
    visibleItems,
    totalHeight,
    rowHeight: actualRowHeight,
    handleScroll,
    toggleNodeExpanded,
  } = useVirtualTree<T>({
    nodes,
    rowHeight,
    overscan,
    defaultExpandedIds,
  });

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={`overflow-auto ${className ?? ''}`}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleItems.map((item) => (
          <div
            key={item.id}
            style={{
              position: 'absolute',
              top: item.index * actualRowHeight,
              left: 0,
              right: 0,
              height: actualRowHeight,
            }}
          >
            {renderNode({
              node: item.node,
              depth: item.depth,
              isExpanded: item.isExpanded,
              hasChildren: item.hasChildren,
              onToggle: () => toggleNodeExpanded(item.id),
            })}
          </div>
        ))}
      </div>
    </div>
  );
}