import { describe, expect, it } from 'vitest';
import { installOffer, isIosDevice } from '../src/lib/install.ts';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_OLD = 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1';
const IPAD_MODERN = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const MAC = IPAD_MODERN;
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

describe('spotting an iOS device', () => {
  it('recognises the ones that say so', () => {
    expect(isIosDevice(IPHONE, 5)).toBe(true);
    expect(isIosDevice(IPAD_OLD, 5)).toBe(true);
  });

  it('recognises an iPad pretending to be a Mac', () => {
    // iPadOS 13+ reports a desktop user agent on purpose, so the touch screen
    // is the only thing left to go on. Miss this and every iPad owner is told
    // the app cannot be installed on a device where it installs fine.
    expect(isIosDevice(IPAD_MODERN, 5)).toBe(true);
  });

  it('does not mistake an actual Mac for one', () => {
    // Same user agent as the iPad above — only the touch screen differs.
    expect(isIosDevice(MAC, 0)).toBe(false);
  });

  it('leaves Android to the browser, which has a real API', () => {
    expect(isIosDevice(ANDROID, 5)).toBe(false);
  });
});

describe('what to offer', () => {
  it('offers nothing to someone already inside the installed app', () => {
    // Even where a prompt is somehow available — being asked to install the
    // app you are reading this in is nonsense.
    expect(installOffer({ standalone: true, canPrompt: true, ios: false })).toBe('installed');
    expect(installOffer({ standalone: true, canPrompt: false, ios: true })).toBe('installed');
  });

  it('prefers the browser\'s own prompt when there is one', () => {
    expect(installOffer({ standalone: false, canPrompt: true, ios: false })).toBe('prompt');
  });

  it('falls back to written steps on iOS, which has no prompt to give', () => {
    expect(installOffer({ standalone: false, canPrompt: false, ios: true })).toBe('manual');
  });

  it('says nothing at all when there is nothing to say', () => {
    // A desktop browser with no install support gets no section, rather than a
    // section explaining that it cannot do anything.
    expect(installOffer({ standalone: false, canPrompt: false, ios: false })).toBe('none');
  });
});
