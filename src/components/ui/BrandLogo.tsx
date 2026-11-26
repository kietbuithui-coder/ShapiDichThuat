import React from 'react';

export const BrandLogo: React.FC<{ size?: number; showWordmark?: boolean }> = ({
  size = 34,
  showWordmark = true,
}) => {
  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
        className="shrink-0 rounded-xl shadow-xs"
      >
        <defs>
          <linearGradient id="lfBrandGrad" x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#2E5BFF" />
            <stop offset="100%" stopColor="#0D9488" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#lfBrandGrad)" />
        <path
          d="M18 23V29M25 16V33M32 12V35M39 18V31M46 24V28"
          stroke="#FFFFFF"
          strokeWidth="3.8"
          strokeLinecap="round"
        />
        <rect x="14" y="41" width="36" height="4.4" rx="2.2" fill="#FFFFFF" />
        <rect x="20" y="49" width="24" height="3.6" rx="1.8" fill="#FFFFFF" fillOpacity="0.78" />
      </svg>
      {showWordmark && (
        <div className="flex flex-col leading-none">
          <span className="text-[15px] font-bold tracking-tight text-[var(--text-primary)]">
            LINGUA FLOW
          </span>
          <span className="text-[11px] font-medium text-[var(--text-secondary)] mt-0.5">
            Phụ đề AI trực tiếp
          </span>
        </div>
      )}
    </div>
  );
};
