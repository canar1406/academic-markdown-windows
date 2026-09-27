import type { LmxAttributeValue } from './lmx.js';

export type QuickStyleAlignment = 'left' | 'center' | 'right' | 'justify';
export type QuickStyleFontStyle = 'normal' | 'italic';
export type QuickStyleFontWeight = '400' | '500' | '600' | '700';

export interface QuickStyleAttributes {
  component?: string;
  theme?: string;
  color?: string;
  background?: string;
  titleColor?: string;
  fontFamily?: string;
  fontSizePt?: number;
  fontWeight?: QuickStyleFontWeight;
  fontStyle?: QuickStyleFontStyle;
  lineHeight?: number;
  letterSpacingPt?: number;
  titleFontFamily?: string;
  titleFontSizePt?: number;
  titleFontWeight?: QuickStyleFontWeight;
  titleFontStyle?: QuickStyleFontStyle;
  titleLineHeight?: number;
  titleLetterSpacingPt?: number;
  align?: QuickStyleAlignment;
  borderColor?: string;
  borderWidthPt?: number;
  borderRadiusPt?: number;
  marginMm?: number;
  paddingMm?: number;
}

export interface QuickStyleValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  attributes: QuickStyleAttributes;
}

type QuickStyleProperty = keyof QuickStyleAttributes;
type PropertyValidator = (value: LmxAttributeValue) => string | undefined;

const hexadecimalColor = /^#[0-9A-F]{6}$/i;
const componentToken = /^[A-Za-z][A-Za-z0-9-]*$/;
const themeAlias = /^[A-Za-z][A-Za-z0-9_-]*$/;
const safeFontFamily = /^[A-Za-z][A-Za-z0-9 _-]{0,79}$/;

const propertyValidators: Record<QuickStyleProperty, PropertyValidator> = {
  component: (value) => validString(value, componentToken)
    ? undefined
    : 'Quick Edit component must be a safe component token.',
  theme: (value) => validString(value, themeAlias)
    ? undefined
    : 'Quick Edit theme must be a safe theme alias.',
  color: colorValidator('color'),
  background: colorValidator('background'),
  titleColor: colorValidator('titleColor'),
  fontFamily: fontFamilyValidator('fontFamily'),
  fontSizePt: rangeValidator('fontSizePt', 4, 144),
  fontWeight: fontWeightValidator('fontWeight'),
  fontStyle: fontStyleValidator('fontStyle'),
  lineHeight: rangeValidator('lineHeight', 0.8, 4),
  letterSpacingPt: rangeValidator('letterSpacingPt', -10, 20),
  titleFontFamily: fontFamilyValidator('titleFontFamily'),
  titleFontSizePt: rangeValidator('titleFontSizePt', 4, 144),
  titleFontWeight: fontWeightValidator('titleFontWeight'),
  titleFontStyle: fontStyleValidator('titleFontStyle'),
  titleLineHeight: rangeValidator('titleLineHeight', 0.8, 4),
  titleLetterSpacingPt: rangeValidator('titleLetterSpacingPt', -10, 20),
  align: (value) => typeof value === 'string'
    && (['left', 'center', 'right', 'justify'] as string[]).includes(value)
    ? undefined
    : 'Quick Edit align must be left, center, right, or justify.',
  borderColor: colorValidator('borderColor'),
  borderWidthPt: rangeValidator('borderWidthPt', 0, 24),
  borderRadiusPt: rangeValidator('borderRadiusPt', 0, 100),
  marginMm: rangeValidator('marginMm', 0, 100),
  paddingMm: rangeValidator('paddingMm', 0, 100),
};

const knownProperties = new Set<QuickStyleProperty>(
  Object.keys(propertyValidators) as QuickStyleProperty[],
);

export function hasQuickStyleOverride(
  attributes: Readonly<Record<string, LmxAttributeValue>>,
): boolean {
  return [...knownProperties].some((property) => (
    property !== 'component' && Object.prototype.hasOwnProperty.call(attributes, property)
  ));
}

export function validateQuickStyleAttributes(
  attributes: Readonly<Record<string, LmxAttributeValue>>,
): QuickStyleValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const validatedAttributes: Partial<Record<QuickStyleProperty, LmxAttributeValue>> = {};
  for (const [key, value] of Object.entries(attributes)) {
    const property = key as QuickStyleProperty;
    const validator = propertyValidators[property];
    if (!validator) {
      warnings.push(`Unknown Quick Edit style property is preserved: ${key}.`);
      continue;
    }
    const error = validator(value);
    if (error) errors.push(error);
    else validatedAttributes[property] = value;
  }
  errors.sort((left, right) => left.localeCompare(right));
  warnings.sort((left, right) => left.localeCompare(right));
  const valid = errors.length === 0;
  return {
    valid,
    errors,
    warnings,
    attributes: valid ? validatedAttributes as QuickStyleAttributes : {},
  };
}

function validString(value: LmxAttributeValue, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.test(value);
}

function colorValidator(property: string): PropertyValidator {
  return (value) => validString(value, hexadecimalColor)
    ? undefined
    : `Quick Edit ${property} must be a hexadecimal color.`;
}

function fontFamilyValidator(property: string): PropertyValidator {
  return (value) => validString(value, safeFontFamily)
    ? undefined
    : `Quick Edit ${property} must be a safe font family name.`;
}

function fontWeightValidator(property: string): PropertyValidator {
  return (value) => typeof value === 'string'
    && (['400', '500', '600', '700'] as string[]).includes(value)
    ? undefined
    : `Quick Edit ${property} must be one of 400, 500, 600, or 700.`;
}

function fontStyleValidator(property: string): PropertyValidator {
  return (value) => value === 'normal' || value === 'italic'
    ? undefined
    : `Quick Edit ${property} must be normal or italic.`;
}

function rangeValidator(property: string, minimum: number, maximum: number): PropertyValidator {
  return (value) => typeof value === 'number'
    && Number.isFinite(value)
    && value >= minimum
    && value <= maximum
    ? undefined
    : `Quick Edit ${property} must be between ${minimum} and ${maximum}.`;
}
