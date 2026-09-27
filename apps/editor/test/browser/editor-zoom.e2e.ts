import { expect, test } from '@playwright/test';

test('scales each A4 sheet and its ink as one fixed-layout canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#editor.mu-editor')).toBeVisible();
  await page.evaluate(() => window.markdownEditor?.loadMarkdown([
    '# Trang A4 cố định',
    '',
    'Đây là một dòng nội dung đủ dài để phát hiện việc chữ bị bóp và xuống dòng lại khi người dùng thu nhỏ toàn bộ tờ giấy.',
    '',
    ':::pagebreak',
    ':::',
    '',
    'Trang thứ hai.',
  ].join('\n')));
  await expect(page.locator('.visual-page-action-strip')).toHaveCount(2);
  await page.evaluate(() => window.markdownEditor?.selectPage(0));
  await expect(page.locator('.visual-page-selection')).toBeVisible();

  const readMetrics = () => page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    const paragraph = document.querySelector<HTMLElement>('.mu-paragraph-content');
    const actionLayer = document.querySelector<HTMLElement>('.visual-page-action-layer');
    const pageSelection = document.querySelector<HTMLElement>('.visual-page-selection');
    if (!editor || !paragraph || !actionLayer || !pageSelection) {
      throw new Error('Zoom fixture did not render');
    }
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    return {
      layoutWidth: editor.offsetWidth,
      renderedWidth: editor.getBoundingClientRect().width,
      pageRenderedHeight: pageSelection.getBoundingClientRect().height,
      paragraphLayoutHeight: paragraph.offsetHeight,
      paragraphRenderedHeight: paragraph.getBoundingClientRect().height,
      lineCount: range.getClientRects().length,
      actionLayerRenderedWidth: actionLayer.getBoundingClientRect().width,
    };
  });

  const before = await readMetrics();
  await page.evaluate(() => window.markdownEditor?.handleEnvelope({
    protocolVersion: 1,
    type: 'editor.setZoom',
    requestId: null,
    payload: { magnification: 0.25, pageIndex: 0 },
  }));
  await expect.poll(() => page.locator('.editor-zoom-canvas').evaluate(
    (canvas) => Number((canvas as HTMLElement).dataset.zoom),
  )).toBe(0.25);
  const after = await readMetrics();

  expect(before.layoutWidth).toBe(816);
  expect(after.layoutWidth).toBe(before.layoutWidth);
  expect(after.paragraphLayoutHeight).toBe(before.paragraphLayoutHeight);
  expect(after.lineCount).toBe(before.lineCount);
  expect(after.renderedWidth).toBeCloseTo(before.renderedWidth * 0.25, 1);
  expect(after.pageRenderedHeight).toBeCloseTo(before.pageRenderedHeight * 0.25, 1);
  expect(after.paragraphRenderedHeight).toBeCloseTo(before.paragraphRenderedHeight * 0.25, 1);
  expect(after.actionLayerRenderedWidth).toBeCloseTo(after.renderedWidth, 1);

  await page.evaluate(() => window.markdownEditor?.handleEnvelope({
    protocolVersion: 1,
    type: 'editor.setZoom',
    requestId: null,
    payload: { magnification: 1, pageIndex: 0 },
  }));
  await expect.poll(() => page.locator('.editor-zoom-canvas').evaluate(
    (canvas) => Number((canvas as HTMLElement).dataset.zoom),
  )).toBe(1);
  const restored = await readMetrics();
  expect(restored.layoutWidth).toBe(before.layoutWidth);
  expect(restored.lineCount).toBe(before.lineCount);
  expect(restored.renderedWidth).toBeCloseTo(before.renderedWidth, 1);
  expect(restored.paragraphRenderedHeight).toBeCloseTo(before.paragraphRenderedHeight, 1);
});

test('coalesces a burst of zoom updates into one animation-frame write', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#editor.mu-editor')).toBeVisible();

  const result = await page.evaluate(async () => {
    const canvas = document.querySelector<HTMLElement>('.editor-zoom-canvas');
    if (!canvas) throw new Error('Zoom canvas did not render');
    let transformWrites = 0;
    const observer = new MutationObserver((records) => {
      transformWrites += records.filter((record) => record.attributeName === 'style').length;
    });
    observer.observe(canvas, { attributes: true, attributeFilter: ['style'] });
    for (let step = 1; step <= 60; step += 1) {
      window.markdownEditor?.handleEnvelope({
        protocolVersion: 1,
        type: 'editor.setZoom',
        requestId: null,
        payload: { magnification: step / 60, pageIndex: 0, interactive: true },
      });
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    observer.disconnect();
    return { transformWrites, zoom: Number(canvas.dataset.zoom) };
  });

  expect(result.transformWrites).toBeLessThanOrEqual(1);
  expect(result.zoom).toBe(1);
});

