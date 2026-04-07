"use client";

const SERVICE_BRAND: Record<string, { background: string; mask: string }> = {
  jellyfin: {
    background: "linear-gradient(135deg, #a95ce0, #4bb8e8)",
    mask: "url(/jellyfin-logo.svg)",
  },
  plex: { background: "#e5a00d", mask: "url(/plex-logo.svg)" },
  jackett: { background: "#c23c2a", mask: "url(/jackett.svg)" },
  qbittorrent: { background: "#4c8eda", mask: "url(/qbitorrent.svg)" },
};

export function ServiceLogo({
  src,
  brand,
  alt,
  size = 48,
}: {
  src?: string;
  brand?: string;
  alt: string;
  size?: number;
}): React.JSX.Element {
  const b = brand ? SERVICE_BRAND[brand] : null;
  if (b) {
    return (
      <span
        role="img"
        aria-label={alt}
        className="inline-block shrink-0"
        style={{
          width: size,
          height: size,
          background: b.background,
          mask: `${b.mask} center/contain no-repeat`,
          WebkitMask: `${b.mask} center/contain no-repeat`,
        }}
      />
    );
  }
  return <img src={src} alt={alt} width={size} height={size} className="shrink-0" />;
}
