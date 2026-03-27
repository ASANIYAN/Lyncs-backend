export type RateLimitDimension = 'ip' | 'user' | 'email';

export type RateLimitPolicy = {
  name: string;
  windowSeconds: number;
  maxRequests: number;
  dimensions: RateLimitDimension[];
};

export const RATE_LIMIT_PROFILES = {
  GLOBAL_DEFAULT: {
    name: 'global_default',
    windowSeconds: 60,
    maxRequests: 120,
    dimensions: ['ip'],
  },
  SYSTEM_HEALTH: {
    name: 'system_health',
    windowSeconds: 60,
    maxRequests: 120,
    dimensions: ['ip'],
  },
  REDIRECT_PUBLIC: {
    name: 'redirect_public',
    windowSeconds: 60,
    maxRequests: 600,
    dimensions: ['ip'],
  },
  AUTH_REGISTER_REQUEST_OTP: {
    name: 'auth_register_request_otp',
    windowSeconds: 600,
    maxRequests: 5,
    dimensions: ['ip', 'email'],
  },
  AUTH_REGISTER_CONFIRM: {
    name: 'auth_register_confirm',
    windowSeconds: 600,
    maxRequests: 5,
    dimensions: ['ip', 'email'],
  },
  AUTH_LOGIN: {
    name: 'auth_login',
    windowSeconds: 600,
    maxRequests: 10,
    dimensions: ['ip', 'email'],
  },
  AUTH_LOGIN_VERIFY_OTP: {
    name: 'auth_login_verify_otp',
    windowSeconds: 600,
    maxRequests: 6,
    dimensions: ['ip', 'email'],
  },
  AUTH_FORGOT_REQUEST_OTP: {
    name: 'auth_forgot_request_otp',
    windowSeconds: 900,
    maxRequests: 3,
    dimensions: ['ip', 'email'],
  },
  AUTH_FORGOT_CONFIRM: {
    name: 'auth_forgot_confirm',
    windowSeconds: 900,
    maxRequests: 5,
    dimensions: ['ip', 'email'],
  },
  AUTH_REFRESH: {
    name: 'auth_refresh',
    windowSeconds: 600,
    maxRequests: 60,
    dimensions: ['ip', 'user'],
  },
  AUTH_LOGOUT: {
    name: 'auth_logout',
    windowSeconds: 60,
    maxRequests: 30,
    dimensions: ['ip', 'user'],
  },
  AUTH_PROFILE_READ: {
    name: 'auth_profile_read',
    windowSeconds: 60,
    maxRequests: 120,
    dimensions: ['ip', 'user'],
  },
  URL_SHORTEN_BURST: {
    name: 'url_shorten_burst',
    windowSeconds: 60,
    maxRequests: 10,
    dimensions: ['ip', 'user'],
  },
  URL_SHORTEN_HOURLY: {
    name: 'url_shorten_hourly',
    windowSeconds: 3600,
    maxRequests: 50,
    dimensions: ['ip', 'user'],
  },
  URL_DASHBOARD_READ: {
    name: 'url_dashboard_read',
    windowSeconds: 60,
    maxRequests: 120,
    dimensions: ['ip', 'user'],
  },
  URL_DELETE: {
    name: 'url_delete',
    windowSeconds: 60,
    maxRequests: 30,
    dimensions: ['ip', 'user'],
  },
  URL_ANALYTICS_READ: {
    name: 'url_analytics_read',
    windowSeconds: 60,
    maxRequests: 120,
    dimensions: ['ip', 'user'],
  },
} as const satisfies Record<string, RateLimitPolicy>;
