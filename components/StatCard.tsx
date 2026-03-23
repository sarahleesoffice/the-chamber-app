interface StatCardProps {
  label: string;
  value: string;
  color?: string;
  subText?: string;
}

export default function StatCard({ label, value, color = "#f5f5f5", subText }: StatCardProps) {
  return (
    <div className="bg-chamber-surface border border-chamber-border rounded-lg p-3.5 text-center">
      <div className="text-chamber-text-muted text-[0.7rem] uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className="text-xl md:text-2xl font-bold" style={{ color }}>
        {value}
      </div>
      {subText && (
        <div className="text-chamber-text-dim text-[0.7rem] mt-0.5">{subText}</div>
      )}
    </div>
  );
}
