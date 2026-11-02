import { describe, expect, it } from 'vitest';
import { installMode, isIos, isStandalone } from '../src/lib/install';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';

describe('installMode', () => {
  it('offers nothing when already installed', () => {
    expect(installMode({ standalone: true, ios: true, hasPrompt: true })).toBeNull();
  });

  it('uses the browser prompt when there is one, else iOS instructions', () => {
    expect(installMode({ standalone: false, ios: false, hasPrompt: true })).toBe('prompt');
    expect(installMode({ standalone: false, ios: true, hasPrompt: false })).toBe('ios');
    expect(installMode({ standalone: false, ios: false, hasPrompt: false })).toBeNull();
  });
});

describe('isIos', () => {
  it('detects iPhone and iPadOS, not Mac or Android', () => {
    expect(isIos({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgent: MAC, maxTouchPoints: 5 })).toBe(true); // iPadOS
    expect(isIos({ userAgent: MAC, maxTouchPoints: 0 })).toBe(false);
    expect(isIos({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe(false);
  });
});

describe('isStandalone', () => {
  const win = (matches: boolean) => ({ matchMedia: () => ({ matches }) as MediaQueryList });
  it('is true for display-mode standalone or iOS navigator.standalone', () => {
    expect(isStandalone(win(true), {} as Navigator)).toBe(true);
    expect(isStandalone(win(false), { standalone: true } as unknown as Navigator)).toBe(true);
    expect(isStandalone(win(false), {} as Navigator)).toBe(false);
  });
});
