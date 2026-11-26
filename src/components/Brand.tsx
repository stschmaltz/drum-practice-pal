import { createElement } from 'react';
import { BRAND_MARK_SHAPES, type BrandMarkColor, type BrandMarkShape } from './brandMark';

const cssColor = (name: BrandMarkColor) => `var(--color-${name})`;

/** The shapes use SVG's dashed attribute names; React wants camel-case props. */
const reactPropName = (attribute: string) =>
  attribute.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

function shapeProps(shape: BrandMarkShape) {
  return {
    ...Object.fromEntries(
      Object.entries(shape.attrs).map(([name, value]) => [reactPropName(name), value]),
    ),
    ...(shape.fill && { fill: cssColor(shape.fill) }),
    ...(shape.stroke && { stroke: cssColor(shape.stroke) }),
  };
}

/** The mark on its own, decoration beside the name. */
export function BrandMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="40 40 432 400" className={className}>
      {BRAND_MARK_SHAPES.map((shape, index) =>
        createElement(shape.tag, { key: index, ...shapeProps(shape) }),
      )}
    </svg>
  );
}

/**
 * The name treatment: the mark, then "Drum Practice" with "Pal" in the brand
 * colour. Its text reads "Drum Practice Pal", so it can be a heading's whole
 * content.
 */
export function Wordmark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const large = size === 'lg';
  return (
    <span className={`inline-flex items-center ${large ? 'gap-3' : 'gap-2'}`}>
      <BrandMark className={large ? 'size-12' : 'size-8'} />
      <span
        className={`font-extrabold tracking-tight ${large ? 'text-3xl leading-none' : 'text-base leading-tight whitespace-nowrap'}`}
      >
        Drum Practice <span className="text-brand">Pal</span>
      </span>
    </span>
  );
}
