// Mirrors the chart tokens in tokens.css so recharts and three.js (attribute values) get resolved colours.
// Brand rule: Primewave violet is the highlight series (slot 0), cyan the second; the rest are ink steps.
// Slots 4 and 5 (teal, violet) exist for rare cases with more than four series; avoid them where possible.
export type ThemeName = 'light' | 'dark';

export interface ChartTokens {
  series: string[];
  grid: string;
  axis: string;
  baseline: string;
  surface: string;
  text: string;
  textMuted: string;
  seq: string[];
  success: string;
  warning: string;
  danger: string;
  info: string;
  target: string;
  /** Machine / device state colours used by the floor, cameras and tables. */
  state: { inUse: string; idle: string; cooling: string; offline: string };
}

export const chartTokens: Record<ThemeName, ChartTokens> = {
  dark: {
    series: ['#8b5cf6', '#21c3d6', '#e9e6f2', '#6a6577', '#3b86df', '#f5a623'],
    grid: '#1f1a30',
    axis: '#9891ad',
    baseline: '#3a3450',
    surface: '#151024',
    text: '#ffffff',
    textMuted: '#c7c2d6',
    seq: ['#1c1830', '#271d4a', '#352470', '#462d96', '#5a39bb', '#7042eb', '#9b7af2', '#c9b6fb'],
    success: '#3aa874',
    warning: '#f5a623',
    danger: '#e5484d',
    info: '#3b86df',
    target: '#ffffff',
    state: { inUse: '#8b5cf6', idle: '#5d5867', cooling: '#21c3d6', offline: '#e5484d' },
  },
  light: {
    series: ['#7c3aed', '#0e8fae', '#241f30', '#b9b4c4', '#3b86df', '#d98a1a'],
    grid: '#eeecf4',
    axis: '#6a6577',
    baseline: '#dcd8e6',
    surface: '#ffffff',
    text: '#241f30',
    textMuted: '#4a4657',
    seq: ['#f3f0fb', '#e2d8fc', '#cbb8f9', '#ae92f5', '#9168f0', '#7c3aed', '#5b24c2', '#3b1886'],
    success: '#2f8f62',
    warning: '#d98a1a',
    danger: '#e5484d',
    info: '#3b86df',
    target: '#241f30',
    state: { inUse: '#7c3aed', idle: '#b9b4c4', cooling: '#21c3d6', offline: '#e5484d' },
  },
};
