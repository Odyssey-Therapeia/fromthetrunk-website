export function shouldExposeApiDocs(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" || env.FTT_ENABLE_API_DOCS === "true";
}
