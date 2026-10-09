type P = { name: keyof typeof PATHS; size?: number; style?: React.CSSProperties; className?: string };

const PATHS = {
  locate: "M12 2v3M12 19v3M2 12h3M19 12h3M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z",
  sos: "M12 3v18M3 12h18",
  doc: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  phone: "M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 6a2 2 0 0 1 2-2Z",
  route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6 15V9a4 4 0 0 1 4-4h6M18 9v6a4 4 0 0 1-4 4H8",
  arrow: "M12 19V5M6 11l6-6 6 6",
  flag: "M5 21V4h11l-2 4 2 4H5",
  sun: "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  moon: "M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10Z",
  close: "M6 6l12 12M18 6 6 18",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0",
  check: "M5 12l5 5 9-10",
  alert: "M12 3 2 21h20L12 3ZM12 10v5M12 18v.5",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  spinner: "M12 3a9 9 0 1 0 9 9",
  ext: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  x: "M6 6l12 12M18 6 6 18",
};

export default function Icon({ name, size = 16, style, className }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      style={style}
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
