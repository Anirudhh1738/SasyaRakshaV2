/// <reference types="vite/client" />

declare module 'plotly.js-basic-dist-min' {
  import type { Data, Layout, Config } from 'plotly.js';
  const Plotly: {
    react: (root: HTMLElement, data: Data[], layout?: Partial<Layout>, config?: Partial<Config>) => Promise<HTMLElement>;
    purge: (root: HTMLElement) => void;
    Plots: {
      resize: (root: HTMLElement) => void;
    };
  };
  export default Plotly;
}
