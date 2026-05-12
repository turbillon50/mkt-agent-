import { cn } from '@/lib/utils';

export function Sparkline({
  data,
  className,
  height = 56,
}: {
  data: number[];
  className?: string;
  height?: number;
}) {
  const width = 240;
  const max = Math.max(1, ...data);
  const min = Math.min(0, ...data);
  const stepX = data.length > 1 ? width / (data.length - 1) : width;
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / Math.max(1, max - min)) * (height - 6) - 3;
    return [x, y] as const;
  });
  const path =
    points.length === 0
      ? ''
      : `M ${points[0]![0].toFixed(1)} ${points[0]![1].toFixed(1)} ` +
        points
          .slice(1)
          .map(([x, y], i) => {
            const [px, py] = points[i]!;
            const cx1 = (px + x) / 2;
            return `C ${cx1.toFixed(1)} ${py.toFixed(1)} ${cx1.toFixed(1)} ${y.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
          })
          .join(' ');
  const areaPath = path + ` L ${width} ${height} L 0 ${height} Z`;
  const lastPoint = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('w-full', className)}
      style={{ height }}
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#a872ff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#a872ff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="spark-line" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#f472b6" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#spark-fill)" />
      <path d={path} fill="none" stroke="url(#spark-line)" strokeWidth="2" />
      {lastPoint && (
        <circle cx={lastPoint[0]} cy={lastPoint[1]} r="3.5" fill="#f472b6" />
      )}
    </svg>
  );
}
