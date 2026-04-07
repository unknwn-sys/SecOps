export const ENV = {
  // OAuth (optional - for backward compatibility)
  appId: process.env.VITE_APP_ID ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  
  // Local authentication
  adminUsername: process.env.ADMIN_USERNAME ?? "admin",
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH ?? "", // bcrypt hash
  jwtSecret: process.env.JWT_SECRET ?? "your-secret-key-change-in-production",
  cookieSecret: process.env.JWT_SECRET ?? "your-secret-key-change-in-production",
  
  // Database & Environment
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
