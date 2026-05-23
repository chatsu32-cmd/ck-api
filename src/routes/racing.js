const express = require('express');
const { pool } = require('../db/database');
const router  = express.Router();

// ── コース適性データ ─────────────────────────────────────────────

// 過去3年の成績一覧
router.get('/course/results', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT * FROM race_results
    WHERE race_date >= NOW() - INTERVAL '3 years'
    ORDER BY race_date DESC, finish_position ASC
  `);
  res.json(rows);
});

// 1着馬の特徴（前走着順・馬体重・血統）
router.get('/course/winners', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      horse_name, race_date, gate_number, horse_number,
      prev_finish, horse_weight, weight_diff, sire, dam_sire,
      finish_time, track_condition, jockey_name, trainer_name
    FROM race_results
    WHERE finish_position = 1
      AND race_date >= NOW() - INTERVAL '3 years'
    ORDER BY race_date DESC
  `);

  const { rows: [agg] } = await pool.query(`
    SELECT
      ROUND(AVG(prev_finish)::numeric, 1)   AS avg_prev_finish,
      ROUND(AVG(horse_weight)::numeric, 0)  AS avg_horse_weight,
      MIN(horse_weight)                     AS min_horse_weight,
      MAX(horse_weight)                     AS max_horse_weight,
      ROUND(AVG(finish_time_sec)::numeric, 2) AS avg_finish_time_sec
    FROM race_results
    WHERE finish_position = 1
      AND race_date >= NOW() - INTERVAL '3 years'
  `);

  const { rows: sireStats } = await pool.query(`
    SELECT sire, COUNT(*) AS wins
    FROM race_results
    WHERE finish_position = 1
      AND race_date >= NOW() - INTERVAL '3 years'
      AND sire IS NOT NULL
    GROUP BY sire ORDER BY wins DESC LIMIT 10
  `);

  res.json({ winners: rows, aggregate: agg, top_sires: sireStats });
});

// 枠・馬番別の勝率
router.get('/course/gate-stats', async (req, res) => {
  const { rows: gateStats } = await pool.query(`
    SELECT
      gate_number,
      COUNT(*)                                            AS total_runs,
      COUNT(*) FILTER (WHERE finish_position = 1)        AS wins,
      COUNT(*) FILTER (WHERE finish_position <= 3)       AS top3,
      ROUND(
        COUNT(*) FILTER (WHERE finish_position = 1)::numeric / NULLIF(COUNT(*),0) * 100,
        1
      ) AS win_rate_pct,
      ROUND(
        COUNT(*) FILTER (WHERE finish_position <= 3)::numeric / NULLIF(COUNT(*),0) * 100,
        1
      ) AS top3_rate_pct
    FROM race_results
    WHERE race_date >= NOW() - INTERVAL '3 years'
    GROUP BY gate_number ORDER BY gate_number
  `);

  const { rows: horseNumStats } = await pool.query(`
    SELECT
      horse_number,
      COUNT(*)                                            AS total_runs,
      COUNT(*) FILTER (WHERE finish_position = 1)        AS wins,
      ROUND(
        COUNT(*) FILTER (WHERE finish_position = 1)::numeric / NULLIF(COUNT(*),0) * 100,
        1
      ) AS win_rate_pct
    FROM race_results
    WHERE race_date >= NOW() - INTERVAL '3 years'
    GROUP BY horse_number ORDER BY horse_number
  `);

  res.json({ by_gate: gateStats, by_horse_number: horseNumStats });
});

// 速いタイムを出した馬の条件
router.get('/course/fast-times', async (req, res) => {
  const { limit = 20 } = req.query;
  const { rows } = await pool.query(`
    SELECT
      horse_name, race_date, finish_time, finish_time_sec,
      track_condition, gate_number, horse_number,
      sire, dam_sire, jockey_name, horse_weight
    FROM race_results
    WHERE finish_time_sec IS NOT NULL
      AND race_date >= NOW() - INTERVAL '3 years'
    ORDER BY finish_time_sec ASC
    LIMIT $1
  `, [Math.min(Number(limit), 100)]);

  const { rows: condStats } = await pool.query(`
    SELECT
      track_condition,
      ROUND(AVG(finish_time_sec)::numeric, 2) AS avg_time_sec,
      MIN(finish_time_sec)                    AS best_time_sec,
      COUNT(*)                                AS sample_count
    FROM race_results
    WHERE finish_time_sec IS NOT NULL
      AND race_date >= NOW() - INTERVAL '3 years'
    GROUP BY track_condition ORDER BY avg_time_sec ASC
  `);

  res.json({ top_times: rows, by_condition: condStats });
});

