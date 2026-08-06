/**
 * Клиент Supabase для отчёта по задачам.
 *
 * Работает ТОЛЬКО с таблицей ws_task_report. Отдельный от services/supabase.js,
 * чтобы синхронизация отчёта не пересекалась с основной.
 *
 * Пишем под service_role: на ws_task_report есть политика только на SELECT,
 * запись идёт в обход RLS.
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const TABLE = 'ws_task_report';
const UPSERT_BATCH = 500;

let client = null;

function getClient() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error('SUPABASE_URL is required for task-report sync');
  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required for task-report sync ' +
      '(anon key не сможет писать в ws_task_report из-за RLS)'
    );
  }

  client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  return client;
}

/**
 * Записать строки отчёта батчами. Конфликт по ws_task_id → обновление.
 * @param {Array<Object>} rows
 * @returns {Promise<number>} сколько строк записано
 */
async function upsertRows(rows) {
  if (!rows || rows.length === 0) return 0;

  // Дедупликация внутри пачки. Postgres не даёт одному INSERT ... ON CONFLICT
  // тронуть одну и ту же строку дважды — упадёт с «cannot affect row a second
  // time» и уронит весь батч. В дереве Worksection повторов быть не должно,
  // но подстраховаться дешевле, чем ловить это в проде.
  const byId = new Map();
  for (const row of rows) {
    byId.set(row.ws_task_id, row); // последняя запись побеждает
  }

  if (byId.size !== rows.length) {
    logger.warning(`⚠️ В пачке было ${rows.length - byId.size} повторов по ws_task_id — схлопнули`);
  }

  const unique = [...byId.values()];
  const supabase = getClient();
  let written = 0;

  for (let i = 0; i < unique.length; i += UPSERT_BATCH) {
    const batch = unique.slice(i, i + UPSERT_BATCH);

    const { error } = await supabase
      .from(TABLE)
      .upsert(batch, { onConflict: 'ws_task_id' });

    if (error) {
      throw new Error(`Upsert failed (батч ${i}-${i + batch.length}): ${error.message}`);
    }

    written += batch.length;
  }

  return written;
}

/**
 * Удалить строки, не обновлённые текущим прогоном.
 *
 * ⚠️ Вызывать ТОЛЬКО после полного прогона по всем проектам — иначе снесёт
 * задачи проектов, которые в этот раз не обходили.
 *
 * ⚠️ Если прогон был ограничен отделами, чистка тоже ограничивается ими —
 * иначе полный прогон по «КР гражд» удалил бы данные всех остальных отделов.
 *
 * @param {string} startedAtIso - момент старта прогона
 * @param {Array<string>|null} departments - отделы прогона; null = прогон был по всем
 * @returns {Promise<number>} сколько строк удалено
 */
async function deleteStale(startedAtIso, departments = null) {
  const supabase = getClient();

  let query = supabase
    .from(TABLE)
    .delete()
    .lt('synced_at', startedAtIso);

  if (departments && departments.length > 0) {
    query = query.in('department', departments);
  }

  const { data, error } = await query.select('ws_task_id');

  if (error) {
    throw new Error(`Cleanup failed: ${error.message}`);
  }

  const removed = (data || []).length;
  if (removed > 0) {
    logger.info(`🧹 Удалено устаревших строк отчёта: ${removed}`);
  }

  return removed;
}

/**
 * Текущее состояние таблицы: сколько строк и когда обновлялись.
 * @returns {Promise<{rows: number, lastSyncedAt: string|null}>}
 */
async function getState() {
  const supabase = getClient();

  const { count, error: countError } = await supabase
    .from(TABLE)
    .select('ws_task_id', { count: 'exact', head: true });

  if (countError) {
    throw new Error(`Count failed: ${countError.message}`);
  }

  const { data, error: lastError } = await supabase
    .from(TABLE)
    .select('synced_at')
    .order('synced_at', { ascending: false })
    .limit(1);

  if (lastError) {
    throw new Error(`Last sync lookup failed: ${lastError.message}`);
  }

  return {
    rows: count || 0,
    lastSyncedAt: data && data.length > 0 ? data[0].synced_at : null
  };
}

module.exports = { upsertRows, deleteStale, getState };
