// Company app mark — the same rounded-square / triple-chevron icon used for
// the browser favicon (see app/favicon.ico). `open` controls which way the
// chevrons point so it doubles as the sidebar's collapse/expand toggle.
export default function LogoMark({ className = "", open = true }: { className?: string; open?: boolean }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={`transition-transform duration-300 ease-out ${open ? "" : "rotate-180"} ${className}`}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="7" fill="#1a4741" />
      <g fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 7 L16 13 L23 7" />
        <path d="M9 13.5 L16 19.5 L23 13.5" />
        <path d="M9 20 L16 26 L23 20" />
      </g>
    </svg>
  );
}
