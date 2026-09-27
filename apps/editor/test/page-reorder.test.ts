import { describe, expect, it } from 'vitest';
import {
  createAdjacentPageMovePlan,
  createPageDeletePlan,
  createMoveIntoBlankPagePlan,
} from '../src/page-reorder.js';

const pageBreakState = (index: number): State => ({
  name: 'lmx-directive',
  meta: { name: 'pagebreak', attributes: { index } },
  children: [{ name: 'paragraph', text: '' }],
});

const stateName = (state: unknown): string => {
  const value = state as State;
  return value.meta?.name ?? value.name;
};
import type { VisualPageInventoryEntry } from '../src/visual-page-flow.js';

type State = {
  name: string;
  meta?: { name?: string; attributes?: Record<string, unknown> };
  text?: string;
  children?: State[];
};

const cover = (): State => ({
  name: 'lmx-directive',
  meta: { name: 'cover', attributes: {} },
  children: [{ name: 'paragraph', text: '' }],
});

const pageBreak = (): State => ({
  name: 'lmx-directive',
  meta: { name: 'pagebreak', attributes: {} },
  children: [{ name: 'paragraph', text: '' }],
});

const paragraph = (text: string): State => ({ name: 'paragraph', text });

function page(
  pageIndex: number,
  blockIndices: number[],
  kind: VisualPageInventoryEntry['kind'] = 'content',
): VisualPageInventoryEntry {
  return {
    pageIndex,
    kind,
    semanticName: kind === 'semantic' ? 'cover' : null,
    blockCount: blockIndices.length,
    blockIndices,
    insertAfterIndex: blockIndices.at(-1) ?? -1,
    deletable: blockIndices.length > 0,
    title: `Trang ${pageIndex + 1}`,
  };
}

describe('createMoveIntoBlankPagePlan', () => {
  it('creates a blank slot before moving a cover with no existing boundary', () => {
    const states = [cover(), cover()];
    const pages = [page(0, [0], 'semantic'), page(1, [1], 'semantic'), page(2, [], 'blank')];

    const plan = createMoveIntoBlankPagePlan(pages, states, 1, 'down');

    expect(plan).toMatchObject({ startIndex: 1, deleteCount: 1, destinationPageIndex: 2 });
    expect(plan?.replacement.map(stateName)).toEqual(['pagebreak', 'pagebreak', 'cover']);
  });

  it('adds one more boundary when moving a cover down repeatedly', () => {
    const states = [cover(), pageBreak(), cover()];
    const pages = [page(0, [0], 'semantic'), page(1, [1, 2], 'semantic'), page(2, [], 'blank')];

    const plan = createMoveIntoBlankPagePlan(pages, states, 1, 'down');

    expect(plan).toMatchObject({ startIndex: 1, deleteCount: 2, destinationPageIndex: 2 });
    expect(plan?.replacement.map(stateName)).toEqual(['pagebreak', 'pagebreak', 'cover']);
  });
});

describe('createAdjacentPageMovePlan', () => {
  it('keeps exactly one page boundary when ordinary pages swap', () => {
    const states = [paragraph('A'), pageBreak(), paragraph('B')];
    const pages = [page(0, [0]), page(1, [1, 2])];

    const plan = createAdjacentPageMovePlan(pages, states, 1, 'up');

    expect(plan).toMatchObject({
      startIndex: 0,
      deleteCount: 3,
      destinationPageIndex: 0,
      focusIndex: 0,
    });
    expect(plan?.replacement).toEqual([states[2], states[1], states[0]]);
  });

  it('keeps pagebreak semantics unchanged when a cover crosses the boundary', () => {
    const states = [paragraph('Nội dung'), pageBreak(), cover()];
    const pages = [page(0, [0]), page(1, [1, 2], 'semantic')];

    const plan = createAdjacentPageMovePlan(pages, states, 1, 'up');

    expect(plan?.replacement).toEqual([states[2], states[1], states[0]]);
    expect(plan?.replacement.filter((state) => (state as State).meta?.name === 'pagebreak'))
      .toHaveLength(1);
  });

  it('plans a duplicate-cover move after Add Page has committed canonical state', () => {
    const states = [cover(), pageBreak(), cover()];
    const pages = [page(0, [0], 'semantic'), page(1, [1, 2], 'semantic')];

    const plan = createAdjacentPageMovePlan(pages, states, 1, 'up');

    expect(plan).toMatchObject({
      startIndex: 0,
      deleteCount: 3,
      destinationPageIndex: 0,
      focusIndex: -1,
    });
    expect(plan?.replacement).toEqual([states[2], states[1], states[0]]);
  });

  it('keeps both leading boundaries when swapping later pages', () => {
    const states = [paragraph('A'), pageBreak(), paragraph('B'), pageBreak(), paragraph('C')];
    const pages = [page(0, [0]), page(1, [1, 2]), page(2, [3, 4])];

    const plan = createAdjacentPageMovePlan(pages, states, 2, 'up');

    expect(plan).toMatchObject({ focusIndex: 1, destinationPageIndex: 1 });
    expect(plan?.replacement).toEqual([states[1], states[4], states[3], states[2]]);
    expect(plan?.replacement.filter((state) => (state as State).meta?.name === 'pagebreak'))
      .toHaveLength(2);
  });

  it('treats a disabled cover as ordinary content when rebuilding a boundary', () => {
    const states = [cover(), paragraph('Trang sau')];
    const pages = [page(0, [0]), page(1, [1])];

    const plan = createAdjacentPageMovePlan(pages, states, 1, 'up');

    expect(plan?.replacement.map((state) => (state as State).meta?.name ?? (state as State).name))
      .toEqual(['paragraph', 'pagebreak', 'cover']);
  });

  it('rejects moving across a blank page whose boundaries cannot be split safely', () => {
    const states = [paragraph('A'), pageBreak(), pageBreak(), paragraph('B')];
    const pages = [page(0, [0]), page(1, [1, 2], 'blank'), page(2, [3])];

    expect(createAdjacentPageMovePlan(pages, states, 1, 'down')).toBeNull();
    expect(createAdjacentPageMovePlan(pages, states, 2, 'up')).toBeNull();
  });

  it('rejects a move when a measured block belongs to another page', () => {
    const states = [paragraph('Dài'), pageBreak(), paragraph('Sau')];
    const pages = [page(0, [0]), page(1, [0, 1]), page(2, [2])];

    expect(createAdjacentPageMovePlan(pages, states, 1, 'down')).toBeNull();
  });
});

describe('createPageDeletePlan', () => {
  it('removes the following boundary when deleting the first page', () => {
    const states = [paragraph('A'), pageBreak(), paragraph('B')];
    const pages = [page(0, [0]), page(1, [1, 2])];

    expect(createPageDeletePlan(pages, states, 0)).toEqual([0, 1]);
  });

  it('removes only the trailing break from a consecutive-break blank page', () => {
    const states = [paragraph('A'), pageBreak(), pageBreak(), paragraph('B')];
    const pages = [page(0, [0]), page(1, [1, 2], 'blank'), page(2, [3])];

    expect(createPageDeletePlan(pages, states, 1)).toEqual([2]);
  });

  it('rejects deleting a block shared with another measured page', () => {
    const states = [paragraph('Dài')];
    const pages = [page(0, [0]), page(1, [0])];
    pages[0].deletable = false;
    pages[1].deletable = false;

    expect(createPageDeletePlan(pages, states, 1)).toBeNull();
  });
});
