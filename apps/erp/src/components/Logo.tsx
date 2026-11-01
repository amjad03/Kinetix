
/** Zynetix mark: a Z in a rounded tile, in the primary colour. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg className="shrink-0 block" style={{ width: size, height: size }}
      viewBox="0 0 48 48"
      aria-hidden
    >
      <rect className="fill-teal" width={48} height={48} rx={14} />
      <path className="[fill:none] stroke-white [stroke-width:5px] [stroke-linecap:round] [stroke-linejoin:round]"
        d="M15 13h18L15 35h18"
      />
    </svg>
  );
}

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="text-sm leading-[21px] font-medium tracking-[0px] text-foreground whitespace-nowrap" style={{ fontSize: size * 0.62 }}>
        Zynetix{' '}
        <span className="text-muted-foreground font-normal">
          ERP
        </span>
      </span>
    </div>
  );
}
