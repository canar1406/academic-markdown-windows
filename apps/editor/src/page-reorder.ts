import type { VisualPageInventoryEntry } from './visual-page-flow';

export type PageMoveDirection = 'up' | 'down';

interface TopLevelState {
  name: string;
  meta?: { name?: unknown };
}

export interface PageMovePlan {
  startIndex: number;
  deleteCount: number;
  replacement: unknown[];
  /** Preferred top-level replacement block for caret restoration. */
  focusIndex: number;
  destinationPageIndex: number;
}

export function createMoveIntoBlankPagePlan(
  pages: VisualPageInventoryEntry[],
  states: unknown[],
  pageIndex: number,
  direction: PageMoveDirection,
): PageMovePlan | null {
  if (direction !== 'down') return null;
  const source = pages[pageIndex];
  const destination = pages[pageIndex + 1];
  if (!source || !destination || destination.kind !== 'blank' || destination.blockIndices.length > 0) {
    return null;
  }
  const sourceIndices = normalizedIndices(source.blockIndices, states.length);
  if (!sourceIndices) return null;
  const sourceSet = new Set(sourceIndices);
  if (!indicesAreExclusiveToPair(pages, sourceSet, new Set(), pageIndex, pageIndex + 1)) {
    return null;
  }
  const sourceSegment = sourceIndices.map(index => states[index]);
  const startIndex = sourceIndices[0];
  const alreadyHasBoundary = isPageBreakState(sourceSegment[0])
    || isPageBreakState(states[startIndex - 1]);
  const addedBoundaries = alreadyHasBoundary
    ? [pageBreakState()]
    : [pageBreakState(), pageBreakState()];
  const replacement = [...addedBoundaries, ...sourceSegment];
  return {
    startIndex,
    deleteCount: sourceSegment.length,
    replacement,
    focusIndex: preferredEditableIndex(replacement, addedBoundaries.length),
    destinationPageIndex: pageIndex + 1,
  };
}

export function createPageDeletePlan(
  pages: VisualPageInventoryEntry[],
  states: unknown[],
  pageIndex: number,
): number[] | null {
  const page = pages[pageIndex];
  const indices = page ? normalizedIndices(page.blockIndices, states.length) : null;
  if (!page?.deletable || !indices) return null;
  const ownedElsewhere = pages.some((candidate) => (
    candidate.pageIndex !== pageIndex
    && candidate.blockIndices.some(index => indices.includes(index))
  ));
  if (ownedElsewhere) return null;

  if (page.kind === 'blank') {
    const breaks = indices.filter(index => isPageBreakState(states[index]));
    if (breaks.length > 1 && breaks.length === indices.length) {
      return [breaks.at(-1)!];
    }
  }

  if (pageIndex === 0) {
    const nextPage = pages[1];
    const leadingBreak = nextPage?.blockIndices.find(index => isPageBreakState(states[index]));
    if (leadingBreak !== undefined) return [...indices, leadingBreak].sort((a, b) => a - b);
  }

  const hasBreakInIndices = indices.some(index => isPageBreakState(states[index]));
  if (pageIndex > 0 && page.kind !== 'blank' && !hasBreakInIndices) {
    const firstIndex = indices[0]!;
    if (firstIndex > 0 && isPageBreakState(states[firstIndex - 1])) {
      return [firstIndex - 1, ...indices];
    }
    const followingIndex = indices.at(-1)! + 1;
    if (
      page.kind === 'semantic'
      && followingIndex < states.length
      && isPageBreakState(states[followingIndex])
    ) {
      return [...indices, followingIndex];
    }
  }
  return indices;
}

const fullPageNames = new Set([
  'cover',
  'toc',
  'list-of-figures',
  'list-of-tables',
  'front-section',
]);