test('applies a committed keyboard or gesture-end zoom without waiting for another frame', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#editor.mu-editor')).toBeVisible();

  const zoomImmediatelyAfterCommand = await page.evaluate(() => {
    window.markdownEditor?.handleEnvelope({
      protocolVersion: 1,
      type: 'editor.setZoom',
      requestId: null,
      payload: { magnification: 0.25, pageIndex: 0, interactive: false },
    });
    return Number(document.querySelector<HTMLElement>('.editor-zoom-canvas')?.dataset.zoom);
  });

  expect(zoomImmediatelyAfterCommand).toBe(0.25);
});

test('keeps trackpad zoom compositor-only until the gesture commits', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#editor.mu-editor')).toBeVisible();

  const result = await page.evaluate(async () => {
    const canvas = document.querySelector<HTMLElement>('.editor-zoom-canvas');
    const space = document.querySelector<HTMLElement>('.editor-zoom-space');
    const stage = document.querySelector<HTMLElement>('.editor-stage');
    if (!canvas || !space || !stage) throw new Error('Zoom canvas did not render');
    const initialSpaceStyle = space.getAttribute('style');
    const initialScrollTop = stage.scrollTop;
    const initialCanvasCenter = canvas.getBoundingClientRect().left
      + canvas.getBoundingClientRect().width / 2;

    for (let step = 1; step <= 30; step += 1) {
      window.markdownEditor?.handleEnvelope({
        protocolVersion: 1,
        type: 'editor.setZoom',
        requestId: null,
        payload: { magnification: 1 - step / 60, pageIndex: 0, interactive: true },
      });
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }

    const duringGesture = {
      spaceStyle: space.getAttribute('style'),
      scrollTop: stage.scrollTop,
      zoom: Number(canvas.dataset.zoom),
      canvasCenter: canvas.getBoundingClientRect().left + canvas.getBoundingClientRect().width / 2,
    };
    window.markdownEditor?.handleEnvelope({
      protocolVersion: 1,
      type: 'editor.setZoom',
      requestId: null,
      payload: { magnification: 0.5, pageIndex: 0, interactive: false },
    });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    return {
      initialSpaceStyle,
      initialScrollTop,
      duringGesture,
      committedSpaceStyle: space.getAttribute('style'),
      committedCanvasCenter: canvas.getBoundingClientRect().left
        + canvas.getBoundingClientRect().width / 2,
      initialCanvasCenter,
    };
  });

  expect(result.duringGesture.zoom).toBe(0.5);
  expect(result.duringGesture.spaceStyle).toBe(result.initialSpaceStyle);
  expect(result.duringGesture.scrollTop).toBe(result.initialScrollTop);
  expect(result.duringGesture.canvasCenter).toBeCloseTo(result.initialCanvasCenter, 1);
  expect(result.committedSpaceStyle).not.toBe(result.initialSpaceStyle);
  expect(result.committedCanvasCenter).toBeCloseTo(result.initialCanvasCenter, 1);
});

test('keeps the pinch focal point fixed in both axes during interactive zoom', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#editor.mu-editor')).toBeVisible();
  await page.evaluate(() => window.markdownEditor?.loadMarkdown([
    '# Trang một',
    '',
    'Nội dung neo pinch.',
    '',
    ':::pagebreak',
    ':::',
    '',
    '# Trang hai',
  ].join('\n')));

  const result = await page.evaluate(async () => {
    const canvas = document.querySelector<HTMLElement>('.editor-zoom-canvas');
    const stage = document.querySelector<HTMLElement>('.editor-stage');
    if (!canvas || !stage) throw new Error('Zoom canvas did not render');
    const initialRect = canvas.getBoundingClientRect();
    const focalX = initialRect.left + initialRect.width * 0.28;
    const focalY = initialRect.top + 320;
    const anchorX = (focalX - initialRect.left) / Number(canvas.dataset.zoom ?? 1);
    const anchorY = (focalY - initialRect.top) / Number(canvas.dataset.zoom ?? 1);
    const dispatchGesture = (type: string, scale: number): void => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        scale: { value: scale },
        clientX: { value: focalX },
        clientY: { value: focalY },
      });
      stage.dispatchEvent(event);
    };

    dispatchGesture('gesturestart', 1);
    dispatchGesture('gesturechange', 0.55);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const rect = canvas.getBoundingClientRect();
    const zoom = Number(canvas.dataset.zoom);
    return {
      expected: { x: focalX, y: focalY },
      actual: { x: rect.left + anchorX * zoom, y: rect.top + anchorY * zoom },
    };
  });

  expect(result.actual.x).toBeCloseTo(result.expected.x, 1);
  expect(result.actual.y).toBeCloseTo(result.expected.y, 1);
});

