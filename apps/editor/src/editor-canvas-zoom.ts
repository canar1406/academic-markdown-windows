const MINIMUM_ZOOM = 0.15;
const MAXIMUM_ZOOM = 4;

export const VISUAL_ZOOM_INTERACTION_CHANGED = 'visual-zoom-interaction-changed';
export const VISUAL_ZOOM_VIEWPORT_ANCHORED = 'visual-zoom-viewport-anchored';

interface WebKitGestureEvent extends Event {
  readonly scale: number;
  readonly clientX?: number;
  readonly clientY?: number;
}

interface ZoomAnchor {
  viewportX: number;
  viewportY: number;
  canvasX: number;
  canvasY: number;
  baseCanvasLeft: number;
  baseCanvasTop: number;
}

export interface EditorCanvasZoom {
  setZoom(magnification: number, pageIndex?: number | null, interactive?: boolean): boolean;
  dispose(): void;
}

/** Scales the fixed A4 canvas without changing its CSS layout or text wrapping. */
export function installEditorCanvasZoom(canvas: HTMLElement): EditorCanvasZoom {
  const space = canvas.parentElement;
  const stage = canvas.closest<HTMLElement>('.editor-stage');
  const editor = canvas.querySelector<HTMLElement>('#editor');
  if (!space || !stage || !editor) {
    return { setZoom: () => false, dispose: () => undefined };
  }

  let magnification = 1;
  let committedMagnification = 1;
  const canvasLayoutWidth = canvas.offsetWidth;
  let resizeFrame: number | null = null;
  let zoomFrame: number | null = null;
  let gestureStartMagnification = magnification;
  let gestureMagnification = magnification;
  let gestureActive = false;
  let gestureAnchor: ZoomAnchor | null = null;
  let viewportWidth = stage.clientWidth;
  let viewportHeight = stage.clientHeight;
  let inputSamples = 0;
  let compositorFrames = 0;
  let settleCommits = 0;
  let viewportCorrections = 0;
  const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = reducedMotionQuery.matches;
  let pendingZoom: {
    magnification: number;
    pageIndex: number | null;
    interactive: boolean;
  } | null = null;

  const publishMetrics = (): void => {
    canvas.dataset.zoomInputSamples = String(inputSamples);
    canvas.dataset.zoomCompositorFrames = String(compositorFrames);
    canvas.dataset.zoomSettleCommits = String(settleCommits);
    canvas.dataset.zoomViewportCorrections = String(viewportCorrections);
    canvas.dataset.zoomReducedMotion = String(reducedMotion);
  };
  const handleReducedMotionChange = (event: MediaQueryListEvent): void => {
    reducedMotion = event.matches;
    publishMetrics();
  };

  const synchronizeScrollSpace = (): void => {
    resizeFrame = null;
    space.style.width = `${canvas.offsetWidth * committedMagnification}px`;
    space.style.height = `${canvas.offsetHeight * committedMagnification}px`;
  };
  const scheduleScrollSpaceSynchronization = (): void => {
    if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(synchronizeScrollSpace);
  };

  const resizeObserver = new ResizeObserver(scheduleScrollSpaceSynchronization);
  resizeObserver.observe(canvas);
  const viewportResizeObserver = new ResizeObserver(() => {
    const nextWidth = stage.clientWidth;
    const nextHeight = stage.clientHeight;
    const correctionX = (viewportWidth - nextWidth) / 2;
    const correctionY = (viewportHeight - nextHeight) / 2;
    viewportWidth = nextWidth;
    viewportHeight = nextHeight;
    if (Math.abs(correctionX) < 0.5 && Math.abs(correctionY) < 0.5) return;
    stage.scrollLeft += correctionX;
    stage.scrollTop += correctionY;
    viewportCorrections += 1;
    publishMetrics();
    editor.dispatchEvent(new CustomEvent(VISUAL_ZOOM_VIEWPORT_ANCHORED, {
      detail: { correctionX, correctionY, magnification },
    }));
  });
  viewportResizeObserver.observe(stage);
  const visibilityObserver = new MutationObserver(scheduleScrollSpaceSynchronization);
  for (const surface of canvas.querySelectorAll<HTMLElement>('#editor, #source-editor')) {
    visibilityObserver.observe(surface, { attributes: true, attributeFilter: ['hidden', 'style'] });
  }

  const applyZoom = (
    nextMagnification: number,
    pageIndex: number | null,
    interactive: boolean,
  ): void => {
    if (interactive) {
      magnification = nextMagnification;
      compositorFrames += 1;
      const anchor = gestureAnchor;
      const translateX = anchor
        ? anchor.viewportX - anchor.baseCanvasLeft - anchor.canvasX * magnification
        : canvasLayoutWidth * (committedMagnification - magnification) / 2;
      const translateY = anchor
        ? anchor.viewportY - anchor.baseCanvasTop - anchor.canvasY * magnification
        : 0;
      canvas.dataset.zoom = String(magnification);
      canvas.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${magnification})`;
      publishMetrics();
      return;
    }
    const stageRect = stage.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const slotHeight = readPageSlotHeight(editor);
    const hasPageAnchor = Number.isInteger(pageIndex) && (pageIndex ?? -1) >= 0 && slotHeight > 0;
    const committedGestureAnchor = gestureAnchor;
    const anchorViewportX = committedGestureAnchor?.viewportX
      ?? stageRect.left + stage.clientWidth / 2;
    const anchorViewportY = committedGestureAnchor?.viewportY
      ?? (hasPageAnchor
        ? editor.getBoundingClientRect().top + (pageIndex ?? 0) * slotHeight * magnification
        : stageRect.top + stage.clientHeight / 2);
    const anchorCanvasX = committedGestureAnchor?.canvasX
      ?? (anchorViewportX - canvasRect.left) / magnification;
    const anchorCanvasY = committedGestureAnchor?.canvasY
      ?? (hasPageAnchor
        ? editor.offsetTop + (pageIndex ?? 0) * slotHeight
        : (anchorViewportY - canvasRect.top) / magnification);

    magnification = nextMagnification;
    committedMagnification = nextMagnification;
    if (gestureActive === false && gestureAnchor !== null) settleCommits += 1;
    canvas.dataset.zoom = String(magnification);
    canvas.style.transform = `scale(${magnification})`;
    synchronizeScrollSpace();

    const nextCanvasRect = canvas.getBoundingClientRect();
    const nextAnchorViewportX = nextCanvasRect.left + anchorCanvasX * magnification;
    const nextAnchorViewportY = nextCanvasRect.top + anchorCanvasY * magnification;
    stage.scrollLeft += nextAnchorViewportX - anchorViewportX;
    stage.scrollTop += nextAnchorViewportY - anchorViewportY;
    gestureAnchor = null;
    publishMetrics();
  };

  const flushPendingZoom = (): void => {
    zoomFrame = null;
    const request = pendingZoom;
    pendingZoom = null;
    if (request) applyZoom(request.magnification, request.pageIndex, request.interactive);
  };

  const setZoom = (value: number, pageIndex?: number | null, interactive = false): boolean => {
    if (!Number.isFinite(value)) return false;
    const request = {
      magnification: Math.min(MAXIMUM_ZOOM, Math.max(MINIMUM_ZOOM, value)),
      pageIndex: Number.isInteger(pageIndex) ? pageIndex ?? null : null,
      interactive,
    };
    if (!interactive) {
      if (zoomFrame !== null) cancelAnimationFrame(zoomFrame);
      zoomFrame = null;
      pendingZoom = null;
      applyZoom(request.magnification, request.pageIndex, false);
      return true;
    }
    pendingZoom = request;
    if (zoomFrame === null) zoomFrame = requestAnimationFrame(flushPendingZoom);
    return true;
  };

  const handleGestureStart = (event: Event): void => {
    event.preventDefault();
    gestureActive = true;
    gestureStartMagnification = magnification;
    gestureMagnification = magnification;
    const gesture = event as WebKitGestureEvent;
    const stageRect = stage.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const viewportX = Number.isFinite(gesture.clientX)
      ? gesture.clientX!
      : stageRect.left + stage.clientWidth / 2;
    const viewportY = Number.isFinite(gesture.clientY)
      ? gesture.clientY!
      : stageRect.top + stage.clientHeight / 2;
    gestureAnchor = {
      viewportX,
      viewportY,
      canvasX: (viewportX - canvasRect.left) / magnification,
      canvasY: (viewportY - canvasRect.top) / magnification,
      baseCanvasLeft: canvasRect.left,
      baseCanvasTop: canvasRect.top,
    };
    editor.dispatchEvent(new CustomEvent(VISUAL_ZOOM_INTERACTION_CHANGED, {
      detail: { active: true },
    }));
  };
  const handleGestureChange = (event: Event): void => {
    event.preventDefault();
    if (!gestureActive) return;
    const scale = (event as WebKitGestureEvent).scale;
    if (!Number.isFinite(scale) || scale <= 0) return;
    inputSamples += 1;
    gestureMagnification = clampMagnification(gestureStartMagnification * scale);
    setZoom(gestureMagnification, null, true);
  };
  const handleGestureEnd = (event: Event): void => {
    event.preventDefault();
    if (!gestureActive) return;
    gestureActive = false;
    setZoom(gestureMagnification, null, false);
    editor.dispatchEvent(new CustomEvent(VISUAL_ZOOM_INTERACTION_CHANGED, {
      detail: { active: false },
    }));
  };

  stage.addEventListener('gesturestart', handleGestureStart, { passive: false });
  stage.addEventListener('gesturechange', handleGestureChange, { passive: false });
  stage.addEventListener('gestureend', handleGestureEnd, { passive: false });
  reducedMotionQuery.addEventListener('change', handleReducedMotionChange);

  canvas.dataset.zoom = '1';
  canvas.style.transform = 'scale(1)';
  publishMetrics();
  synchronizeScrollSpace();

  return {
    setZoom,
    dispose(): void {
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      if (zoomFrame !== null) cancelAnimationFrame(zoomFrame);
      resizeObserver.disconnect();
      viewportResizeObserver.disconnect();
      visibilityObserver.disconnect();
      reducedMotionQuery.removeEventListener('change', handleReducedMotionChange);
      stage.removeEventListener('gesturestart', handleGestureStart);
      stage.removeEventListener('gesturechange', handleGestureChange);
      stage.removeEventListener('gestureend', handleGestureEnd);
    },
  };
}

function clampMagnification(value: number): number {
  return Math.min(MAXIMUM_ZOOM, Math.max(MINIMUM_ZOOM, value));
}

function readPageSlotHeight(editor: HTMLElement): number {
  const style = getComputedStyle(editor);
  const pageHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'));
  const pageGap = Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
  return Number.isFinite(pageHeight) && Number.isFinite(pageGap) ? pageHeight + pageGap : 0;
}
