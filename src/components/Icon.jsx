import { ICONS } from '../lib/icons.js';

export default function Icon({ layer, size = 16, className = '' }) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}
      aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[layer] || ICONS.conflict }}
    />
  );
}
