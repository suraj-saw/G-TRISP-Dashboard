// frontend/src/components/dashboard/statistical_analysis/StackedBarChartCard.tsx

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { ChartCard, CustomTooltip, EmptyState, GRID, MUTED } from "./common";

interface StackedBarChartCardProps {
  title: string;
  data: Record<string, any>[];
  keys?: string[];
  colors: string[];
  className?: string;
  yAxisWidth?: number;
  layout?: "horizontal" | "vertical";
  fullLabels?: boolean;
  height?: number;
}

export const StackedBarChartCard: React.FC<StackedBarChartCardProps> = ({
  title,
  data,
  keys,
  colors,
  className = "",
  yAxisWidth = 140,
  layout = "vertical",
  fullLabels = false,
  height = 280,
}) => {
  if (!data || data.length === 0) {
    return (
      <ChartCard title={title} className={className}>
        <EmptyState />
      </ChartCard>
    );
  }

  const actualKeys =
    keys && keys.length > 0
      ? keys
      : Array.from(new Set(data.flatMap((d) => Object.keys(d).filter((k) => k !== "name"))));

  return (
    <ChartCard title={title} className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout={layout}
          margin={{ top: 10, right: 10, left: 5, bottom: 5 }}
          barCategoryGap="20%"
        >
          <CartesianGrid
            stroke={GRID}
            horizontal={layout === "vertical"}
            vertical={layout === "horizontal"}
            strokeDasharray="3 3"
            opacity={0.4}
          />
          {layout === "vertical" ? (
            <>
              <XAxis type="number" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                dataKey="name"
                type="category"
                tick={{ fill: MUTED, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={fullLabels ? 140 : yAxisWidth}
                interval={0}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey="name"
                type="category"
                tick={{ fill: MUTED, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <YAxis type="number" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
            </>
          )}
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, color: MUTED, paddingTop: "10px" }}
            iconType="circle"
            iconSize={8}
          />
          {actualKeys.map((k, i) => (
            <Bar key={k} dataKey={k} stackId="a" fill={colors[i % colors.length]} maxBarSize={24} isAnimationActive={!fullLabels}>
              {fullLabels && (
                <LabelList
                  dataKey={k}
                  position="inside"
                  content={(props: any) => {
                    const { x, y, width, height, value } = props;
                    if (!value || value <= 0) return null;
                    const minDim = layout === "vertical" ? width : height;
                    if (minDim < 30) return null;
                    return (
                      <text
                        x={x + width / 2}
                        y={y + height / 2}
                        textAnchor="middle"
                        dominantBaseline="central"
                        style={{ fill: "#FFFFFF", fontSize: 9, fontWeight: 700 }}
                      >
                        {Number(value).toLocaleString()}
                      </text>
                    );
                  }}
                />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};
