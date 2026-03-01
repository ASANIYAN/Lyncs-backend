export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
  redis: {
    url: process.env.REDIS_URL,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiry: parseInt(process.env.JWT_ACCESS_EXPIRY || '1800', 10),
    refreshExpiry: parseInt(process.env.JWT_REFRESH_EXPIRY || '604800', 10),
  },
  safety: {
    googleSafeBrowsingApiKey: process.env.GOOGLE_SAFE_BROWSING_API_KEY,
  },
});
