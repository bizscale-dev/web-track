// Company app mark — the triple-chevron from bizscale.pk's own logo (it's
// the "A" in their BIZSC^ALE wordmark), set on a rounded-square tile so it
// reads as an app icon in the sidebar/header. `open` controls which way the
// chevrons point so it doubles as the sidebar's collapse/expand toggle. The
// browser favicon (app/favicon.ico) is the bare mark pulled straight from
// bizscale.pk, without the tile.
export default function LogoMark({ className = "", open = true }: { className?: string; open?: boolean }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={`transition-transform duration-300 ease-out ${open ? "" : "rotate-180"} ${className}`}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="7" fill="#19b295" />
      <g fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 25 L16 19 L23 25" />
        <path d="M9 18.5 L16 12.5 L23 18.5" />
        <path d="M9 12 L16 6 L23 12" />
      </g>
    </svg>
  );
}
