/**
 * Runs the tests of a describe block as a browser set to `locale` would:
 * every date and number written with no locale named (`new
 * Intl.DateTimeFormat(undefined, …)`, `toLocaleString()`) comes out in it,
 * while one that names its locale is left alone. Node has one default locale
 * for the process, so this is how a test proves a sentence the app writes in
 * English doesn't pick up the reader's own dates and digits (Unit 20, batch 9:
 * "the week of 8. Juni.").
 *
 * The real functions are swapped by hand, not with `vi.spyOn`, so a
 * `vi.restoreAllMocks()` in the file under way can't end it early. A
 * formatter built when a module loads was built before this took hold:
 * modules under test build theirs on first use.
 */
export function inBrowserLocale(locale: string): void {
  type Locales = Intl.LocalesArgument;
  const real = {
    DateTimeFormat: Intl.DateTimeFormat,
    NumberFormat: Intl.NumberFormat,
    number: Number.prototype.toLocaleString,
    date: Date.prototype.toLocaleString,
    dateOnly: Date.prototype.toLocaleDateString,
    timeOnly: Date.prototype.toLocaleTimeString,
  };

  beforeEach(() => {
    // Plain functions, since both are called with `new`.
    const DateTimeFormat = function (locales?: Locales, options?: Intl.DateTimeFormatOptions) {
      return new real.DateTimeFormat(locales ?? locale, options);
    };
    DateTimeFormat.prototype = real.DateTimeFormat.prototype;
    DateTimeFormat.supportedLocalesOf = real.DateTimeFormat.supportedLocalesOf;
    const NumberFormat = function (locales?: Locales, options?: Intl.NumberFormatOptions) {
      return new real.NumberFormat(locales ?? locale, options);
    };
    NumberFormat.prototype = real.NumberFormat.prototype;
    NumberFormat.supportedLocalesOf = real.NumberFormat.supportedLocalesOf;
    Intl.DateTimeFormat = DateTimeFormat as typeof Intl.DateTimeFormat;
    Intl.NumberFormat = NumberFormat as typeof Intl.NumberFormat;

    Number.prototype.toLocaleString = function (
      this: number,
      locales?: Locales,
      options?: Intl.NumberFormatOptions,
    ) {
      return real.number.call(this, locales ?? locale, options);
    } as typeof Number.prototype.toLocaleString;
    const dated = (original: (locales?: Locales, options?: Intl.DateTimeFormatOptions) => string) =>
      function (this: Date, locales?: Locales, options?: Intl.DateTimeFormatOptions) {
        return original.call(this, locales ?? locale, options);
      };
    Date.prototype.toLocaleString = dated(real.date);
    Date.prototype.toLocaleDateString = dated(real.dateOnly);
    Date.prototype.toLocaleTimeString = dated(real.timeOnly);

    // Proves the switch took: a locale that silently didn't apply would make the test vacuous.
    expect(new Intl.DateTimeFormat().resolvedOptions().locale).toBe(locale);
    expect((1234.5).toLocaleString()).toBe(real.number.call(1234.5, locale));
  });

  afterEach(() => {
    Intl.DateTimeFormat = real.DateTimeFormat;
    Intl.NumberFormat = real.NumberFormat;
    Number.prototype.toLocaleString = real.number;
    Date.prototype.toLocaleString = real.date;
    Date.prototype.toLocaleDateString = real.dateOnly;
    Date.prototype.toLocaleTimeString = real.timeOnly;
  });
}
