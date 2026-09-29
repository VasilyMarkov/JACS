import { describe, expect, it } from 'vitest';
import { formatEngineering, parseEngineering } from '../src/model/units';

describe('parseEngineering', () => {
    it('reads plain numbers and exponents', () => {
        expect(parseEngineering('42')).toBe(42);
        expect(parseEngineering(' 1e3 ')).toBe(1000);
        expect(parseEngineering('-2.5')).toBe(-2.5);
        expect(parseEngineering('.5')).toBe(0.5);
    });

    it('reads SI suffixes, with M as mega and m as milli', () => {
        expect(parseEngineering('4.7k')).toBeCloseTo(4700);
        expect(parseEngineering('1M')).toBe(1e6);
        expect(parseEngineering('1Meg')).toBe(1e6);
        expect(parseEngineering('3m')).toBeCloseTo(0.003);
        expect(parseEngineering('2.2u')).toBeCloseTo(2.2e-6);
        expect(parseEngineering('10n')).toBeCloseTo(1e-8);
    });

    it('ignores a trailing unit', () => {
        expect(parseEngineering('5V')).toBe(5);
        expect(parseEngineering('4.7 kΩ')).toBeCloseTo(4700);
        expect(parseEngineering('100 ohm')).toBe(100);
    });

    it('rejects anything else', () => {
        for (const text of ['', 'abc', '1x', '1g', '1..2', 'k', '1 2', 'Infinity', '1e999']) {
            expect(parseEngineering(text), text).toBeNull();
        }
    });
});

describe('formatEngineering', () => {
    it('uses three significant digits and an SI prefix', () => {
        expect(formatEngineering(0.003125, 'A')).toBe('3.13 mA');
        expect(formatEngineering(4700, 'Ω')).toBe('4.7 kΩ');
        expect(formatEngineering(5, 'V')).toBe('5 V');
        expect(formatEngineering(-1.875, 'V')).toBe('-1.88 V');
        expect(formatEngineering(2.2e-6, 'A')).toBe('2.2 µA');
    });

    it('promotes values that round up to the next prefix', () => {
        expect(formatEngineering(999.6, 'Ω')).toBe('1 kΩ');
    });

    it('treats numerical noise as zero and handles non-finite values', () => {
        expect(formatEngineering(0, 'V')).toBe('0 V');
        expect(formatEngineering(3e-19, 'A')).toBe('0 A');
        expect(formatEngineering(Number.NaN, 'V')).toBe('? V');
    });

    it('round-trips through the parser', () => {
        for (const value of [1, 47, 4700, 2.2e6, 0.5, 3.3e-6]) {
            const parsed = parseEngineering(formatEngineering(value, 'V'));
            expect(parsed).not.toBeNull();
            expect(parsed).toBeCloseTo(value, 9);
        }
    });
});
