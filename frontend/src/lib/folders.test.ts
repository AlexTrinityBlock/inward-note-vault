import { expect, test } from "bun:test";

import { buildFolderTree, folderSubtreeIds } from "./folders";
import type { FolderRead } from "../client/generated/models";

function folder(id: number, name: string, parentId: number | null): FolderRead {
  return {
    id,
    name,
    parent_id: parentId,
    path: name,
  };
}

const FOLDERS: FolderRead[] = [
  folder(1, "Work", null),
  folder(2, "Clients", 1),
  folder(3, "Acme", 2),
  folder(4, "Home", null),
];

test("builds a tree from parent_id links", () => {
  const tree = buildFolderTree(FOLDERS);

  expect(tree.map((node) => node.name)).toEqual(["Home", "Work"]);
  expect(tree[1].children[0].name).toBe("Clients");
  expect(tree[1].children[0].children[0].name).toBe("Acme");
});

test("treats a folder whose parent is missing as a root", () => {
  const orphan = folder(9, "Orphan", 999);

  const tree = buildFolderTree([...FOLDERS, orphan]);

  expect(tree.map((node) => node.name)).toContain("Orphan");
});

test("collects a folder's whole subtree", () => {
  expect(folderSubtreeIds(FOLDERS, 1).sort()).toEqual([1, 2, 3]);
  expect(folderSubtreeIds(FOLDERS, 4)).toEqual([4]);
});