// ── 騎手・調教師成績 ────────────────────────────────────────────

// 騎手成績（京都芝2200m）
router.get('/jockeys', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      jockey_name,
      COUNT(*)                                            AS total_rides,
      COUNT(*) FILTER (WHERE finish_position = 1)        AS wins,
      COUNT(*) FILTER (WHERE finish_position <= 2)       AS top2,
      COUNT(*) FILTER (WHERE finish_position <= 3)       AS top3,
      ROUND(
        COUNT(*) FILTER (WHERE finish_position = 1)::numeric / NULLIF(COUNT(*),0) * 100,
        1
      ) AS win_rate_pct,
      ROUND(
        COUNT(*) FILTER (WHERE finish_position <= 3)::numeric / NULLIF(COUNT(*),0) * 100,
        1
      ) AS top3_rate_pct,
      ROUND(AVG(finish_time_sec)::numeric, 2) AS avg_time_sec
    FROM race_results
    WHERE jockey_name IS NOT NULL
      AND race_date >= NOW() - INTERVAL '3 years'
    GROUP BY jockey_name
    ORDER BY win_rate_pct DESC NULLS LAST, total_rides DESC
  `);
  res.json(rows);
});

// 調教師成績
router.get('/trainers', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      trainer_name,
      COUNT(*)                                            AS total_entries,
      COUNT(*) FILTER (WHERE finish_position = 1)        AS wins,
      COUNT(*) FILTER (WHERE finish_position <= 3)       AS top3,
      ROUND(
        COUNT(*) FILTER (WHERE finish_position = 1)::numeric / NULLIF(COUNT(*),0) * 100,
        1
      ) AS win_rate_pct,
      ROUND(
        COUNT(*) FILTER (WHERE finish_position <= 3)::numeric / NULLIF(COUNT(*),0) * 100,
        1
      ) AS top3_rate_pct
    FROM race_results
    WHERE trainer_name IS NOT NULL
      AND race_date >= NOW() - INTERVAL '3 years'
    GROUP BY trainer_name
    ORDER BY wins DESC, win_rate_pct DESC NULLS LAST
  `);
  res.json(rows);
});

// 馬主別成績（相性の良い馬主）
router.get('/owners', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      owner_name,
      COUNT(*)                                            AS total_entries,
      COUNT(*) FILTER (WHERE finish_position = 1)        AS wins,
      COUNT(*) FILTER (WHERE finish_position <= 3)       AS top3,
      ROUND(
        COUNT(*) FILTER (WHERE finish_position = 1)::numeric / NULLIF(COUNT(*),0) * 100,
        1
      ) AS win_rate_pct
    FROM race_results
    WHERE owner_name IS NOT NULL
      AND race_date >= NOW() - INTERVAL '3 years'
    GROUP BY owner_name
    ORDER BY wins DESC
  `);
  res.json(rows);
});

// ── 馬場データ ────────────────────────────────────────────────

// 馬場状態の一覧
router.get('/track', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT * FROM track_conditions
    ORDER BY condition_date DESC
    LIMIT 30
  `);
  res.json(rows);
});

