import * as React from 'react';

type IconProps = {
  className?: string;
};

const base = {
  stroke: 'currentColor' as const,
  fill: 'none' as const,
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
};

export const IconArrowRight: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const IconSignal: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <circle cx="6" cy="18" r="1.6" fill="currentColor" stroke="none" />
    <path d="M6 14a4 4 0 0 1 4 4" />
    <path d="M6 9.5A8.5 8.5 0 0 1 14.5 18" />
    <path d="M6 5A13 13 0 0 1 19 18" />
  </svg>
);

export const IconBrain: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <path d="M9 4a2.5 2.5 0 0 0-2.5 2.5c0 .6.2 1.1.5 1.6A2.5 2.5 0 0 0 6 10.5 2.5 2.5 0 0 0 8 13v3a3 3 0 0 0 3 3" />
    <path d="M15 4a2.5 2.5 0 0 1 2.5 2.5c0 .6-.2 1.1-.5 1.6a2.5 2.5 0 0 1 1 1.9A2.5 2.5 0 0 1 16 13v3a3 3 0 0 1-3 3v-9" />
  </svg>
);

export const IconCalendar: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <rect x="3" y="5" width="18" height="16" rx="2.5" />
    <path d="M16 3v4M8 3v4M3 10h18" />
    <circle cx="8" cy="15" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="15" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconBolt: React.FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
  </svg>
);

export const IconChat: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <path d="M21 12a8 8 0 1 1-3.2-6.4M21 12c0-1-.2-2-.5-2.8M4 20l1.3-3.6A7.96 7.96 0 0 1 4 12" />
  </svg>
);

export const IconShield: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <path d="M12 3l7 3v5c0 4.5-2.9 8-7 9-4.1-1-7-4.5-7-9V6l7-3z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

export const IconCheck: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <path d="M5 12l5 5L19 7" />
  </svg>
);

export const IconX: React.FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.9 3H22l-7.4 8.4L23.2 21H17l-5-6.1L6.2 21H3l7.9-9-7.6-9h6.3l4.5 5.6L18.9 3zm-1.1 16h1.7L7.3 5H5.5l12.3 14z" />
  </svg>
);

export const IconLinkedIn: React.FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <circle cx="8" cy="8.5" r="1.6" fill="var(--color-background, #08080c)" />
    <rect x="6.8" y="11" width="2.4" height="7" fill="var(--color-background, #08080c)" />
    <path
      d="M12 18v-7h2.3v1c.5-.7 1.3-1.2 2.4-1.2 2 0 3.3 1.3 3.3 3.7V18h-2.4v-3.1c0-1.1-.5-1.8-1.5-1.8-.8 0-1.4.6-1.6 1.1-.1.2-.1.5-.1.8V18H12z"
      fill="var(--color-background, #08080c)"
    />
  </svg>
);

export const IconWhatsApp: React.FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2a10 10 0 0 0-8.6 15l-1.1 4 4.1-1.1A10 10 0 1 0 12 2zm5.6 14.2c-.2.6-1.2 1.2-1.7 1.3-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.5-4-.1-.2-1.1-1.4-1.1-2.7 0-1.3.7-1.9 1-2.2.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4.2.5.7 1.7.8 1.8.1.2.1.4 0 .6-.1.2-.1.3-.3.5-.1.2-.3.4-.4.5-.2.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.5 1.6.3.1.4.1.6-.1.2-.2.7-.8.9-1.1.2-.3.4-.2.6-.1.2.1 1.5.7 1.8.8.3.1.4.2.5.3.1.2.1.7-.1 1.3z" />
  </svg>
);

export const IconLogoMark: React.FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <path
      d="M4 11a8 8 0 1 1 3.1 6.3L4 18l1-3.1A7.96 7.96 0 0 1 4 11z"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="11" r="2" fill="currentColor" />
  </svg>
);
