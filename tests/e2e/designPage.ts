/// <reference lib="dom" />
/**
 * Checks of what Unit 12's design promises on whatever screen is showing,
 * measured in the browser from computed styles and boxes rather than read off
 * class names: touch targets of 44 px, text contrast against what is really
 * behind it, icons hidden from screen readers with every control named by its
 * words, no sideways page scroll, and a visible focus ring on every control
 * Tab reaches. Each check returns a list of what broke it, so a failure says
 * which element and why, and an empty list is a pass.
 */
import type { Locator, Page } from '@playwright/test';

/** WCAG 2.5.5 / Unit 12's "44 px touch targets". */
const MIN_TARGET_PX = 44;

/** The screen's design faults, one string per element at fault. */
export interface ScreenAudit {
  /** What the audit looked at, so a test can prove it wasn't vacuous. */
  counted: { targets: number; texts: number; icons: number };
  smallTargets: string[];
  lowContrast: string[];
  /** An `svg` a screen reader would read (not `aria-hidden`), outside the score. */
  spokenIcons: string[];
  /** A button or link with no words of its own (its name would be empty or come from an icon). */
  unnamedControls: string[];
  /** The page scrolls sideways: wider than the window. */
  overflow: string[];
}

/**
 * Audits the screen as drawn now. The score (`.jam-score`, alphaTab's own
 * SVG) is left out: its colours are checked as tokens in
 * tests/unit/designTokens.test.ts and it has no controls.
 */
export function auditScreen(page: Page): Promise<ScreenAudit> {
  return page.evaluate(async (minTarget) => {
    // Judge the screen as it ends up, not mid fade-in (a spinner turns for ever: leave it).
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    );
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('No 2d canvas');

    type Rgba = [number, number, number, number];
    // Any CSS colour Chromium computes (rgb, oklab from an opacity modifier,
    // color-mix) to sRGB, by painting it.
    const rgba = (color: string): Rgba => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0, a = 0] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const over = (top: Rgba, under: Rgba): Rgba => {
      const a = top[3];
      return [
        top[0] * a + under[0] * (1 - a),
        top[1] * a + under[1] * (1 - a),
        top[2] * a + under[2] * (1 - a),
        1,
      ];
    };
    const luminance = ([r, g, b]: Rgba) => {
      const lin = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const ratio = (a: Rgba, b: Rgba) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
      return (hi + 0.05) / (lo + 0.05);
    };

    const describe = (el: Element) => {
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
      const id = el.getAttribute('data-testid') ?? el.getAttribute('aria-label') ?? '';
      return `<${el.tagName.toLowerCase()}${id ? ` ${id}` : ''}> "${text}"`;
    };
    const inScore = (el: Element) => el.closest('.jam-score') !== null;
    const shown = (el: Element) =>
      el.checkVisibility({ visibilityProperty: true, opacityProperty: true }) &&
      el.closest('[inert]') === null;
    // sr-only text: a 1 px box clipped away. It is for screen readers, not eyes.
    const srOnly = (el: Element) => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        if (style.position === 'absolute' && rect.width <= 1 && rect.height <= 1) return true;
      }
      return false;
    };
    // Faded (opacity) means disabled or inactive here, which WCAG 1.4.3 exempts.
    const faded = (el: Element) => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        if (Number(getComputedStyle(node).opacity) < 1) return true;
      }
      return false;
    };
    /** The colour behind an element: its own and its ancestors' backgrounds, composited. */
    const backdrop = (el: Element): Rgba | null => {
      const layers: Rgba[] = [];
      for (let node: Element | null = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.backgroundImage !== 'none') return null;
        const color = rgba(style.backgroundColor);
        if (color[3] > 0) layers.push(color);
        if (color[3] >= 1) break;
      }
      return layers.reduceRight<Rgba>((under, top) => over(top, under), [255, 255, 255, 1]);
    };

    const audit = {
      counted: { targets: 0, texts: 0, icons: 0 },
      smallTargets: [] as string[],
      lowContrast: [] as string[],
      spokenIcons: [] as string[],
      unnamedControls: [] as string[],
      overflow: [] as string[],
    };

    // Targets: the control itself, or for a checkbox or radio the label around it,
    // which is what takes the tap. A link inside a sentence is exempt (WCAG 2.5.8, inline).
    const controls = document.querySelectorAll<HTMLElement>(
      'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"]',
    );
    for (const el of Array.from(controls)) {
      if (inScore(el) || !shown(el) || srOnly(el)) continue;
      if (getComputedStyle(el).display === 'inline') continue;
      const wrapped =
        el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')
          ? el.closest('label')
          : null;
      const rect = (wrapped ?? el).getBoundingClientRect();
      audit.counted.targets += 1;
      if (rect.height < minTarget - 0.5 || rect.width < minTarget - 0.5) {
        audit.smallTargets.push(
          `${describe(el)} is ${Math.round(rect.width)} x ${Math.round(rect.height)}`,
        );
      }
      if (el.matches('button, a[href], [role="button"], [role="tab"]')) {
        const words =
          el.getAttribute('aria-label') ??
          Array.from(el.childNodes)
            .filter((node) => !(node instanceof SVGElement))
            .map((node) => node.textContent ?? '')
            .join('')
            .trim();
        if (!words) audit.unnamedControls.push(describe(el));
      }
    }

    // Text: every element with words of its own, against what is behind it.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || seen.has(el) || !node.textContent?.trim()) continue;
      seen.add(el);
      if (el.closest('svg, script, style, noscript, option') || inScore(el)) continue;
      if (!shown(el) || srOnly(el) || faded(el)) continue;
      const style = getComputedStyle(el);
      const bg = backdrop(el);
      if (!bg) continue;
      audit.counted.texts += 1;
      const fg = over(rgba(style.color), bg);
      const size = parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      const needed = large ? 3 : 4.5;
      const got = ratio(fg, bg);
      if (got < needed - 0.005) {
        audit.lowContrast.push(
          `${describe(el)}: ${style.color} on rgb(${bg.slice(0, 3).map(Math.round).join(' ')}) is ${got.toFixed(2)}:1, needs ${needed}:1`,
        );
      }
    }

    for (const svg of Array.from(document.querySelectorAll('svg'))) {
      if (inScore(svg)) continue;
      // A chart (Unit 14) is an image named by what it shows, not an icon.
      if (svg.getAttribute('role') === 'img' && svg.hasAttribute('aria-label')) continue;
      audit.counted.icons += 1;
      if (svg.closest('[aria-hidden="true"]') === null) audit.spokenIcons.push(describe(svg));
    }

    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth + 1) {
      audit.overflow.push(`page is ${root.scrollWidth} px wide in a ${root.clientWidth} px window`);
    }
    return audit;
  }, MIN_TARGET_PX);
}

