const HUES = {
  blue: "#2a78d6",
  emerald: "#1baf7a",
} as const;

const WIDTH = 520;
const HEIGHT = 200;
const PAD_LEFT = 28;
const PAD_RIGHT = 12;
const PAD_TOP = 24;
const PAD_BOTTOM = 26;

const PLOT_WIDTH = WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_HEIGHT = HEIGHT - PAD_TOP - PAD_BOTTOM;

/** Round a max value up to a clean axis ceiling (2, 4, 6, 10, 20, 50, ...). */
function niceMax(max: number): number {
  if (max <= 2) return 2;
  if (max <= 10) return Math.ceil(max / 2) * 2;
  if (max <= 50) return Math.ceil(max / 10) * 10;
  return Math.ceil(max / 20) * 20;
}

/**
 * A single-series line chart with a real x/y axis for month-over-month growth
 * counts. Small, fixed-length series (6 months) so every point is direct-labeled
 * rather than relying on hover alone; a native <title> still ships per point.
 */
export function MonthlyGrowthChart({
  data,
  hue = "blue",
}: {
  data: { month: string; count: number }[];
  hue?: keyof typeof HUES;
}) {
  const color = HUES[hue];
  const yMax = niceMax(Math.max(...data.map((d) => d.count)));
  const yTicks = [0, yMax / 2, yMax];

  const xAt = (i: number) =>
    data.length > 1 ? PAD_LEFT + (i / (data.length - 1)) * PLOT_WIDTH : PAD_LEFT + PLOT_WIDTH / 2;
  const yAt = (v: number) => PAD_TOP + PLOT_HEIGHT - (v / yMax) * PLOT_HEIGHT;

  const points = data.map((d, i) => ({ ...d, x: xAt(i), y: yAt(d.count) }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${yAt(0)} L${points[0].x},${yAt(0)} Z`;
  const gradientId = `growth-fill-${hue}`;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full"
      role="img"
      aria-label={`Monthly growth: ${data.map((d) => `${d.month} ${d.count}`).join(", ")}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.16} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Y-axis gridlines + tick labels */}
      {yTicks.map((v) => (
        <g key={v}>
          <line
            x1={PAD_LEFT}
            x2={WIDTH - PAD_RIGHT}
            y1={yAt(v)}
            y2={yAt(v)}
            className="stroke-border"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={PAD_LEFT - 8}
            y={yAt(v)}
            dominantBaseline="middle"
            textAnchor="end"
            className="fill-muted-foreground text-[8px] font-mono tabular-nums"
          >
            {v}
          </text>
        </g>
      ))}

      {/* Y-axis line */}
      <line
        x1={PAD_LEFT}
        x2={PAD_LEFT}
        y1={PAD_TOP}
        y2={yAt(0)}
        className="stroke-muted-foreground/40"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />

      {/* Area fill under the line */}
      <path d={areaPath} fill={`url(#${gradientId})`} />

      {/* Line */}
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />

      {/* Points, direct value labels, x-axis month labels */}
      {points.map((p) => (
        <g key={p.month}>
          <circle cx={p.x} cy={p.y} r={4} fill={color} className="stroke-card" strokeWidth={2}>
            <title>
              {p.month}: {p.count}
            </title>
          </circle>
          <text
            x={p.x}
            y={p.y - 10}
            textAnchor="middle"
            className="fill-foreground text-[10px] font-semibold tabular-nums"
          >
            {p.count}
          </text>
          <text
            x={p.x}
            y={HEIGHT - 6}
            textAnchor="middle"
            className="fill-muted-foreground text-[9px] font-mono uppercase tracking-wide"
          >
            {p.month}
          </text>
        </g>
      ))}
    </svg>
  );
}
