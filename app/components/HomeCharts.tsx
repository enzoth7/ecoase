import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type DeliveryChartPoint = { date: string; label: string; count: number };
export type StockChartPoint = { label: string; count: number; color: string };
export type OrderStatusChartPoint = { label: string; count: number; color: string };

const axisStyle = { fill: "#566571", fontSize: 12 };

export function DeliveryLineChart({ data }: { data: DeliveryChartPoint[] }) {
  return <div className="home-chart-plot" role="img" aria-label={`Entregas previstas por día: ${data.map(({ label, count }) => `${label}, ${count}`).join("; ")}`}>
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: -12 }}>
        <CartesianGrid vertical={false} stroke="#E4E9ED" />
        <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} interval={0} />
        <YAxis allowDecimals={false} tick={axisStyle} tickLine={false} axisLine={false} width={34} domain={[0, (max: number) => Math.max(1, max)]} />
        <Tooltip formatter={(value) => [`${value} pedidos`, "Entregas"]} contentStyle={{ borderRadius: 10, borderColor: "#DBE1E6", fontSize: 13 }} />
        <Line type="linear" dataKey="count" stroke="#B58900" strokeWidth={3} dot={{ r: 4, fill: "#FFCA08", stroke: "#41515E", strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>;
}

export function StockBarsChart({ data }: { data: StockChartPoint[] }) {
  return <div className="home-chart-plot" role="img" aria-label={`Unidades de stock por estado: ${data.map(({ label, count }) => `${label}, ${count}`).join("; ")}`}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 0, left: 0 }}>
        <CartesianGrid horizontal={false} stroke="#E4E9ED" />
        <XAxis type="number" hide domain={[0, (max: number) => Math.max(1, Math.ceil(max * 1.15))]} />
        <YAxis type="category" dataKey="label" width={128} tick={axisStyle} tickLine={false} axisLine={false} />
        <Tooltip formatter={(value) => [`${value} unidades`, "Stock"]} contentStyle={{ borderRadius: 10, borderColor: "#DBE1E6", fontSize: 13 }} />
        <Bar dataKey="count" radius={[0, 5, 5, 0]} maxBarSize={26} isAnimationActive={false}>
          {data.map(({ label, color }) => <Cell key={label} fill={color} />)}
          <LabelList dataKey="count" position="right" fill="#26343E" fontSize={12} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>;
}

export function OrderStatusDonutChart({ data }: { data: OrderStatusChartPoint[] }) {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  return <div className="home-status-chart">
    <div className="home-status-plot" role="img" aria-label={`Pedidos activos por estado: ${data.map(({ label, count }) => `${label}, ${count}`).join("; ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="count" nameKey="label" innerRadius="62%" outerRadius="82%" paddingAngle={data.length > 1 ? 3 : 0} stroke="none" isAnimationActive={false}>
            {data.map(({ label, color }) => <Cell key={label} fill={color} />)}
          </Pie>
          <Tooltip formatter={(value, name) => [`${value} pedidos`, name]} contentStyle={{ borderRadius: 10, borderColor: "#DBE1E6", fontSize: 13 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="home-status-total" aria-hidden="true"><strong>{total}</strong><small>activos</small></div>
    </div>
    <ul className="home-status-legend">
      {data.map(({ label, count, color }) => <li key={label}><i style={{ backgroundColor: color }} aria-hidden="true" /><span>{label}</span><strong>{count}</strong></li>)}
    </ul>
  </div>;
}
