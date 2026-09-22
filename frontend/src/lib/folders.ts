import type { FolderRead } from "../client/generated/models";

export type FolderNode = FolderRead & { children: FolderNode[] };

/** Turn the flat `parent_id` list from the API into a tree of folders. */
export function buildFolderTree(folders: FolderRead[]): FolderNode[] {
  const nodes = new Map<number, FolderNode>(
    folders.map((folder) => [folder.id, { ...folder, children: [] }]),
  );
  const roots: FolderNode[] = [];

  for (const node of nodes.values()) {
    const parent = node.parent_id === null ? undefined : nodes.get(node.parent_id);
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortByName = (list: FolderNode[]): void => {
    list.sort((left, right) => left.name.localeCompare(right.name));
    for (const node of list) {
      sortByName(node.children);
    }
  };
  sortByName(roots);

  return roots;
}

/** Every folder id inside `folderId`, including the folder itself. */
export function folderSubtreeIds(folders: FolderRead[], folderId: number): number[] {
  const childrenOf = new Map<number, number[]>();
  for (const folder of folders) {
    if (folder.parent_id === null) continue;
    childrenOf.set(folder.parent_id, [...(childrenOf.get(folder.parent_id) ?? []), folder.id]);
  }

  const collected: number[] = [];
  const queue = [folderId];
  while (queue.length > 0) {
    const current = queue.shift() as number;
    collected.push(current);
    queue.push(...(childrenOf.get(current) ?? []));
  }
  return collected;
}

/**
 * The ancestor chain from the root down to `folderId`, inclusive.
 *
 * This is what a breadcrumb renders. A folder whose `parent_id` points at an id
 * that is not in the list is treated as a root, the same way `buildFolderTree`
 * treats it, so one dangling reference cannot produce an endless walk.
 */
export function folderTrail(folders: FolderRead[], folderId: number): FolderRead[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const trail: FolderRead[] = [];
  const seen = new Set<number>();

  let current = byId.get(folderId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    trail.unshift(current);
    current = current.parent_id === null ? undefined : byId.get(current.parent_id);
  }
  return trail;
}
