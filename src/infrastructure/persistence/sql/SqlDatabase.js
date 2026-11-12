import sql from 'mssql';
import { SEED_SERVICES } from '../seed.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Conecta no Azure SQL Database. O banco serverless gratuito pausa quando fica ocioso
 * e leva até ~1 minuto para voltar, por isso a conexão é tentada algumas vezes.
 */
export async function connectSql(connectionString, { attempts = 6, delayMs = 10000 } = {}) {
  let lastError;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const pool = new sql.ConnectionPool(connectionString);
      await pool.connect();
      return pool;
    } catch (err) {
      lastError = err;
      console.warn(`[ms-appointments] conexão com o Azure SQL falhou (tentativa ${i}/${attempts}): ${err.message}`);
      if (i < attempts) await sleep(delayMs);
    }
  }
  throw lastError;
}

// Migração idempotente: cria as tabelas na primeira execução e grava a tabela de serviços.
const SCHEMA = [
  `IF OBJECT_ID('dbo.service', 'U') IS NULL
   CREATE TABLE dbo.service (
     id            NVARCHAR(40)  NOT NULL PRIMARY KEY,
     name          NVARCHAR(80)  NOT NULL CONSTRAINT service_name_unique UNIQUE,
     price_cents   INT           NOT NULL CONSTRAINT service_price_positive CHECK (price_cents > 0),
     duration_min  INT           NOT NULL CONSTRAINT service_duration_range CHECK (duration_min BETWEEN 10 AND 240),
     active        BIT           NOT NULL DEFAULT 1
   )`,
  `IF OBJECT_ID('dbo.appointment', 'U') IS NULL
   CREATE TABLE dbo.appointment (
     id             NVARCHAR(36)  NOT NULL PRIMARY KEY,
     pet_id         NVARCHAR(64)  NOT NULL,
     pet_name       NVARCHAR(60)  NOT NULL,
     tutor_email    NVARCHAR(254) NOT NULL,
     vet_name       NVARCHAR(100) NOT NULL,
     service_id     NVARCHAR(40)  NOT NULL CONSTRAINT appointment_service_fk REFERENCES dbo.service(id),
     service_name   NVARCHAR(80)  NOT NULL,
     starts_at      DATETIME2     NOT NULL,
     ends_at        DATETIME2     NOT NULL,
     price_cents    INT           NOT NULL CONSTRAINT appointment_price_positive CHECK (price_cents > 0),
     status         NVARCHAR(20)  NOT NULL CONSTRAINT appointment_status_valid
                      CHECK (status IN ('SCHEDULED', 'CONFIRMED', 'CANCELLED', 'COMPLETED')),
     notes          NVARCHAR(500) NULL,
     cancel_reason  NVARCHAR(300) NULL,
     created_at     DATETIME2     NOT NULL,
     updated_at     DATETIME2     NOT NULL,
     CONSTRAINT appointment_time_order CHECK (ends_at > starts_at),
     CONSTRAINT appointment_cancel_has_reason CHECK (status <> 'CANCELLED' OR cancel_reason IS NOT NULL)
   )`,
  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'appointment_one_active_per_vet_start')
   CREATE UNIQUE INDEX appointment_one_active_per_vet_start
     ON dbo.appointment (vet_name, starts_at) WHERE status IN ('SCHEDULED', 'CONFIRMED')`,
  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'appointment_starts_at')
   CREATE INDEX appointment_starts_at ON dbo.appointment (starts_at)`,
  `IF OBJECT_ID('dbo.outbox_event', 'U') IS NULL
   CREATE TABLE dbo.outbox_event (
     id           NVARCHAR(36)  NOT NULL PRIMARY KEY,
     type         NVARCHAR(60)  NOT NULL,
     payload      NVARCHAR(MAX) NOT NULL,
     occurred_at  DATETIME2     NOT NULL,
     sent_at      DATETIME2     NULL,
     attempts     INT           NOT NULL DEFAULT 0,
     last_error   NVARCHAR(500) NULL
   )`,
  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'outbox_pending')
   CREATE INDEX outbox_pending ON dbo.outbox_event (sent_at, occurred_at)`
];

export async function ensureSchema(pool) {
  for (const statement of SCHEMA) await pool.request().batch(statement);
  for (const s of SEED_SERVICES) {
    await pool.request()
      .input('id', sql.NVarChar(40), s.id)
      .input('name', sql.NVarChar(80), s.name)
      .input('price', sql.Int, s.priceCents)
      .input('duration', sql.Int, s.durationMin)
      .query(`IF NOT EXISTS (SELECT 1 FROM dbo.service WHERE id = @id)
              INSERT INTO dbo.service (id, name, price_cents, duration_min, active) VALUES (@id, @name, @price, @duration, 1)`);
  }
}
