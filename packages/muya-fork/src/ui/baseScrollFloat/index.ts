import type { ReferenceElement } from '@floating-ui/dom';
import type { Muya } from '../../muya';
import { EVENT_KEYS } from '../../config';
import { isKeyboardEvent, noop } from '../../utils';
import BaseFloat from '../baseFloat';

abstract class BaseScrollFloat extends BaseFloat {
    public scrollElement: HTMLElement | null = null;
    public reference: Element | ReferenceElement | null = null;
    public activeItem: unknown | null = null;
    public renderArray: unknown[] = [];

    constructor(muya: Muya, name: string, options = {}) {
        super(muya, name, options);
        this.createScrollElement();
    }

    createScrollElement() {
        const { container } = this;
        const scrollElement = document.createElement('div');
        container!.appendChild(scrollElement);
        this.scrollElement = scrollElement;
    }

    activeEleScrollIntoView(ele: HTMLElement) {
        if (!ele)
            return;
        const scrollContainer = this.container;
        if (!scrollContainer || scrollContainer.clientHeight <= 0) {
            if (typeof ele.scrollIntoView === 'function') {
                ele.scrollIntoView({
                    behavior: 'auto',
                    block: 'nearest',
                    inline: 'start',
                });
            }
            return;
        }
        if (this.renderArray.length > 0 && this.activeItem === this.renderArray[0]) {
            scrollContainer.scrollTop = 0;
            return;
        }
        const containerRect = scrollContainer.getBoundingClientRect();
        const eleRect = ele.getBoundingClientRect();
        const stickyHeader = scrollContainer.querySelector<HTMLElement>('.title');
        const stickyTopOffset = stickyHeader ? stickyHeader.offsetHeight : 0;
        const visibleTop = containerRect.top + stickyTopOffset;
        const visibleBottom = containerRect.bottom;

        if (eleRect.top < visibleTop) {
            scrollContainer.scrollTop = Math.max(0, scrollContainer.scrollTop - (visibleTop - eleRect.top) - 4);
        }
        else if (eleRect.bottom > visibleBottom) {
            scrollContainer.scrollTop += (eleRect.bottom - visibleBottom) + 6;
        }
    }

    override listen() {
        super.listen();
        const { eventCenter, domNode } = this.muya;
        const handler = (event: Event) => {
            if (!this.status || !isKeyboardEvent(event))
                return;
            switch (event.key) {
                case EVENT_KEYS.ArrowUp:
                    if (this.renderArray.length > 0) {
                        event.preventDefault();
                        this.step('previous');
                    }
                    break;

                case EVENT_KEYS.ArrowDown:
                    // // falls through

                case EVENT_KEYS.Tab:
                    if (this.renderArray.length > 0) {
                        event.preventDefault();
                        this.step('next');
                    }
                    break;

                case EVENT_KEYS.Enter:
                    if (this.activeItem != null) {
                        event.preventDefault();
                        this.selectItem(this.activeItem);
                    }
                    break;

                default:
                    break;
            }
        };

        eventCenter.attachDOMEvent(domNode, 'keydown', handler);
    }

    override hide() {
        super.hide();
        this.reference = null;
    }

    override show(reference: Element | ReferenceElement, cb: (...args: unknown[]) => void = noop) {
        this.cb = cb;

        if (reference instanceof HTMLElement) {
            if (this.reference && this.reference === reference && this.status)
                return;
        }

        this.reference = reference;
        super.show(reference, cb);
    }

    step(direction: 'previous' | 'next') {
        let index = this.renderArray.findIndex((item) => {
            return item === this.activeItem;
        });
        index = direction === 'next' ? index + 1 : index - 1;

        if (index < 0)
            index = this.renderArray.length - 1;
        else if (index >= this.renderArray.length)
            index = 0;

        this.activeItem = this.renderArray[index];
        this.render();
        const activeEle = this.getItemElement(this.activeItem);
        this.activeEleScrollIntoView(activeEle);
    }

    selectItem(item: unknown) {
        const { cb } = this;
        cb && cb(item);
        // Delay hide to avoid dispatch enter handler
        requestAnimationFrame(this.hide.bind(this));
    }

    abstract render(): void;

    abstract getItemElement(item: unknown): HTMLElement;
}

export default BaseScrollFloat;
