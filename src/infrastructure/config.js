// Configuração por variáveis de ambiente.
export function loadConfig(env = process.env) {
  const config = {
    serviceName: 'vetflow-ms-appointments',
    port: Number(env.PORT || 3002),
    nodeEnv: env.NODE_ENV || 'development',
    sqlConnectionString: env.SQL_CONNECTION_STRING || '',
    serviceBusConnection: env.SERVICEBUS_CONNECTION || '',
    serviceBusEntity: env.SERVICEBUS_QUEUE || 'vetflow-eventos',
    eventsHttpUrl: env.EVENTS_HTTP_URL || '',
    outboxIntervalMs: Number(env.OUTBOX_INTERVAL_MS || 5000),
    corsOrigin: env.CORS_ORIGIN || '*'
  };
  config.dbMode = config.sqlConnectionString ? 'sql' : 'memory';
  config.eventsMode = config.serviceBusConnection ? 'servicebus' : config.eventsHttpUrl ? 'http' : 'log';

  if (config.nodeEnv === 'production' && config.dbMode !== 'sql') {
    throw new Error('SQL_CONNECTION_STRING é obrigatório quando NODE_ENV=production');
  }
  return config;
}
