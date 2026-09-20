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
