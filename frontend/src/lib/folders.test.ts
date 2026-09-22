import { expect, test } from "bun:test";

import { buildFolderTree, folderSubtreeIds, folderTrail } from "./folders";
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

test("builds the ancestor trail from the root down", () => {
  expect(folderTrail(FOLDERS, 3).map((node) => node.name)).toEqual(["Work", "Clients", "Acme"]);
  expect(folderTrail(FOLDERS, 1).map((node) => node.name)).toEqual(["Work"]);
});

test("a trail stops instead of looping when parents form a cycle", () => {
  const a = folder(10, "A", 11);
  const b = folder(11, "B", 10);

  const trail = folderTrail([a, b], 10);

  // Both are reachable, and the walk terminates rather than repeating forever.
  expect(trail.map((node) => node.name)).toEqual(["B", "A"]);
});

test("a trail for an unknown folder is empty", () => {
  expect(folderTrail(FOLDERS, 404)).toEqual([]);
});