test('handles trackpad pinch locally without sending gesture frames through the host bridge', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#editor.mu-editor')).toBeVisible();

  const result = await page.evaluate(async () => {
    const canvas = document.querySelector<HTMLElement>('.editor-zoom-canvas');
    const space = document.querySelector<HTMLElement>('.editor-zoom-space');
    const stage = document.querySelector<HTMLElement>('.editor-stage');
    if (!canvas || !space || !stage) throw new Error('Zoom canvas did not render');

    const hostMessages: unknown[] = [];
    window.webkit = {
      messageHandlers: {
        bridge: {
          postMessage(message): void {
            hostMessages.push(message);
          },
        },
      },
    };
    const initialSpaceStyle = space.getAttribute('style');
    const dispatchGesture = (type: string, scale: number): boolean => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'scale', { value: scale });
      return stage.dispatchEvent(event);
    };

    const startWasNotCancelled = dispatchGesture('gesturestart', 1);
    for (let step = 1; step <= 30; step += 1) {
      dispatchGesture('gesturechange', 1 - step / 75);
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const duringGesture = {
      zoom: Number(canvas.dataset.zoom),
      spaceStyle: space.getAttribute('style'),
    };
    const endWasNotCancelled = dispatchGesture('gestureend', 0.6);

    return {
      startWasNotCancelled,
      endWasNotCancelled,
      initialSpaceStyle,
      duringGesture,
      committedSpaceStyle: space.getAttribute('style'),
      hostMessageCount: hostMessages.length,
    };
  });

  expect(result.startWasNotCancelled).toBe(false);
  expect(result.endWasNotCancelled).toBe(false);
  expect(result.duringGesture.zoom).toBeCloseTo(0.6, 3);
  expect(result.duringGesture.spaceStyle).toBe(result.initialSpaceStyle);
  expect(result.committedSpaceStyle).not.toBe(result.initialSpaceStyle);
  expect(result.hostMessageCount).toBe(0);
});

test('suspends background thumbnail rasterization during a pinch gesture', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#editor.mu-editor')).toBeVisible();
  await page.evaluate(() => {
    const host = window as Window & { __zoomMessages?: Array<{ type?: string }> };
    host.__zoomMessages = [];
    window.webkit = {
      messageHandlers: {
        bridge: {
          postMessage(message): void { host.__zoomMessages?.push(message); },
        },
      },
    };
    document.querySelector('#editor')?.dispatchEvent(
      new CustomEvent('visual-page-thumbnails-enabled', { detail: { enabled: true } }),
    );
    window.markdownEditor?.loadMarkdown('# A\n\n:::pagebreak\n:::\n\n# B\n');
    const stage = document.querySelector<HTMLElement>('.editor-stage');
    const event = new Event('gesturestart', { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      scale: { value: 1 },
      clientX: { value: 300 },
      clientY: { value: 300 },
    });
    stage?.dispatchEvent(event);
  });

  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (
    (window as Window & { __zoomMessages?: Array<{ type?: string }> }).__zoomMessages
      ?.filter((message) => message.type === 'editor.pageThumbnailChanged').length ?? 0
  ))).toBe(0);

  await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('.editor-stage');
    const event = new Event('gestureend', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'scale', { value: 1 });
    stage?.dispatchEvent(event);
  });
  await expect.poll(() => page.evaluate(() => (
    (window as Window & { __zoomMessages?: Array<{ type?: string }> }).__zoomMessages
      ?.filter((message) => message.type === 'editor.pageThumbnailChanged').length ?? 0
  )), { timeout: 5_000 }).toBeGreaterThan(0);
});

