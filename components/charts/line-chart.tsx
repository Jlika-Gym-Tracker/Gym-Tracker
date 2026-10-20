"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type DotItemDotProps,
  type TooltipContentProps,
  type TooltipValueType,
} from "recharts";

/**
 * Charts in this app share one look: no chrome, hairline grid, mono ticks,
 * lime for "you" and grey for the reference series.
 */
const AXIS = {
  stroke: "#5d6763",
  fontSize: 10,
  fontFamily: "var(--font-jetbrains-mono), monospace",
} as const;

const TOOLTIP_STYLE = {
  background: "#0b0d0e",
  border: "1px solid #2c3a14",
  borderRadius: 10,
  fontSize: 12,
  fontFamily: "var(--font-archivo), sans-serif",
  color: "#f2f4f2",
  padding: "8px 10px",
} as const;

export type SeriesPoint = { label: string } & Record<string, number | string | null>;

export function TrendChart({
  data,
  dataKey,
  height = 150,
  unit = "",
  domainPadding = 1,
  reference,
}: {
  data: SeriesPoint[];
  dataKey: string;
  height?: number;
  unit?: string;
  domainPadding?: number;
  /** A dashed target line, e.g. a goal weight. The y-axis always stretches to show it. */
  reference?: { value: number; label: string };
}) {
  const target = reference?.value;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c9f24d" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#c9f24d" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#1d2124" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} minTickGap={24} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={AXIS}
          width={44}
          domain={[
            (min: number) => Math.floor(Math.min(min, target ?? min) - domainPadding),
            (max: number) => Math.ceil(Math.max(max, target ?? max) + domainPadding),
          ]}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: "#7f8a84", fontSize: 10 }}
          formatter={(value) => [`${value ?? "—"}${unit ? ` ${unit}` : ""}`, ""]}
          cursor={{ stroke: "#2c3a14" }}
        />
        {reference ? (
          <ReferenceLine
            y={reference.value}
            stroke="#7d9440"
            strokeDasharray="4 4"
            ifOverflow="extendDomain"
            label={{
              value: reference.label,
              position: "insideTopRight",
              fill: "#7d9440",
              fontSize: 10,
              fontFamily: AXIS.fontFamily,
            }}
          />
        ) : null}
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke="#c9f24d"
          strokeWidth={2}
          fill="url(#trendFill)"
          dot={false}
          connectNulls
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DualLineChart({
  data,
  series,
  height = 150,
}: {
  data: SeriesPoint[];
  series: { key: string; color: string; dashed?: boolean; name: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="#1d2124" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} tick={AXIS} width={44} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: "#7f8a84", fontSize: 10 }}
          cursor={{ stroke: "#2c3a14" }}
        />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={s.dashed ? 1.6 : 2}
            strokeDasharray={s.dashed ? "4 4" : undefined}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * A line with a marker per point and a tooltip written by the caller — for
 * series where each point is a thing in itself (a session, a week) rather than
 * a sample of a smooth trend.
 */
export function MarkedLineChart<T extends SeriesPoint>({
  data,
  dataKey,
  height = 150,
  domain,
  reversed = false,
  describe,
  markFill,
}: {
  data: T[];
  dataKey: string;
  height?: number;
  /** Fixed y-axis bounds; omit to fit the data. */
  domain?: [number, number];
  /** Flip the y-axis, for scales where the smaller number is the bigger value (RIR). */
  reversed?: boolean;
  /** The tooltip's lines for one point, under its label. */
  describe: (point: T) => string[];
  /** A point's marker colour, or null to draw it hollow. Defaults to lime. */
  markFill?: (point: T) => string | null;
}) {
  const renderTooltip = ({
    active,
    payload,
  }: TooltipContentProps<TooltipValueType, number | string>) => {
    const point = active ? (payload?.[0]?.payload as T | undefined) : undefined;
    if (!point) return null;
    return (
      <div style={TOOLTIP_STYLE}>
        <div style={{ color: "#7f8a84", fontSize: 10, marginBottom: 2 }}>{point.label}</div>
        {describe(point).map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    );
  };

  // A year of sessions on a phone-width chart: smaller marks, or they merge.
  const radius = data.length > 80 ? 2.25 : data.length > 30 ? 2.75 : 3.5;
  const renderDot = ({ cx, cy, index, payload }: DotItemDotProps) => {
    if (cx == null || cy == null) return null;
    const fill = markFill ? markFill(payload as T) : "#c9f24d";
    return (
      <circle
        key={`mark-${index}`}
        cx={cx}
        cy={cy}
        r={radius}
        fill={fill ?? "#101214"}
        stroke="#c9f24d"
        strokeWidth={fill ? 0 : 1.5}
      />
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="#1d2124" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} minTickGap={24} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={AXIS}
          width={44}
          reversed={reversed}
          domain={domain ?? ["auto", "auto"]}
          allowDecimals={false}
        />
        <Tooltip content={renderTooltip} cursor={{ stroke: "#2c3a14" }} />
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke="#c9f24d"
          strokeOpacity={0.55}
          strokeWidth={1.6}
          dot={renderDot}
          activeDot={{ r: 5, fill: "#dcff77", stroke: "#0b0d0e", strokeWidth: 2 }}
          isAnimationActive={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ChartLegend({
  items,
}: {
  items: { name: string; color: string }[];
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-3.5">
      {items.map((item) => (
        <div key={item.name} className="flex items-center gap-1.5">
          <span
            className="h-[3px] w-2.5 rounded-sm"
            style={{ background: item.color }}
          />
          <span className="font-mono text-[10.5px] text-fg-soft uppercase">
            {item.name}
          </span>
        </div>
      ))}
    </div>
  );
}
