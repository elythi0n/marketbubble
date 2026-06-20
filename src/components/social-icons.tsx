/**
 * Social brand glyphs (sidebar footer + about-page host cards). Drawn in `currentColor` so the
 * parent's text color drives the tint — that's what lets the row sit in both the dark graphite
 * and light paper palettes without per-theme asset variants.
 */

interface SocialIconProps {
  className?: string;
  title?: string;
}

function commonProps({ className, title }: SocialIconProps) {
  return {
    viewBox: "0 0 24 24",
    fill: "currentColor",
    className,
    role: (title ? "img" : "presentation") as "img" | "presentation",
    "aria-hidden": !title,
  };
}

export function TwitchIcon(props: SocialIconProps) {
  return (
    <svg {...commonProps(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
    </svg>
  );
}

export function KickIcon({ className, title }: SocialIconProps) {
  return (
    <svg
      viewBox="216 216 1107 1107"
      fill="currentColor"
      className={className}
      role={title ? "img" : "presentation"}
      aria-hidden={!title}
    >
      {title ? <title>{title}</title> : null}
      <path d="M278.26 216.86H646.7v245.62h122.81V339.67h122.81V216.86h368.43v368.43h-122.81V708.1h-122.81v122.81h122.81v122.81h122.81v368.44H892.32v-122.81H769.51v-122.81H646.7v245.62H278.26z" />
    </svg>
  );
}

export function XIcon(props: SocialIconProps) {
  return (
    <svg {...commonProps(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z" />
    </svg>
  );
}

export function TikTokIcon(props: SocialIconProps) {
  return (
    <svg {...commonProps(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

export function YouTubeIcon(props: SocialIconProps) {
  return (
    <svg {...commonProps(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

export function SpotifyIcon(props: SocialIconProps) {
  return (
    <svg {...commonProps(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}
