/// <reference path="./raw.d.ts" />

import {
  loadThemePackage,
  type LoadedThemePackage,
  type ThemeResources,
} from '@markdown/theme-engine';
import manifestSource from '../../../themes/hcmut-report-v1/theme.json?raw';
import documentTemplate from '../../../themes/hcmut-report-v1/document.tex.mustache?raw';
import preambleTemplate from '../../../themes/hcmut-report-v1/preamble.tex?raw';
import coverTemplate from '../../../themes/hcmut-report-v1/components/cover.tex.mustache?raw';
import headerTemplate from '../../../themes/hcmut-report-v1/components/header.tex.mustache?raw';
import footerTemplate from '../../../themes/hcmut-report-v1/components/footer.tex.mustache?raw';
import frontmatterTemplate from '../../../themes/hcmut-report-v1/components/frontmatter.tex.mustache?raw';
import frontSectionTemplate from '../../../themes/hcmut-report-v1/components/front-section.tex.mustache?raw';
import heading1Template from '../../../themes/hcmut-report-v1/components/heading-1.tex.mustache?raw';
import heading2Template from '../../../themes/hcmut-report-v1/components/heading-2.tex.mustache?raw';
import heading3Template from '../../../themes/hcmut-report-v1/components/heading-3.tex.mustache?raw';
import heading4Template from '../../../themes/hcmut-report-v1/components/heading-4.tex.mustache?raw';
import figureTemplate from '../../../themes/hcmut-report-v1/components/figure.tex.mustache?raw';
import tableTemplate from '../../../themes/hcmut-report-v1/components/table.tex.mustache?raw';
import listingTemplate from '../../../themes/hcmut-report-v1/components/code-listing.tex.mustache?raw';
import theoremTemplate from '../../../themes/hcmut-report-v1/components/theorem.tex.mustache?raw';
import propertyTemplate from '../../../themes/hcmut-report-v1/components/property.tex.mustache?raw';
import propositionTemplate from '../../../themes/hcmut-report-v1/components/proposition.tex.mustache?raw';
import corollaryTemplate from '../../../themes/hcmut-report-v1/components/corollary.tex.mustache?raw';
import lemmaTemplate from '../../../themes/hcmut-report-v1/components/lemma.tex.mustache?raw';
import exerciseTemplate from '../../../themes/hcmut-report-v1/components/exercise.tex.mustache?raw';
import pageBreakTemplate from '../../../themes/hcmut-report-v1/components/page-break.tex.mustache?raw';
import bundledHcmutLogoUrl from '../../../themes/hcmut-report-v1/assets/hcmut.png?url&inline';

export const hcmutLogoUrl = bundledHcmutLogoUrl;

const resources: ThemeResources = {
  'document.tex.mustache': documentTemplate,
  'preamble.tex': preambleTemplate,
  'components/cover.tex.mustache': coverTemplate,
  'components/header.tex.mustache': headerTemplate,
  'components/footer.tex.mustache': footerTemplate,
  'components/frontmatter.tex.mustache': frontmatterTemplate,
  'components/front-section.tex.mustache': frontSectionTemplate,
  'components/heading-1.tex.mustache': heading1Template,
  'components/heading-2.tex.mustache': heading2Template,
  'components/heading-3.tex.mustache': heading3Template,
  'components/heading-4.tex.mustache': heading4Template,
  'components/figure.tex.mustache': figureTemplate,
  'components/table.tex.mustache': tableTemplate,
  'components/code-listing.tex.mustache': listingTemplate,
  'components/theorem.tex.mustache': theoremTemplate,
  'components/property.tex.mustache': propertyTemplate,
  'components/proposition.tex.mustache': propositionTemplate,
  'components/corollary.tex.mustache': corollaryTemplate,
  'components/lemma.tex.mustache': lemmaTemplate,
  'components/exercise.tex.mustache': exerciseTemplate,
  'components/page-break.tex.mustache': pageBreakTemplate,
  'assets/hcmut.png': hcmutLogoUrl,
};

export const hcmutThemePackage: LoadedThemePackage = loadNormalizedTheme();

function loadNormalizedTheme(): LoadedThemePackage {
  const result = loadThemePackage(manifestSource, resources);
  if (!result.theme) {
    throw new Error(`Invalid bundled HCMUT theme: ${result.errors.join(' ')}`);
  }
  return result.theme;
}
