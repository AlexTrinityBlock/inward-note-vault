import { expect, test } from "bun:test";

import { en, zhCN, zhTW } from "./dictionaries";

/** The Chinese dictionaries must cover every English key. */
test("dictionaries stay in sync", () => {
  const sections = Object.keys(en) as (keyof typeof en)[];

  for (const [name, dictionary] of [
    ["zh-TW", zhTW],
    ["zh-CN", zhCN],
  ] as const) {
    expect(Object.keys(dictionary).sort()).toEqual([...sections].sort());

    for (const section of sections) {
      expect(Object.keys(dictionary[section]).sort()).toEqual(Object.keys(en[section]).sort());
    }
  }
});

test("no translation is left empty", () => {
  for (const dictionary of [en, zhTW, zhCN]) {
    for (const section of Object.values(dictionary)) {
      for (const value of Object.values(section)) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  }
});

test("Simplified and Traditional Chinese actually differ", () => {
  expect(zhCN.notes.newNote).not.toBe(zhTW.notes.newNote);
});
