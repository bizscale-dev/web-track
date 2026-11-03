// Company app mark — bizscale.pk's own triple-chevron (the "^" standing in
// for the A in their BIZSC^ALE wordmark), used as-is with no background
// tile, matching the site's own favicon exactly. `open` controls which way
// the chevrons point so it doubles as the sidebar's collapse/expand toggle.
export default function LogoMark({ className = "", open = true }: { className?: string; open?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/bizscale-mark.png"
      alt="Bizscale"
      className={`object-contain transition-transform duration-300 ease-out ${open ? "" : "rotate-180"} ${className}`}
    />
  );
}
