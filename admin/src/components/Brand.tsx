import {useId} from 'react';

/**
 * The campaign mark from the brand kit (Syria/brand in the app repo): the Organic Maps pin split charcoal and
 * teal like the OSM Syria logo, with the road running into the red roundabout. `outlined` adds the light
 * outline used on dark backgrounds.
 */
export function Mark({size = 40, outlined = false, title}: {size?: number; outlined?: boolean; title?: string}) {
  const clip = useId();
  return (
    <svg
      width={size * 0.8}
      height={size}
      viewBox="0 0 240 300"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <clipPath id={clip}>
          <path d="M120 292C120 292 22 196 22 110a98 98 0 0 1 196 0c0 86-98 182-98 182z" />
        </clipPath>
      </defs>
      {outlined && (
        <path
          d="M120 292C120 292 22 196 22 110a98 98 0 0 1 196 0c0 86-98 182-98 182z"
          fill="none"
          stroke="#F2F2F2"
          strokeWidth="10"
        />
      )}
      <g clipPath={`url(#${clip})`}>
        <rect width="120" height="300" fill="#21242A" />
        <rect x="120" width="120" height="300" fill="#0C7C70" />
        <path d="M-10 52C40 50 92 70 112 112" fill="none" stroke="#404E5E" strokeWidth="22" />
        <path d="M-10 52C40 50 92 70 112 112" fill="none" stroke="#F2F2F2" strokeWidth="4" strokeDasharray="10 9" />
        <path d="M120 0V112" stroke="#404E5E" strokeWidth="22" />
        <path d="M120 4V100" stroke="#F2F2F2" strokeWidth="4" strokeDasharray="10 9" />
        <path d="M120 130V300" stroke="#404E5E" strokeWidth="22" />
        <path d="M120 140V300" stroke="#FFFFFF" strokeWidth="8" />
        <path d="M144 190c5-26 28-40 52-38-3 24-24 41-52 38z" fill="#006C35" />
        <path d="M149 186c14-11 27-21 41-30" fill="none" stroke="#0C7C70" strokeWidth="3" strokeLinecap="round" />
      </g>
      <circle cx="120" cy="124" r="36" fill="#404E5E" />
      <circle cx="120" cy="124" r="28" fill="#FFFFFF" />
      <circle cx="120" cy="124" r="17" fill="#C1272D" />
      <g fill="#C1272D">
        <path d="M42 8l3.5 10.8h11.3l-9.2 6.7 3.5 10.8-9.1-6.7-9.2 6.7 3.5-10.8-9.2-6.7h11.4z" transform="rotate(-12 42 22)" />
        <path d="M70 30l2.8 8.6h9l-7.3 5.3 2.8 8.6-7.3-5.3-7.3 5.3 2.8-8.6-7.3-5.3h9z" transform="rotate(-8 70 41)" />
        <path d="M92 52l2.1 6.5h6.8l-5.5 4 2.1 6.5-5.5-4-5.5 4 2.1-6.5-5.5-4h6.8z" />
      </g>
    </svg>
  );
}

/** Name lockup: the name always in Latin letters, as on the phone. */
export function Wordmark() {
  return (
    <span className="wordmark" dir="ltr">
      Syria <span>Organic Maps</span>
    </span>
  );
}

/** The road band from the identity: grey asphalt with a dashed white centre line. */
export function Road({className = ''}: {className?: string}) {
  return <div className={`road ${className}`} aria-hidden="true" />;
}

/** The roundabout: red dot in a white ring on a road-grey ring ("you are here", live markers). */
export function Roundabout({size = 14, pulse = false}: {size?: number; pulse?: boolean}) {
  return <span className={`roundabout${pulse ? ' pulse' : ''}`} style={{width: size, height: size}} aria-hidden="true" />;
}
