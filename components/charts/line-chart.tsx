"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
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
}: {
  data: SeriesPoint[];
  dataKey: string;
  height?: number;
  unit?: string;
  domainPadding?: number;
}) {
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
            (min: number) => Math.floor(min - domainPadding),
            (max: number) => Math.ceil(max + domainPadding),
          ]}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: "#7f8a84", fontSize: 10 }}
          formatter={(value) => [`${value ?? "—"}${unit ? ` ${unit}` : ""}`, ""]}
          cursor={{ stroke: "#2c3a14" }}
        />
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
