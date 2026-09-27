// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Muya } from '../../../muya';
import { TableDragBar } from '..';

describe('TableDragBar bottom handle click', () => {
    afterEach(() => {
        document.querySelectorAll('.mu-table-drag-container').forEach(node => node.remove());
    });

    it('opens the column action menu when the bottom handle is clicked', () => {
        const emit = vi.fn();
        const eventCenter = {
            attachDOMEvent: vi.fn(() => 'listener-id'),
            emit,
        };
        const editor = document.createElement('div');
        document.body.append(editor);
        const bar = new TableDragBar({ eventCenter, domNode: editor } as unknown as Muya);
        const block = { table: {}, row: {} };
        const timer = setTimeout(() => {}, 1_000);

        Object.assign(bar as unknown as Record<string, unknown>, {
            _barType: 'bottom',
            _block: block,
            _mouseTimer: timer,
        });

        bar.mouseup({
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
        } as unknown as Event);

        expect(emit).toHaveBeenCalledWith('muya-table-bar', expect.objectContaining({
            tableInfo: { barType: 'bottom' },
            block,
        }));
    });
});
