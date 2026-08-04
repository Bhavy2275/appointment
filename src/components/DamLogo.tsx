import React from 'react';

interface DamLogoProps {
  className?: string;
  variant?: 'header' | 'dark' | 'light';
}

export default function DamLogo({ className = '', variant = 'header' }: DamLogoProps) {
  if (variant === 'header') {
    return (
      <div className={`inline-flex items-center gap-3 bg-[#EEF2F6] px-5 py-2.5 rounded-full shadow-sm ${className}`}>
        {/* Bold DAM text */}
        <span className="font-extrabold text-2xl tracking-tighter text-[#101566] font-sans">
          DAM
        </span>
        {/* Subtitle tag */}
        <div className="flex flex-col text-[9px] leading-[1.1] font-semibold text-[#101566]/80 border-l border-[#101566]/30 pl-2.5">
          <span>design.</span>
          <span>allocate.</span>
          <span>maintain.</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <span className="font-black text-3xl sm:text-4xl tracking-tighter text-white font-sans">
        DAM
      </span>
      <div className="flex flex-col text-[10px] sm:text-[11px] leading-[1.1] font-semibold text-white/80 border-l border-white/30 pl-3">
        <span>design.</span>
        <span>allocate.</span>
        <span>maintain.</span>
      </div>
    </div>
  );
}
