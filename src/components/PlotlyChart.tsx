import { useEffect, useRef } from 'react';
import Plotly from 'plotly.js-basic-dist-min';
import { useTheme } from '../theme';

interface PlotlyChartProps {
  data: Plotly.Data[];
  layout?: Partial<Plotly.Layout>;
  className?: string;
  height?: number;
}

export function PlotlyChart({ data, layout, className = '', height = 280 }: PlotlyChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [theme] = useTheme();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const styles = getComputedStyle(document.documentElement);
    const chartText = styles.getPropertyValue('--sr-chart-text').trim() || '#242824';
    const chartGrid = styles.getPropertyValue('--sr-chart-grid').trim() || '#E6E9E2';

    const mergedLayout: Partial<Plotly.Layout> = {
      autosize: true,
      height,
      margin: { t: 24, r: 16, b: 44, l: 48 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: {
        family: 'DM Sans, sans-serif',
        color: chartText,
        size: 12,
      },
      ...layout,
      xaxis: {
        gridcolor: chartGrid,
        zerolinecolor: chartGrid,
        ...layout?.xaxis,
      },
      yaxis: {
        gridcolor: chartGrid,
        zerolinecolor: chartGrid,
        ...layout?.yaxis,
      },
    };

    Plotly.react(el, data, mergedLayout, {
      responsive: true,
      displayModeBar: false,
    });

    const handleResize = () => {
      if (containerRef.current) {
        Plotly.Plots.resize(containerRef.current);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (containerRef.current) {
        Plotly.purge(containerRef.current);
      }
    };
  }, [data, layout, height, theme]);

  return <div ref={containerRef} className={`w-full ${className}`} />;
}
