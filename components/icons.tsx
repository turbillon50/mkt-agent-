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

export const IconArrowLeft: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </svg>
);

export const IconArrowUpRight: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <path d="M7 17 17 7M8 7h9v9" />
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

export const IconSparkles: React.FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
    <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
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

export const IconCheckCircle: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.5l2.5 2.5L16 9.5" />
  </svg>
);

export const IconX: React.FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.9 3H22l-7.4 8.4L23.2 21H17l-5-6.1L6.2 21H3l7.9-9-7.6-9h6.3l4.5 5.6L18.9 3zm-1.1 16h1.7L7.3 5H5.5l12.3 14z" />
  </svg>
);

export const IconClose: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const IconLinkedIn: React.FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <circle cx="8" cy="8.5" r="1.6" fill="var(--color-background, #fff)" />
    <rect x="6.8" y="11" width="2.4" height="7" fill="var(--color-background, #fff)" />
    <path
      d="M12 18v-7h2.3v1c.5-.7 1.3-1.2 2.4-1.2 2 0 3.3 1.3 3.3 3.7V18h-2.4v-3.1c0-1.1-.5-1.8-1.5-1.8-.8 0-1.4.6-1.6 1.1-.1.2-.1.5-.1.8V18H12z"
      fill="var(--color-background, #fff)"
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

export const IconHome: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <path d="M4 11.5 12 4l8 7.5" />
    <path d="M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9" />
  </svg>
);

export const IconFolder: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
  </svg>
);

export const IconFile: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 16.5h6" />
  </svg>
);

export const IconBarChart: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <path d="M4 20V10M11 20V4M18 20v-7" />
  </svg>
);

export const IconUsers: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    <path d="M16 4.5a3 3 0 0 1 0 6" />
    <path d="M21 19.5c0-2.8-1.9-5-4.5-5.6" />
  </svg>
);

export const IconPlug: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <path d="M9 3v5M15 3v5" />
    <path d="M7 8h10v3a5 5 0 0 1-10 0V8z" />
    <path d="M12 16v5" />
  </svg>
);

export const IconPhone: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <rect x="7" y="2" width="10" height="20" rx="2" />
    <path d="M11 18h2" />
  </svg>
);

export const IconPlus: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconMenu: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const IconChevronDown: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const IconPaperclip: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <path d="M21 11.5 12.5 20a4 4 0 0 1-5.7-5.7L15 6a2.7 2.7 0 0 1 3.8 3.8L10.6 18a1.3 1.3 0 0 1-1.9-1.9l7-7" />
  </svg>
);

export const IconSend: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <path d="M21 3 3 10.5l7.5 3L13.5 21 21 3z" />
    <path d="M10.5 13.5 21 3" />
  </svg>
);

export const IconBell: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <path d="M6 10a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </svg>
);

export const IconEdit: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
);

export const IconDownload: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <path d="M12 4v12M7 11l5 5 5-5" />
    <path d="M5 19h14" />
  </svg>
);

export const IconShare: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <circle cx="6" cy="12" r="2.2" />
    <circle cx="18" cy="6" r="2.2" />
    <circle cx="18" cy="18" r="2.2" />
    <path d="M7.9 10.9l8.2-3.8M7.9 13.1l8.2 3.8" />
  </svg>
);

export const IconMail: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3.5 6.5l8.5 6 8.5-6" />
  </svg>
);

export const IconTarget: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </svg>
);

/** Campañas: una pauta que sale a buscar gente. */
export const IconMegaphone: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <path d="M3 11v2a1 1 0 0 0 1 1h2.5L14 19V5L6.5 10H4a1 1 0 0 0-1 1z" />
    <path d="M17.5 9.5a3.5 3.5 0 0 1 0 5" />
    <path d="M7 14.5V19a1.5 1.5 0 0 0 3 0v-3.2" />
  </svg>
);

export const IconFacebook: React.FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.51 1.49-3.9 3.77-3.9 1.09 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94z" />
  </svg>
);

export const IconInstagram: React.FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
  </svg>
);

// --- corrida 3: proyecto como unidad central -------------------------------

export const IconSettings: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const IconLink: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

export const IconCopy: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

export const IconTrash: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
  </svg>
);

export const IconGlobe: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z" />
  </svg>
);

export const IconBox: React.FC<IconProps> = ({ className }) => (
  <svg className={className} {...base}>
    <path d="M21 8 12 3 3 8v8l9 5 9-5V8z" />
    <path d="m3 8 9 5 9-5M12 13v8" />
  </svg>
);

/** Logotipo oficial de Google (los cuatro colores de marca). */
export const IconGoogle: React.FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <path d="M21.6 12.23c0-.71-.06-1.4-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.3 2.98-7.36z" fill="#4285F4" />
    <path d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.59A10 10 0 0 0 12 22z" fill="#34A853" />
    <path d="M6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.06a10 10 0 0 0 0 9.02l3.35-2.59z" fill="#FBBC05" />
    <path d="M12 5.94c1.47 0 2.79.51 3.83 1.5l2.87-2.87C16.95 2.98 14.7 2 12 2a10 10 0 0 0-8.94 5.49l3.35 2.59C7.2 7.72 9.4 5.94 12 5.94z" fill="#EA4335" />
  </svg>
);

/** Logotipo oficial de TikTok, en un solo tono para que herede el color. */
export const IconTikTok: React.FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.1v12.4a2.59 2.59 0 1 1-1.79-2.46V9.78a5.72 5.72 0 1 0 4.9 5.66V9.01a7.35 7.35 0 0 0 4.3 1.38V7.29a4.29 4.29 0 0 1-3.25-1.47z" />
  </svg>
);
