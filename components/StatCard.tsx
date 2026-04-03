interface StatCardProps {
  label: string;
  value: string;
  color?: string;
  subText?: string;
  size?: "sm" | "md" | "lg";
}

export default function StatCard({ label, value, color = "#f5f5f5", subText, size = "md" }: StatCardProps) {
  const valueSize = size === "lg" ? "text-2xl md:text-3xl" : size === "sm" ? "text-sm md:text-base" : "text-lg md:text-xl";
  const padding = size === "lg" ? "p-3 md:p-4" : size === "sm" ? "p-1.5 md:p-2" : "p-2 md:p-3";
  const labelSize = size === "lg" ? "text-[0.6rem]" : size === "sm" ? "text-[0.5rem]" : "text-[0.55rem]";
  const glow = size === "lg" ? `0 0 20px ${color}33` : "none";

  return (
    <div className={`bg-chamber-surface border border-chamber-border rounded-lg ${padding} text-center transition-all hover:border-chamber-orange/20`}>
      <div className={`text-chamber-text-muted ${labelSize} uppercase tracking-widest mb-1`}>
        {label}
      </div>
      <div className={`${valueSize} font-bold`} style={{ color, textShadow: glow }}>
        {value}
      </div>
      {subText && (
        <div className="text-chamber-text-dim text-[0.6rem] mt-0.5">{subText}</div>
      )}
    </div>
  );
}