/** An audit with nothing at fault, for `toEqual`. Counts are checked apart. */
export function faults(audit: ScreenAudit): Omit<ScreenAudit, 'counted'> {
  const { smallTargets, lowContrast, spokenIcons, unnamedControls, overflow } = audit;
  return { smallTargets, lowContrast, spokenIcons, unnamedControls, overflow };
}

export const NO_FAULTS = {
  smallTargets: [],
  lowContrast: [],
  spokenIcons: [],
  unnamedControls: [],
  overflow: [],
};

/**
 * Words inside `container` drawn past its left or right edge, one string per
 * text. Measured on the text's own line boxes (a Range), not on the element
 * around it: text that overflows its paragraph leaves the paragraph's box
 * where it was. Screen-reader-only text (`.sr-only`) is clipped and left out;
 * text truncated with an ellipsis is measured by the box that clips it.
 */
export function textSpillingOutOf(container: Locator): Promise<string[]> {
  return container.evaluate((root) => {
    const bounds = root.getBoundingClientRect();
    const spilled: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      if (!text || node.parentElement?.closest('.sr-only, svg')) continue;
      // Text cut short with an ellipsis is meant to run on, hidden: its box is what shows.
      const parent = node.parentElement;
      const ellipsis =
        parent && getComputedStyle(parent).textOverflow === 'ellipsis' ? parent : null;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = ellipsis ? [ellipsis.getBoundingClientRect()] : range.getClientRects();
      for (const rect of Array.from(rects)) {
        if (rect.width === 0) continue;
        if (rect.left < bounds.left - 0.5 || rect.right > bounds.right + 0.5) {
          spilled.push(
            `"${text.slice(0, 30)}" runs ${Math.round(rect.left)} to ${Math.round(rect.right)} in a box ${Math.round(bounds.left)} to ${Math.round(bounds.right)}`,
          );
          break;
        }
      }
    }
    return spilled;
  });
}

/** What focus is on and how its ring is drawn, read the moment it got focus. */
interface FocusedRing {
  name: string;
  /** Null when nothing but `<body>` has focus. */
  ring: { style: string; width: number; contrast: number } | null;
  /** The same element as the first one Tab reached: the loop has wrapped. */
  key: string;
  /** Focus is on a visually hidden control, so the ring was measured on its label. */
  throughLabel: boolean;
}

