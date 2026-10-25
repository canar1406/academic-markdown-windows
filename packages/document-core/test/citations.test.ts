import { describe, expect, it } from 'vitest';
import {
  extractCitedKeysFromMarkdown,
  formatAuthorInlineApa,
  formatAuthorsForBibliography,
  formatBibliographyItems,
  formatInlineCitationGroup,
  isCrossReferenceKey,
  parseBibtexEntries,
  parseFrontMatter,
  parseReferencesBlockContent,
  readDocumentCitationStyle,
  readDocumentReferences,
} from '../src/index.js';

describe('citations and bibliography utilities', () => {
  it('parses BibTeX entries into structured CitationReferenceEntry objects', () => {
    const bibtex = `
      @article{vaswani2017attention,
        author = {Vaswani, Ashish and Shazeer, Noam and Parmar, Niki},
        title = {Attention Is All You Need},
        journal = {Advances in Neural Information Processing Systems},
        volume = {30},
        pages = {5998--6008},
        year = {2017},
        doi = {10.5555/3295222.3295349}
      }
      @book{knuth1997art,
        author = {Donald E. Knuth},
        title = {The Art of Computer Programming},
        publisher = {Addison-Wesley},
        year = {1997}
      }
    `;

    const entries = parseBibtexEntries(bibtex);

    expect(entries).toEqual([
      {
        id: 'vaswani2017attention',
        type: 'article',
        author: 'Vaswani, Ashish and Shazeer, Noam and Parmar, Niki',
        title: 'Attention Is All You Need',
        year: '2017',
        venue: 'Advances in Neural Information Processing Systems',
        volume: '30',
        pages: '5998-6008',
        doi: '10.5555/3295222.3295349',
      },
      {
        id: 'knuth1997art',
        type: 'book',
        author: 'Donald E. Knuth',
        title: 'The Art of Computer Programming',
        year: '1997',
        venue: 'Addison-Wesley',
      },
    ]);
  });

  it('parses markdown list lines inside :::references blocks', () => {
    const content = [
      '- [@lecun2015deep] LeCun, Y. and Bengio, Y. (2015). Deep learning. Nature, vol. 521, pp. 436-444. https://doi.org/10.1038/nature14539',
    ].join('\n');

    expect(parseReferencesBlockContent(content)).toEqual([
      {
        id: 'lecun2015deep',
        type: 'article',
        author: 'LeCun, Y. and Bengio, Y.',
        year: '2015',
        title: 'Deep learning',
        venue: 'Nature, vol. 521, pp. 436-444',
        url: 'https://doi.org/10.1038/nature14539',
      },
    ]);
  });

  it('formats authors and orders bibliography according to IEEE and APA rules', () => {
    const entries = [
      {
        id: 'zeta2022',
        author: 'Zeta, Alice and Beta, Bob',
        title: 'Second Paper Cited First',
        year: '2022',
        venue: 'IEEE Access',
      },
      {
        id: 'alpha2020',
        author: 'Alpha, John and Gamma, Carol and Delta, Eve',
        title: 'First Alphabetical Paper Cited Second',
        year: '2020',
        venue: 'ACM Computing Surveys',
      },
    ];
    const citedKeys = extractCitedKeysFromMarkdown('Xem [@zeta2022] và [@alpha2020], cùng @fig-system.');

    expect(citedKeys).toEqual(['zeta2022', 'alpha2020']);
    expect(isCrossReferenceKey('fig-system')).toBe(true);
    expect(isCrossReferenceKey('zeta2022')).toBe(false);

    const ieeeItems = formatBibliographyItems(entries, 'ieee', citedKeys);
    expect(ieeeItems.map((item) => [item.index, item.id, item.authors])).toEqual([
      [1, 'zeta2022', 'A. Zeta and B. Beta'],
      [2, 'alpha2020', 'J. Alpha, C. Gamma, and E. Delta'],
    ]);

    const apaItems = formatBibliographyItems(entries, 'apa', citedKeys);
    expect(apaItems.map((item) => [item.id, item.authors])).toEqual([
      ['alpha2020', 'Alpha, J., Gamma, C., & Delta, E.'],
      ['zeta2022', 'Zeta, A., & Beta, B.'],
    ]);

    expect(formatAuthorInlineApa(entries[0]!.author)).toBe('Zeta & Beta');
    expect(formatAuthorInlineApa(entries[1]!.author)).toBe('Alpha et al.');
    expect(formatInlineCitationGroup(['zeta2022', 'alpha2020'], 'ieee', entries, citedKeys)).toBe('[1, 2]');
    expect(formatInlineCitationGroup(['zeta2022', 'alpha2020'], 'apa', entries, citedKeys))
      .toBe('(Zeta & Beta, 2022; Alpha et al., 2020)');
  });

  it('reads citationStyle and references from front-matter lmx metadata', () => {
    const parsed = parseFrontMatter([
      '---',
      'lmx:',
      '  citationStyle: apa',
      '  references:',
      '    - id: smith2024',
      '      author: Smith, Jane',
      '      title: Modern Academic Writing',
      '      year: "2024"',
      '      venue: Journal of Documentation',
      '---',
      'Nội dung [@smith2024].',
    ].join('\n'));

    expect(readDocumentCitationStyle(parsed.data)).toBe('apa');
    expect(readDocumentReferences(parsed.data)).toEqual([
      {
        id: 'smith2024',
        type: 'article',
        author: 'Smith, Jane',
        title: 'Modern Academic Writing',
        year: '2024',
        venue: 'Journal of Documentation',
      },
    ]);
    expect(formatAuthorsForBibliography('Smith, Jane', 'ieee')).toBe('J. Smith');
  });
});
