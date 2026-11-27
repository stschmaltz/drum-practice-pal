import { HEAT_CLASSES, HEATMAP_BRAND_ALPHAS } from './heatmapShades';

describe('heatmap shades', () => {
  it('draws no practice as a quiet cell and each practised level at the alpha the contrast test checks', () => {
    expect(HEAT_CLASSES[0]).toBe('fill-raised');
    const opacities = HEAT_CLASSES.slice(1).map((className) => {
      const match = /^fill-brand(?:\/(\d+))?$/.exec(className);
      if (!match) throw new Error(`Not a brand fill: ${className}`);
      return match[1] === undefined ? 1 : Number(match[1]) / 100;
    });
    expect(opacities).toEqual([...HEATMAP_BRAND_ALPHAS]);
  });
});
