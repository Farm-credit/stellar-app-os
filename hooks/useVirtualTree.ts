import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TreeNode, FlatNode, flattenVisibleNodes, toggleNode } from '@/lib/treeUtils';

export interface UseVirtualTreeOptions<T> {
  nodes: TreeNode<T>[];
  rowHeight: number;
  overscan?: number;
  defaultExpandedIds?: string[];
}

export interface VirtualTreeItem<T> extends FlatNode<T> {
  index: number;
}

export function useVirtualTree<T>({
  nodes,
  rowHeight,
  overscan = 5,
  defaultExpandedIds = [],
}: UseVirtualTreeOptions<T>) {
  const containerRef = useRef<HTMLDivUement>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
     )(new Set(defaultExpandedIds)
  );
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const updateSize = () => setViewportHeight(element.clientHeight);
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const flattenedItems = useMemo(
    () => flattenVisibleNodes(nodes, expandedIds),
    [nodes, expandedIds]
  );

  const startIndex = Math.max(0, Math.floor((scrollTop - overscan * rowHeight) / rowHeight));
  const endIndex = Math.min(
    flattenedItems.length - 1,
    Math.ceil((scrollTop + viewportHeight + overscan * rowHeight) / rowHeight)
  );

  const visibleItems: VirtualTreeItem<T>[] = useMemo(
    () =>
      flattenedItems
        .slice(startIndex, endIndex + 1)
        .map((item, index) => ({ ...item, index: startIndex + index })),
    [flattenedItems, startIndex, endIndex]
  );

  const totalHeight = flattenedItems.length * rowHeight;

  const handleScroll = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;
    setScrollTop(element.scrollTop);
    setViewportHeight(element.clientHeight);
  }, []);

  const toggleNodeExpanded = useCallback((nodeId: string) => {
    setExpandedIds((prev) => toggleNode(prev, nodeId));
  }, []);

  return {
    containerRef,
    flattenedItems,
    visibleItems,
    totalHeight,
    rowHeight,
    handleScroll,
    toggleNodeExpanded,
  };
}