test('preserves the centered canvas point when the viewport narrows beside native chrome', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#editor.mu-editor')).toBeVisible();
  await page.evaluate(() => window.markdownEditor?.loadMarkdown([
    '# Viewport anchor',
    '',
    'Nội dung giữ nguyên dưới tâm vùng soạn thảo khi bảng bên cạnh mở ra.',
    '',
    ':::pagebreak',
    ':::',
    '',
    '# Trang hai',
  ].join('\n')));
  await page.evaluate(() => window.markdownEditor?.setZoom(1.5, 0, false));

  const result = await page.evaluate(async () => {
    const stage = document.querySelector<HTMLElement>('.editor-stage');
    const canvas = document.querySelector<HTMLElement>('.editor-zoom-canvas');
    if (!canvas || !stage) throw new Error('Zoom canvas did not render');
    stage.style.width = '900px';
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    stage.scrollLeft = 260;
    stage.scrollTop = 210;
    const zoom = Number(canvas.dataset.zoom);
    const canvasPointAtViewportCenter = (): { x: number; y: number } => {
      const stageRect = stage.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      return {
        x: (stageRect.left + stage.clientWidth / 2 - canvasRect.left) / zoom,
        y: (stageRect.top + stage.clientHeight / 2 - canvasRect.top) / zoom,
      };
    };
    const before = canvasPointAtViewportCenter();
    stage.style.width = '620px';
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return {
      before,
      after: canvasPointAtViewportCenter(),
      corrections: Number(canvas.dataset.zoomViewportCorrections ?? 0),
    };
  });

  expect(result.after.x).toBeCloseTo(result.before.x, 1);
  expect(result.after.y).toBeCloseTo(result.before.y, 1);
  expect(result.corrections).toBeGreaterThanOrEqual(1);
});

test('records coalesced compositor frames and one settle without bridge traffic', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#editor.mu-editor')).toBeVisible();

  const result = await page.evaluate(async () => {
    const stage = document.querySelector<HTMLElement>('.editor-stage');
    const canvas = document.querySelector<HTMLElement>('.editor-zoom-canvas');
    if (!canvas || !stage) throw new Error('Zoom canvas did not render');
    const hostMessages: unknown[] = [];
    window.webkit = {
      messageHandlers: { bridge: { postMessage(message): void { hostMessages.push(message); } } },
    };
    const dispatchGesture = (type: string, scale: number): void => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        scale: { value: scale },
        clientX: { value: 360 },
        clientY: { value: 300 },
      });
      stage.dispatchEvent(event);
    };

    dispatchGesture('gesturestart', 1);
    for (let step = 1; step <= 80; step += 1) dispatchGesture('gesturechange', 1 + step / 100);
    dispatchGesture('gestureend', 1.8);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    return {
      zoom: Number(canvas.dataset.zoom),
      inputSamples: Number(canvas.dataset.zoomInputSamples ?? 0),
      compositorFrames: Number(canvas.dataset.zoomCompositorFrames ?? 0),
      settleCommits: Number(canvas.dataset.zoomSettleCommits ?? 0),
      reducedMotion: canvas.dataset.zoomReducedMotion,
      hostMessageCount: hostMessages.length,
    };
  });

  expect(result.zoom).toBeCloseTo(1.8, 3);
  expect(result.inputSamples).toBe(80);
  expect(result.compositorFrames).toBeLessThanOrEqual(1);
  expect(result.settleCommits).toBe(1);
  expect(result.reducedMotion).toMatch(/^(true|false)$/);
  expect(result.hostMessageCount).toBe(0);
});

