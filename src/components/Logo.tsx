export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="12" cy="16" r="9" stroke="#F2B544" strokeWidth="2.5" />
      <circle cx="20" cy="16" r="9" stroke="#6CB4F5" strokeWidth="2.5" />
    </svg>
  );
}
