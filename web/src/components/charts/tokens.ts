// Chart colours (light surface). Categorical slots are the validated default order — keep it fixed;
// slots 3 and 4 sit below 3:1 on white, so every chart using them shows direct labels.
export const CHART = {
  single: "#2e8b57",
  series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"],
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  muted: "#898781",
} as const;
