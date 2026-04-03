interface StatCardProps {
  label: string;
  value: string;
  color?: string;
  subText?: string;
  size?: "sm" | "md" | "lg";
}

export default function StatCard({ label, value, color = "#f5f5f5", subText, size = "md" }: StatCardProps) {
  const valueSize = size === "lg" ? "text-2xl md:text-3xl" : size === "sm" ? "text-lg md:text-xl" : "text-xl md:text-2xl";
  const padding = size === "lg" ? "p-4 md:p-5" : size === "sm" ? "p-2.5" : "p-3.5";

  return (
    <div className={`bg-chamber-surface border border-chamber-border rounded-lg ${padding} text-center`}>
      <div className="text-chamber-text-muted text-[0.65rem] uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className={`${valueSize} font-bold`} style={{ color }}>
        {value}
      </div>
      {subText && (
        <div className="text-chamber-text-dim text-[0.65rem] mt-0.5">{subText}</div>
      )}
    </div>
  );
}