export function createAdjacentPageMovePlan(
  pages: VisualPageInventoryEntry[],
  states: unknown[],
  pageIndex: number,
  direction: PageMoveDirection,
): PageMovePlan | null {
  const destinationPageIndex = pageIndex + (direction === 'up' ? -1 : 1);
  const source = pages[pageIndex];
  const adjacent = pages[destinationPageIndex];
  if (
    !source
    || !adjacent
    || source.kind === 'blank'
    || adjacent.kind === 'blank'
    || source.blockIndices.length === 0
    || adjacent.blockIndices.length === 0
  ) {
    return null;
  }

  const sourceIndices = normalizedIndices(source.blockIndices, states.length);
  const adjacentIndices = normalizedIndices(adjacent.blockIndices, states.length);
  if (!sourceIndices || !adjacentIndices) return null;

  const sourceSet = new Set(sourceIndices);
  const adjacentSet = new Set(adjacentIndices);
  if (adjacentIndices.some(index => sourceSet.has(index))) return null;
  if (!indicesAreExclusiveToPair(pages, sourceSet, adjacentSet, pageIndex, destinationPageIndex)) {
    return null;
  }

  const combinedIndices = [...sourceIndices, ...adjacentIndices].sort((a, b) => a - b);
  const startIndex = combinedIndices[0];
  const endIndex = combinedIndices.at(-1)!;
  if (endIndex - startIndex + 1 !== combinedIndices.length) return null;

  const sourceSegment = sourceIndices.map(index => states[index]);
  const adjacentSegment = adjacentIndices.map(index => states[index]);
  const pairIncludesFirstPage = Math.min(pageIndex, destinationPageIndex) === 0;

  if (!pairIncludesFirstPage) {
    const separators = combinedIndices
      .map(index => states[index])
      .filter(isPageBreakState);
    const leftContent = sourceSegment.filter(state => !isPageBreakState(state));
    const rightContent = adjacentSegment.filter(state => !isPageBreakState(state));
    const left = direction === 'up' ? leftContent : rightContent;
    const right = direction === 'up' ? rightContent : leftContent;
    if (separators.length === 0) return null;

    // Later pages have a boundary before the pair and another one between the
    // pair. Keep those boundaries in their physical positions while swapping
    // only the page payloads (A | break | B -> A | break | C | break | B).
    const leadingBoundary = [separators[0]];
    const internalBoundaries = separators.slice(1);
    const replacement = [...leadingBoundary, ...left, ...internalBoundaries, ...right];
    const movedStart = direction === 'up'
      ? leadingBoundary.length
      : leadingBoundary.length + left.length + internalBoundaries.length;
    return {
      startIndex,
      deleteCount: combinedIndices.length,
      replacement,
      focusIndex: preferredEditableIndex(replacement, movedStart),
      destinationPageIndex,
    };
  }

  // Page zero has no leading boundary. When it participates in a swap, keep
  // the non-first page's break between the swapped payloads instead of moving
  // that break to the beginning of the document.
  const sourceContent = sourceSegment.filter(state => !isPageBreakState(state));
  const adjacentContent = adjacentSegment.filter(state => !isPageBreakState(state));
  const separators = [...sourceSegment, ...adjacentSegment].filter(isPageBreakState);
  const left = direction === 'up' ? sourceContent : adjacentContent;
  const right = direction === 'up' ? adjacentContent : sourceContent;
  const leftPage = direction === 'up' ? source : adjacent;
  const rightPage = direction === 'up' ? adjacent : source;
  const boundary = separators.length > 0
    ? separators
    : needsExplicitBoundary(left, right, leftPage, rightPage)
      ? [pageBreakState()]
      : [];
  const replacement = [...left, ...boundary, ...right];
  const movedStart = direction === 'up' ? 0 : left.length + boundary.length;

  return {
    startIndex,
    deleteCount: combinedIndices.length,
    replacement,
    focusIndex: preferredEditableIndex(replacement, movedStart),
    destinationPageIndex,
  };
}

function preferredEditableIndex(states: unknown[], preferredStart: number): number {
  for (let index = preferredStart; index < states.length; index += 1) {
    if (!isAtomicStructureState(states[index])) return index;
  }
  for (let index = preferredStart - 1; index >= 0; index -= 1) {
    if (!isAtomicStructureState(states[index])) return index;
  }
  return -1;
}

function normalizedIndices(indices: number[], stateCount: number): number[] | null {
  const normalized = [...new Set(indices)].sort((a, b) => a - b);
  if (normalized.length === 0 || normalized.some(index => (
    !Number.isInteger(index) || index < 0 || index >= stateCount
  ))) return null;
  return normalized;
}

function indicesAreExclusiveToPair(
  pages: VisualPageInventoryEntry[],
  source: Set<number>,
  adjacent: Set<number>,
  sourcePageIndex: number,
  adjacentPageIndex: number,
): boolean {
  const pairIndices = new Set([...source, ...adjacent]);
  return pages.every((page) => (
    page.pageIndex === sourcePageIndex
    || page.pageIndex === adjacentPageIndex
    || page.blockIndices.every(index => !pairIndices.has(index))
  ));
}

function needsExplicitBoundary(
  left: unknown[],
  right: unknown[],
  leftPage: VisualPageInventoryEntry,
  rightPage: VisualPageInventoryEntry,
): boolean {
  if (left.length === 0 || right.length === 0) return true;
  return leftPage.kind !== 'semantic' && rightPage.kind !== 'semantic';
}

function isPageBreakState(value: unknown): boolean {
  const state = asState(value);
  return state?.name === 'lmx-directive' && state.meta?.name === 'pagebreak';
}

function isFullPageState(value: unknown): boolean {
  const state = asState(value);
  return state?.name === 'lmx-directive'
    && typeof state.meta?.name === 'string'
    && fullPageNames.has(state.meta.name);
}

function isAtomicStructureState(value: unknown): boolean {
  return isFullPageState(value) || isPageBreakState(value);
}

function asState(value: unknown): TopLevelState | null {
  if (!value || typeof value !== 'object' || !('name' in value)) return null;
  return typeof value.name === 'string' ? value as TopLevelState : null;
}

function pageBreakState(): unknown {
  return {
    name: 'lmx-directive',
    meta: { name: 'pagebreak', attributes: {} },
    children: [{ name: 'paragraph', text: '' }],
  };
}
