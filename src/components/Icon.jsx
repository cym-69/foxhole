import { createElement, Fragment } from 'react';
import { ICON_SHAPES } from '../lib/icons.js';

export default function Icon({ layer, size = 16, className = '' }) {
  const shapes = Object.hasOwn(ICON_SHAPES, layer) ? ICON_SHAPES[layer] : ICON_SHAPES.conflict;
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}
      aria-hidden="true"
    >
      <Fragment>
        {shapes.map((shape, i) => createElement(shape.tag, { key: i, ...shape.props }))}
      </Fragment>
    </svg>
  );
}
