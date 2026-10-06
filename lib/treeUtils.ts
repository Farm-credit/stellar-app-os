export interface TreeNode<T = unknown> {
  id: string;
  children?: TreeNode<T>[];
  data?: T;
}

export interface FlatNode<T = unknown> {
  id: string;
  node: TreeNode<T>;
  depth: number;
  isExpanded: boolean;
  hasChildren: boolean;
}

export function flattenVisibleNodes<T>(
  nodes: TreeNode<T>[],
  expandedIds: Set<string>,
  depth = 0,
  result: FlatNode<T>[] = []
): FlatNode<T>[] {
  for (const node of nodes) {
    const hasChildren = !!node.children && node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    result.push({
      id: node.id,
      node,
      depth,
      isExpanded,
      hasChildren,
    });
    if (hasChildren && isExpanded) {
      flattenVisibleNodes(node.children!, expandedIds, depth + 1, result);
    }
  }
  return result;
}

export function toggleNode(expandedIds: Set<string>, nodeId: string): Set<string> {
  const next = new Set(expandedIds);
  if (next.has(nodeId)) {
    next.delete(nodeId);
  } else {
    next.add(nodeId);
  }
  return next;
}