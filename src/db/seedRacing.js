require('dotenv').config();
const { pool, initRacingDb } = require('./database');

const TRACK_CONDITIONS = ['良', '稍重', '重', '不良'];
const SIRES = [
  'ディープインパクト', 'キングカメハメハ', 'ハーツクライ',
  'ロードカナロア', 'エピファネイア', 'スクリーンヒーロー',
  'オルフェーヴル', 'ゴールドシップ', 'モーリス', 'リオンディーズ'
];
const DAM_SIRES = [
  'サンデーサイレンス', 'スペシャルウィーク', 'フジキセキ',
  'ブライアンズタイム', 'アグネスタキオン', 'メジロマックイーン'
];
const JOCKEYS = [
  '武豊', '川田将雅', 'ルメール', 'デムーロ', '浜中俊',
  '岩田康誠', '岩田望来', '松山弘平', '福永祐一', '和田竜二'
];
const TRAINERS = [
  '藤原英昭', '池江泰寿', '中竹和也', '矢作芳人',
  '角居勝彦', '須貝尚介', '友道康夫', '坂口正則'
];
const OWNERS = [
  '社台レースホース', 'キャロットファーム', 'シルクレーシング',
  'ゴドルフィン', '前田幸治', '山本英俊'
];

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

async function seedRacing() {
  await initRacingDb();

  const existingResults = await pool.query('SELECT COUNT(*) FROM race_results');
  if (parseInt(existingResults.rows[0].count) > 0) {
    console.log('競馬データは既に存在します。スキップします。');
    await pool.end();
    return;
  }

  const raceNames = [
    '京都記念', '日経新春杯', 'チャレンジカップ',
    'アンドロメダステークス', '京都ジャンプステークス'
  ];

  const baseDate = new Date('2023-01-15');
  const trackConditionsData = [];
  const raceDates = [];

  // 過去3年分のレース日（年4〜6レース想定）
  for (let i = 0; i < 18; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i * 60);
    if (d > new Date()) break;
    raceDates.push(d.toISOString().slice(0, 10));
    const cond = rand(TRACK_CONDITIONS);
    const prevWeather = rand(['晴', '曇', '雨', '晴']);
    const weather = prevWeather === '雨'
      ? rand(['雨', '曇'])
      : rand(['晴', '晴', '晴', '曇']);
    trackConditionsData.push({ date: d.toISOString().slice(0, 10), cond, weather, prevWeather });
  }

  // 馬場状態を登録
  for (const t of trackConditionsData) {
    await pool.query(
      `INSERT INTO track_conditions (condition_date, turf_condition, weather, prev_day_weather)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [t.date, t.cond, t.weather, t.prevWeather]
    );
  }

  // レース結果を登録（1レースあたり14〜18頭）
  for (let ri = 0; ri < raceDates.length; ri++) {
    const raceDate  = raceDates[ri];
    const raceName  = rand(raceNames);
    const trackCond = trackConditionsData[ri]?.cond || '良';
    const numHorses = randInt(14, 18);
    const baseTimeSec = trackCond === '良' ? 132.0
      : trackCond === '稍重' ? 133.5
      : trackCond === '重'   ? 135.0
      : 137.0;

    const horses = Array.from({ length: numHorses }, (_, idx) => {
      const gateNumber  = Math.ceil((idx + 1) / 2);
      const horseWeight = randInt(446, 538);
      const weightDiff  = randInt(-10, 12);
      const prevFinish  = randInt(1, 10);
      const sire        = rand(SIRES);
      const bonus = sire === 'ディープインパクト' ? -0.3 : sire === 'ハーツクライ' ? -0.2 : 0;
      const condBonus = trackCond === '良' ? 0 : trackCond === '稍重' ? 0.8 : 1.5;
      const rawTime = baseTimeSec + condBonus + Math.random() * 3 + bonus;
      return {
        gate_number:    gateNumber,
        horse_number:   idx + 1,
        horse_name:     `テスト馬${ri * 18 + idx + 1}`,
        prev_finish:    prevFinish,
        horse_weight:   horseWeight,
        weight_diff:    weightDiff,
        sire,
        dam_sire:       rand(DAM_SIRES),
        finish_time_sec: parseFloat(rawTime.toFixed(1)),
        finish_time:    formatTime(parseFloat(rawTime.toFixed(1))),
        track_condition: trackCond,
        jockey_name:    rand(JOCKEYS),
        trainer_name:   rand(TRAINERS),
        owner_name:     rand(OWNERS),
      };
    });

    // タイムでソートして着順を決める
    horses.sort((a, b) => a.finish_time_sec - b.finish_time_sec);

    for (let pos = 0; pos < horses.length; pos++) {
      const h = horses[pos];
      await pool.query(`
        INSERT INTO race_results (
          race_date, race_name, gate_number, horse_number, horse_name,
          finish_position, prev_finish, horse_weight, weight_diff,
          sire, dam_sire, finish_time, finish_time_sec,
          track_condition, jockey_name, trainer_name, owner_name
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      `, [
        raceDate, raceName, h.gate_number, h.horse_number, h.horse_name,
        pos + 1, h.prev_finish, h.horse_weight, h.weight_diff,
        h.sire, h.dam_sire, h.finish_time, h.finish_time_sec,
        h.track_condition, h.jockey_name, h.trainer_name, h.owner_name
      ]);
    }
    console.log(`✅ ${raceDate} ${raceName} (${numHorses}頭) 登録完了`);
  }

  console.log('\n✅ 競馬サンプルデータ投入完了');
  await pool.end();
}

seedRacing().catch(err => {
  console.error('シード失敗:', err);
  process.exit(1);
});