// 馬場状態別・血統適性（父系ごとの平均着順）
router.get('/track/bloodline-aptitude', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      r.track_condition,
      r.sire,
      COUNT(*)                                          AS runs,
      ROUND(AVG(r.finish_position)::numeric, 2)        AS avg_finish,
      COUNT(*) FILTER (WHERE r.finish_position = 1)    AS wins,
      ROUND(
        COUNT(*) FILTER (WHERE r.finish_position = 1)::numeric / NULLIF(COUNT(*),0) * 100,
        1
      ) AS win_rate_pct
    FROM race_results r
    WHERE r.sire IS NOT NULL
      AND r.track_condition IS NOT NULL
      AND r.race_date >= NOW() - INTERVAL '3 years'
    GROUP BY r.track_condition, r.sire
    HAVING COUNT(*) >= 2
    ORDER BY r.track_condition, win_rate_pct DESC
  `);
  res.json(rows);
});

// 馬場状態別の集計サマリ
router.get('/track/summary', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      track_condition,
      COUNT(*)                                          AS total_races,
      ROUND(AVG(finish_time_sec)::numeric, 2)          AS avg_time_sec,
      MIN(finish_time_sec)                             AS best_time_sec,
      ROUND(AVG(horse_weight)::numeric, 0)             AS avg_horse_weight
    FROM race_results
    WHERE track_condition IS NOT NULL
      AND race_date >= NOW() - INTERVAL '3 years'
    GROUP BY track_condition
    ORDER BY avg_time_sec ASC NULLS LAST
  `);
  res.json(rows);
});

// ── データ登録エンドポイント ────────────────────────────────────

// レース結果登録
router.post('/results', async (req, res) => {
  const {
    race_date, race_name, gate_number, horse_number, horse_name,
    finish_position, prev_finish, horse_weight, weight_diff,
    sire, dam_sire, finish_time, finish_time_sec,
    track_condition, jockey_name, trainer_name, owner_name
  } = req.body;

  if (!race_date || !horse_name) {
    return res.status(400).json({ error: 'race_date と horse_name は必須です' });
  }

  const { rows: [row] } = await pool.query(`
    INSERT INTO race_results (
      race_date, race_name, gate_number, horse_number, horse_name,
      finish_position, prev_finish, horse_weight, weight_diff,
      sire, dam_sire, finish_time, finish_time_sec,
      track_condition, jockey_name, trainer_name, owner_name
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    RETURNING *
  `, [
    race_date, race_name || null, gate_number || null, horse_number || null, horse_name,
    finish_position || null, prev_finish || null, horse_weight || null, weight_diff || null,
    sire || null, dam_sire || null, finish_time || null, finish_time_sec || null,
    track_condition || null, jockey_name || null, trainer_name || null, owner_name || null
  ]);

  res.status(201).json(row);
});

// 馬場状態登録
router.post('/track', async (req, res) => {
  const { condition_date, turf_condition, weather, prev_day_weather } = req.body;
  if (!condition_date || !turf_condition) {
    return res.status(400).json({ error: 'condition_date と turf_condition は必須です' });
  }
  const { rows: [row] } = await pool.query(`
    INSERT INTO track_conditions (condition_date, turf_condition, weather, prev_day_weather)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (condition_date) DO UPDATE
      SET turf_condition = EXCLUDED.turf_condition,
          weather = EXCLUDED.weather,
          prev_day_weather = EXCLUDED.prev_day_weather
    RETURNING *
  `, [condition_date, turf_condition, weather || null, prev_day_weather || null]);
  res.status(201).json(row);
});

// 一括インポート（複数レース結果）
router.post('/results/bulk', async (req, res) => {
  const { results } = req.body;
  if (!Array.isArray(results) || results.length === 0) {
    return res.status(400).json({ error: 'results 配列が必要です' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = [];
    for (const r of results) {
      const { rows: [row] } = await client.query(`
        INSERT INTO race_results (
          race_date, race_name, gate_number, horse_number, horse_name,
          finish_position, prev_finish, horse_weight, weight_diff,
          sire, dam_sire, finish_time, finish_time_sec,
          track_condition, jockey_name, trainer_name, owner_name
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        RETURNING id
      `, [
        r.race_date, r.race_name || null, r.gate_number || null, r.horse_number || null,
        r.horse_name, r.finish_position || null, r.prev_finish || null,
        r.horse_weight || null, r.weight_diff || null, r.sire || null, r.dam_sire || null,
        r.finish_time || null, r.finish_time_sec || null, r.track_condition || null,
        r.jockey_name || null, r.trainer_name || null, r.owner_name || null
      ]);
      inserted.push(row.id);
    }
    await client.query('COMMIT');
    res.status(201).json({ inserted_count: inserted.length, ids: inserted });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