/**
 * Tabs through the screen (up to `limit` stops) and returns each control
 * that got focus without a ring a user can see: an outline other than
 * `none`, either the browser's own (`auto`, native checkboxes and radios) or
 * at least 2 px at 3:1 against what is behind it (WCAG 2.4.7 and 1.4.11).
 *
 * A visually hidden control (an `sr-only` file input) can't show a ring: the
 * one the user sees is its label's, so the label is measured instead, and a
 * hidden control with no label is at fault. Otherwise the hidden control's own
 * invisible `auto` outline would pass. `throughLabel` names those controls, so
 * a test can prove the label was the thing measured.
 */
export async function controlsWithoutFocusRing(
  page: Page,
  limit = 60,
): Promise<{ reached: number; missing: string[]; throughLabel: string[] }> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  const missing: string[] = [];
  const throughLabel: string[] = [];
  const keys = new Set<string>();
  for (let i = 0; i < limit; i += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(async (): Promise<FocusedRing> => {
      const focusedEl = document.activeElement;
      if (!focusedEl || focusedEl === document.body) {
        return { name: 'body', ring: null, key: 'body', throughLabel: false };
      }
      const index = Array.from(document.querySelectorAll('*')).indexOf(focusedEl);
      // Visually hidden (sr-only's 1 px clipped box): the ring that shows is its label's.
      const box = focusedEl.getBoundingClientRect();
      const hidden = box.width <= 1 && box.height <= 1;
      const label =
        focusedEl instanceof HTMLInputElement
          ? (focusedEl.labels?.[0] ?? focusedEl.closest('label'))
          : focusedEl.closest('label');
      const el = hidden && label ? label : focusedEl;
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
      const name = `<${el.tagName.toLowerCase()}> "${el.getAttribute('aria-label') ?? text}"`;
      if (hidden && !label) {
        return {
          name,
          key: String(index),
          throughLabel: false,
          ring: { style: 'none', width: 0, contrast: 1 },
        };
      }
      // The ring's colour fades in with the control's colour transition: judge it once drawn.
      await Promise.all(
        el.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
      );
      const style = getComputedStyle(el);

      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('No 2d canvas');
      const paint = (color: string) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data] as [number, number, number, number];
      };
      // The ring is drawn outside the element (outline-offset), over its parents' background.
      let bg: [number, number, number, number] = [255, 255, 255, 255];
      for (let node = el.parentElement; node; node = node.parentElement) {
        const color = paint(getComputedStyle(node).backgroundColor);
        if (color[3] === 255) {
          bg = color;
          break;
        }
      }
      const lum = ([r, g, b]: number[]) =>
        [r ?? 0, g ?? 0, b ?? 0]
          .map((c) => c / 255)
          .map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4))
          .reduce((sum, c, i) => sum + c * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
      const [hi, lo] = [lum(paint(style.outlineColor)), lum(bg)].sort((a, b) => b - a) as [
        number,
        number,
      ];
      return {
        name,
        key: String(index),
        throughLabel: el !== focusedEl,
        ring: {
          style: style.outlineStyle,
          width: parseFloat(style.outlineWidth),
          contrast: (hi + 0.05) / (lo + 0.05),
        },
      };
    });
    if (keys.has(focused.key)) break;
    keys.add(focused.key);
    const { ring } = focused;
    if (!ring) continue;
    if (focused.throughLabel) throughLabel.push(focused.name);
    const visible =
      ring.style === 'auto' || (ring.style !== 'none' && ring.width >= 2 && ring.contrast >= 3);
    if (!visible) {
      missing.push(
        `${focused.name}: outline ${ring.style} ${ring.width}px at ${ring.contrast.toFixed(2)}:1`,
      );
    }
  }
  return { reached: keys.size - (keys.has('body') ? 1 : 0), missing, throughLabel };
}

/** How an element moves: its animation and transition, as computed now. */
export function motionOf(locator: Locator) {
  return locator.evaluate((el) => {
    const style = getComputedStyle(el);
    const seconds = (value: string) =>
      Math.max(
        ...value.split(',').map((part) => parseFloat(part) * (part.includes('ms') ? 0.001 : 1)),
      );
    return {
      animationName: style.animationName,
      animationSeconds: seconds(style.animationDuration),
      transitionSeconds: seconds(style.transitionDuration),
    };
  });
}

/**
 * The rows a set of boxes stands in: boxes whose vertical extents overlap
 * share a row. For "the controls bar is at most three rows".
 */
export function rowsOf(boxes: { y: number; height: number }[]): number {
  const sorted = [...boxes].sort((a, b) => a.y - b.y);
  let rows = 0;
  let rowBottom = -Infinity;
  for (const box of sorted) {
    if (box.y >= rowBottom - 1) {
      rows += 1;
      rowBottom = box.y + box.height;
    } else {
      rowBottom = Math.max(rowBottom, box.y + box.height);
    }
  }
  return rows;
}
