export interface AppConfig {
  port: number;
  databaseUrl: string;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.CONTROL_PLANE_PORT ?? 4000),
    databaseUrl: process.env.DATABASE_URL ?? '',
  };
}
