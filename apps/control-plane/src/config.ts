export interface AppConfig {
  port: number;
  databaseUrl: string;
  sessionSecret: string;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.CONTROL_PLANE_PORT ?? 4000),
    databaseUrl: process.env.DATABASE_URL ?? '',
    sessionSecret: process.env.CONTROL_PLANE_SESSION_SECRET ?? 'dev_session_secret_change_me',
  };
}
