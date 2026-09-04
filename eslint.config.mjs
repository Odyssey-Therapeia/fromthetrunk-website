import coreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "ftt-hr-gmail-workflow/**",
      "public/drape-room/vision/**",
    ],
  },
  ...coreWebVitals,
];

export default config;
