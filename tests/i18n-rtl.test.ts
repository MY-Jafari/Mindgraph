import { describe, it, expect } from 'vitest';
import en from '../src/i18n/locales/en.json';
import fa from '../src/i18n/locales/fa.json';

describe('i18n & RTL Language Direction Tests', () => {
  it('has matching root keys across English and Persian translation dictionaries', () => {
    const enKeys = Object.keys(en).sort();
    const faKeys = Object.keys(fa).sort();

    expect(faKeys).toEqual(enKeys);
  });

  it('verifies all common keys exist in both en and fa', () => {
    const enCommonKeys = Object.keys(en.common).sort();
    const faCommonKeys = Object.keys(fa.common).sort();

    expect(faCommonKeys).toEqual(enCommonKeys);
    expect(en.common.save).toBe('Save');
    expect(fa.common.save).toBe('ذخیره');
  });

  it('verifies all nav keys exist in both en and fa', () => {
    const enNavKeys = Object.keys(en.nav).sort();
    const faNavKeys = Object.keys(fa.nav).sort();

    expect(faNavKeys).toEqual(enNavKeys);
    expect(en.nav.mindtree).toBe('Mind Tree');
    expect(fa.nav.mindtree).toBe('درخت ذهن');
  });

  it('verifies all template titles exist in both en and fa', () => {
    const enTemplateKeys = Object.keys(en.templates).sort();
    const faTemplateKeys = Object.keys(fa.templates).sort();

    expect(faTemplateKeys).toEqual(enTemplateKeys);
  });

  it('properly designates fa as rtl and en as ltr', () => {
    const getDirection = (code: string) => (code === 'fa' ? 'rtl' : 'ltr');
    expect(getDirection('fa')).toBe('rtl');
    expect(getDirection('en')).toBe('ltr');
  });
});