test('keeps reduced-motion pinch immediate with one compositor settle', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#editor.mu-editor')).toBeVisible();

  const result = await page.evaluate(async () => {
    const canvas = document.querySelector<HTMLElement>('.editor-zoom-canvas');
    const space = document.querySelector<HTMLElement>('.editor-zoom-space');
    const stage = document.querySelector<HTMLElement>('.editor-stage');
    if (!canvas || !space || !stage) throw new Error('Zoom canvas did not render');
    const initialSpaceStyle = space.getAttribute('style');
    const dispatchGesture = (type: string, scale: number): void => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        scale: { value: scale },
        clientX: { value: 360 },
        clientY: { value: 300 },
      });
      stage.dispatchEvent(event);
    };

    dispatchGesture('gesturestart', 1);
    for (let step = 1; step <= 40; step += 1) dispatchGesture('gesturechange', 1 - step / 100);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const duringGesture = {
      zoom: Number(canvas.dataset.zoom),
      spaceStyle: space.getAttribute('style'),
    };
    dispatchGesture('gestureend', 0.6);

    return {
      reducedMotion: canvas.dataset.zoomReducedMotion,
      transitionDuration: getComputedStyle(canvas).transitionDuration,
      initialSpaceStyle,
      duringGesture,
      committedZoom: Number(canvas.dataset.zoom),
      committedSpaceStyle: space.getAttribute('style'),
      inputSamples: Number(canvas.dataset.zoomInputSamples ?? 0),
      compositorFrames: Number(canvas.dataset.zoomCompositorFrames ?? 0),
      settleCommits: Number(canvas.dataset.zoomSettleCommits ?? 0),
    };
  });

  expect(result.reducedMotion).toBe('true');
  expect(Number.parseFloat(result.transitionDuration)).toBeLessThanOrEqual(0.00001);
  expect(result.duringGesture.zoom).toBeCloseTo(0.6, 3);
  expect(result.duringGesture.spaceStyle).toBe(result.initialSpaceStyle);
  expect(result.committedZoom).toBeCloseTo(0.6, 3);
  expect(result.committedSpaceStyle).not.toBe(result.initialSpaceStyle);
  expect(result.inputSamples).toBe(40);
  expect(result.compositorFrames).toBe(1);
  expect(result.settleCommits).toBe(1);
});

test('keeps page-break gap chrome aligned to the full A4 width after zoom', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#editor.mu-editor')).toBeVisible();
  await page.evaluate(() => window.markdownEditor?.loadMarkdown([
    '# Trang trước',
    '',
    ':::pagebreak',
    ':::',
    '',
    '# Trang sau',
  ].join('\n')));
  await expect(page.locator('.hcmut-pagebreak-preview')).toBeVisible();

  await page.evaluate(() => window.markdownEditor?.setZoom(0.75, 0, false));
  const edges = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    const marker = document.querySelector<HTMLElement>('.hcmut-pagebreak-preview');
    if (!editor || !marker) throw new Error('Page-break zoom fixture did not render');
    const editorRect = editor.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    return {
      leftInset: markerRect.left - editorRect.left,
      rightInset: editorRect.right - markerRect.right,
    };
  });

  expect(edges.leftInset).toBeCloseTo(0, 1);
  expect(edges.rightInset).toBeCloseTo(0, 1);
});

test('keeps a newly typed page inside the A4 sheet after zooming out', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#editor.mu-editor')).toBeVisible();
  await page.evaluate(() => window.markdownEditor?.loadMarkdown([
    '# Báo cáo Markdown',
    '',
    'Trường Đại học Bách khoa',
  ].join('\n')));

  await page.evaluate(() => window.markdownEditor?.setZoom(0.5, 0, false));
  await expect.poll(() => page.locator('.editor-zoom-canvas').evaluate(
    (canvas) => Number((canvas as HTMLElement).dataset.zoom),
  )).toBe(0.5);
  await page.evaluate(() => window.markdownEditor?.handleEnvelope({
    protocolVersion: 1,
    type: 'editor.addPage',
    requestId: null,
    payload: { afterPageIndex: 0 },
  }));
  await page.keyboard.insertText('Nội dung phải nằm trong trang 2');

  await expect.poll(() => page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    if (!editor) return null;
    const pageHeight = Number.parseFloat(getComputedStyle(editor).getPropertyValue('--visual-page-height'));
    return { layoutWidth: editor.offsetWidth, pageHeight };
  })).toEqual({ layoutWidth: 816, pageHeight: expect.closeTo(816 * 297 / 210, 1) });

  const placement = await page.locator('.mu-paragraph-content', {
    hasText: 'Nội dung phải nằm trong trang 2',
  }).evaluate((paragraph) => {
    const editor = document.querySelector<HTMLElement>('#editor');
    if (!editor) throw new Error('Zoomed writable-page fixture did not render');
    const style = getComputedStyle(editor);
    const scale = editor.getBoundingClientRect().width / editor.offsetWidth;
    const pageHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'));
    const slotHeight = pageHeight + Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
    const top = (paragraph.getBoundingClientRect().top - editor.getBoundingClientRect().top) / scale;
    return {
      pageIndex: Math.floor((top + 2.5) / slotHeight),
      pageOffset: top % slotHeight,
      pageHeight,
    };
  });
  expect(placement.pageIndex).toBe(1);
  expect(placement.pageOffset).toBeLessThan(placement.pageHeight);
});
