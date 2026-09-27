import { describe, expect, it } from 'vitest';
import { getImageSrc } from '../image';

describe('document-relative image sources', () => {
    it('uses the host resolver for relative image paths', () => {
        expect(getImageSrc('assets/figure.png', (src) => `app-document://local/${src}`)).toEqual({
            isUnknownType: false,
            src: 'app-document://local/assets/figure.png',
        });
    });

    it('keeps remote and data image URLs unchanged', () => {
        expect(getImageSrc('https://example.com/figure.png', () => 'wrong')).toEqual({
            isUnknownType: false,
            src: 'https://example.com/figure.png',
        });
        expect(getImageSrc('data:image/png;base64,AAAA', () => 'wrong')).toEqual({
            isUnknownType: false,
            src: 'data:image/png;base64,AAAA',
        });
    });
});
