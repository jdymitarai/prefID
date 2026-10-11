import { afterEach, describe, expect, it } from "vitest";
import { MAX_BATCH } from "../src/constants/index.js";
import {
  createId,
  createSortableId,
  id,
  sortableId,
  type IdGenerator,
  type PrefixedId,
} from "../src/index.js";
import { setBytesProvider, universalProvider } from "../src/internal/random.js";

afterEach(() => setBytesProvider(universalProvider));

describe("id.many()", () => {
  it("returns distinct, prefixed ids of the right length", () => {
    const ids = id.many("user", 1000);
    expect(ids).toHaveLength(1000);
    expect(new Set(ids).size).toBe(1000);
    for (const value of ids) {
      expect(value.startsWith("user_")).toBe(true);
      expect(value.length).toBe("user_".length + 24);
    }
  });

  it("is typed as PrefixedId<P, S>[]", () => {
    const ids: `user_${string}`[] = id.many("user", 2);
    const custom: `evt-${string}`[] = createId({ separator: "-" }).many(
      "evt",
      2,
    );
    expect(ids).toHaveLength(2);
    expect(custom[0].startsWith("evt-")).toBe(true);
  });

  it("honours size, alphabet and separator", () => {
    const gen = createId({ size: 5, alphabet: "ab", separator: ":" });
    for (const value of gen.many("k", 50)) expect(value).toMatch(/^k:[ab]{5}$/);
  });

  it("returns an empty array for a count of 0", () => {
    expect(id.many("user", 0)).toEqual([]);
  });

  it("accepts the maximum count", () => {
    expect(id.many("user", MAX_BATCH)).toHaveLength(MAX_BATCH);
  });

  it("rejects an invalid count", () => {
    for (const bad of [-1, 1.5, Number.NaN, Infinity, MAX_BATCH + 1]) {
      const call = () => id.many("user", bad);
      expect(call).toThrow(RangeError);
      expect(call).toThrow(/`count`/);
    }
  });

  it("validates the prefix like the single generator", () => {
    expect(() => id.many("", 1)).toThrow(TypeError);
    expect(() => id.many("us_er", 1)).toThrow(TypeError);
  });

  it("skips out-of-range bytes instead of wrapping them", () => {
    setBytesProvider((length) =>
      Uint8Array.from({ length }, (_, i) => (i % 2 === 0 ? 3 : 1)),
    );
    expect(createId({ alphabet: "abc", size: 4 }).many("k", 2)).toEqual([
      "k_bbbb",
      "k_bbbb",
    ]);
  });

  it("gives each id its own slice of the random bytes", () => {
    let next = 0;
    setBytesProvider((length) =>
      Uint8Array.from({ length }, () => next++ & 0xff),
    );
    expect(createId({ size: 4, alphabet: "abcdefgh" }).many("u", 2)).toEqual([
      "u_abcd",
      "u_efgh",
    ]);
  });

  it("never asks the random source for more than 65,536 bytes at once", () => {
    const sizes: number[] = [];
    setBytesProvider((length) => {
      sizes.push(length);
      return universalProvider(length);
    });
    expect(id.many("user", MAX_BATCH)).toHaveLength(MAX_BATCH);
    expect(sizes.length).toBeGreaterThan(1);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(65_536);
  });

  it("draws far fewer random calls than one per id", () => {
    let calls = 0;
    setBytesProvider((length) => {
      calls++;
      return universalProvider(length);
    });
    id.many("user", 1000);
    expect(calls).toBeLessThan(1000 / 10);
  });
});

describe("sortableId.many()", () => {
  it("returns strictly increasing ids", () => {
    const ids = sortableId.many("evt", 2000);
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
    expect(new Set(ids).size).toBe(2000);
  });

  it("stays strictly increasing across a monotonic overflow", () => {
    const gen = createSortableId({
      alphabet: "01",
      randomSize: 2,
      timestampSize: 4,
      now: () => 5,
    });
    const ids = gen.many("e", 10);
    expect(new Set(ids).size).toBe(10);
    expect(ids).toEqual([...ids].sort());
  });

  it("validates count and prefix", () => {
    for (const bad of [-1, 1.5, MAX_BATCH + 1]) {
      expect(() => sortableId.many("evt", bad)).toThrow(/`count`/);
    }
    expect(() => sortableId.many("", 0)).toThrow(TypeError);
  });
});

describe("IdGenerator compatibility", () => {
  it("still accepts a plain function", () => {
    const gen: IdGenerator = (prefix) =>
      `${prefix}_x` as PrefixedId<typeof prefix>;
    expect(gen("a")).toBe("a_x");
    const asBase: IdGenerator = id;
    expect(asBase("a").startsWith("a_")).toBe(true);
  });
});

describe("many() with strictPrefix", () => {
  it("rejects an invalid prefix like the single generator", () => {
    for (const gen of [
      createId({ strictPrefix: true }),
      createSortableId({ strictPrefix: true }),
    ]) {
      expect(() => gen.many("bad id", 3)).toThrow(
        /invalid character " " at index 3/,
      );
      expect(() => gen.many("bad id", 0)).toThrow(TypeError);
      expect(() => gen.many("a".repeat(64), 1)).toThrow(TypeError);
      expect(gen.many("ok", 3)).toHaveLength(3);
    }
  });
});
