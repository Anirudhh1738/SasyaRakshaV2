import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { closePool, getPool, initDatabase, isDatabaseConfigured } from '../server/db.ts';
import { isStorageConfigured, STORAGE_BUCKET, uploadImageBuffer } from '../server/storage.ts';

interface TableMigrationStats {
  table: string;
  migrated: number;
  skipped: number;
  failed: number;
  note?: string;
}

interface TableSpec {
  name: string;
  columns: string[];
  conflictTarget?: string;
  hasIdentity?: boolean;
}

const TABLES_IN_FK_ORDER: TableSpec[] = [
  {
    name: 'users',
    columns: ['id', 'name', 'email', 'password_hash', 'role', 'region', 'preferred_language', 'is_active', 'created_at'],
    conflictTarget: '(id)',
    hasIdentity: true,
  },
  {
    name: 'plants',
    columns: ['id', 'plant_code', 'crop', 'field_label', 'region_label', 'owner_id', 'is_demo', 'created_at'],
    conflictTarget: '(id)',
    hasIdentity: true,
  },
  {
    name: 'weather_records',
    columns: [
      'id',
      'user_id',
      'location_name',
      'latitude',
      'longitude',
      'crop',
      'temperature_c',
      'humidity_pct',
      'rainfall_mm',
      'risk_level',
      'risk_factors_json',
      'time_period',
      'is_demo',
      'recorded_at',
    ],
    conflictTarget: '(id)',
    hasIdentity: true,
  },
  {
    name: 'predictions',
    columns: [
      'id',
      'plant_id',
      'user_id',
      'weather_record_id',
      'crop',
      'predicted_disease',
      'condition_category',
      'confidence',
      'uncertain',
      'uncertainty_reason',
      'alternative_predictions_json',
      'affected_area_pct',
      'severity',
      'leaf_coverage_pct',
      'chlorosis_pct',
      'necrosis_pct',
      'original_image_path',
      'processed_image_path',
      'model_engine',
      'verification_status',
      'verified_crop',
      'verified_disease',
      'region_label',
      'approx_lat',
      'approx_lng',
      'notes',
      'symptoms_json',
      'symptom_onset_value',
      'symptom_onset_unit',
      'image_consistency',
      'consistency_message',
      'user_feedback_status',
      'user_feedback_notes',
      'same_plant_confirmed',
      'recommendations_json',
      'is_demo',
      'created_at',
    ],
    conflictTarget: '(id)',
    hasIdentity: true,
  },
  {
    name: 'screening_images',
    columns: [
      'id',
      'prediction_id',
      'image_role',
      'original_path',
      'processed_path',
      'suitable',
      'rejection_reason',
      'detected_crop',
      'detected_disease',
      'confidence',
      'affected_area_pct',
      'severity',
      'mime_type',
      'file_size_bytes',
      'width',
      'height',
      'created_at',
    ],
    conflictTarget: '(id)',
    hasIdentity: true,
  },
  {
    name: 'soil_records',
    columns: [
      'id',
      'prediction_id',
      'soil_photo_path',
      'observed_color',
      'observed_moisture',
      'observed_texture',
      'observed_surface_signs',
      'soil_disclaimer',
      'manual_moisture',
      'manual_ph',
      'manual_soil_type',
      'manual_fertility',
      'recommendations_json',
      'created_at',
    ],
    conflictTarget: '(id)',
    hasIdentity: true,
  },
  {
    name: 'uploaded_images',
    columns: [
      'id',
      'prediction_id',
      'original_path',
      'processed_path',
      'mime_type',
      'file_size_bytes',
      'width',
      'height',
      'created_at',
    ],
    conflictTarget: '(id)',
    hasIdentity: true,
  },
  {
    name: 'severity_analyses',
    columns: [
      'id',
      'prediction_id',
      'affected_area_pct',
      'severity',
      'leaf_coverage_pct',
      'chlorosis_pct',
      'necrosis_pct',
      'rust_pct',
      'powdery_pct',
      'leaf_pixels',
      'infected_pixels',
      'created_at',
    ],
    conflictTarget: '(id)',
    hasIdentity: true,
  },
  {
    name: 'field_passports',
    columns: [
      'id',
      'passport_code',
      'prediction_id',
      'weather_record_id',
      'share_token',
      'is_public_share',
      'qr_payload',
      'created_at',
    ],
    conflictTarget: '(id)',
    hasIdentity: true,
  },
  {
    name: 'geographical_reports',
    columns: [
      'id',
      'prediction_id',
      'crop',
      'disease',
      'severity',
      'region_label',
      'approx_lat',
      'approx_lng',
      'verified',
      'is_demo',
      'reported_at',
    ],
    conflictTarget: '(id)',
    hasIdentity: true,
  },
  {
    name: 'disease_library',
    columns: [
      'id',
      'crop',
      'disease_name',
      'condition_category',
      'pathogen',
      'simple_summary',
      'symptoms',
      'causes',
      'favorable_conditions',
      'prevention',
      'management',
      'recommended_treatment',
      'pesticide_or_medicine',
      'active_ingredient',
      'application_frequency',
      'treatment_duration',
      'dosage_instructions',
      'safety_precautions',
      'expected_outcome',
      'followup_schedule',
      'reference_source',
      'reference_url',
    ],
    conflictTarget: '(crop, disease_name)',
    hasIdentity: true,
  },
  {
    name: 'treatment_records',
    columns: [
      'id',
      'plant_id',
      'prediction_id',
      'user_id',
      'medicine_name',
      'active_ingredient',
      'dosage_applied',
      'application_date',
      'days_used',
      'observations',
      'notes',
      'created_at',
    ],
    conflictTarget: '(id)',
    hasIdentity: true,
  },
  {
    name: 'progression_entries',
    columns: [
      'id',
      'plant_id',
      'prediction_id',
      'user_id',
      'day_number',
      'treatment_status',
      'medicine_applied',
      'application_date',
      'observed_symptoms',
      'disease_progression',
      'followup_image_path',
      'expected_outcome',
      'actual_outcome',
      'created_at',
      'updated_at',
    ],
    conflictTarget: '(id)',
    hasIdentity: true,
  },
  {
    name: 'expert_corrections',
    columns: [
      'id',
      'prediction_id',
      'reviewer_id',
      'reviewer_name',
      'action',
      'original_crop',
      'original_disease',
      'corrected_crop',
      'corrected_disease',
      'comments',
      'queued_for_retraining',
      'created_at',
    ],
    conflictTarget: '(id)',
    hasIdentity: true,
  },
  {
    name: 'audit_logs',
    columns: ['id', 'actor_id', 'actor_role', 'action', 'target_type', 'target_id', 'details_json', 'created_at'],
    conflictTarget: '(id)',
    hasIdentity: true,
  },
  {
    name: 'model_evaluations',
    columns: [
      'id',
      'model_name',
      'dataset_name',
      'status',
      'accuracy',
      'precision_macro',
      'recall_macro',
      'f1_macro',
      'confusion_matrix_json',
      'classes_json',
      'notes',
      'evaluated_at',
    ],
    conflictTarget: '(id)',
    hasIdentity: true,
  },
];

function parseArgs() {
  const args = process.argv.slice(2);
  let sqlitePath = process.env.AGRIGUARD_DB_PATH || './agriguard.db';
  let uploadsDir = './uploads';
  let uploadImages = false;
  let dryRun = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--sqlite' && args[i + 1]) {
      sqlitePath = args[i + 1];
      i += 1;
    } else if (arg === '--uploads' && args[i + 1]) {
      uploadsDir = args[i + 1];
      i += 1;
    } else if (arg === '--upload-images') {
      uploadImages = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  return {
    sqlitePath: path.resolve(process.cwd(), sqlitePath),
    uploadsDir: path.resolve(process.cwd(), uploadsDir),
    uploadImages,
    dryRun,
  };
}

function getSqliteTableColumns(sqlite: DatabaseSync, tableName: string): Set<string> | null {
  const exists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name?: string } | undefined;
  if (!exists?.name) return null;

  const pragmaRows = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return new Set(pragmaRows.map((r) => r.name));
}

function normalizeCellValue(column: string, value: unknown): unknown {
  if (value === undefined) return null;
  if (
    value !== null &&
    (column === 'created_at' ||
      column === 'updated_at' ||
      column === 'recorded_at' ||
      column === 'reported_at' ||
      column === 'evaluated_at')
  ) {
    const str = String(value).trim();
    if (!str) return new Date().toISOString();
    // Convert SQLite 'YYYY-MM-DD HH:MM:SS' cleanly to UTC ISO string for TIMESTAMPTZ
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(str)) {
      return `${str.replace(' ', 'T')}Z`;
    }
    return str;
  }
  return value;
}

async function migrateImagesToSupabase(uploadsDir: string, dryRun: boolean) {
  const subdirs: Array<'plants' | 'soil' | 'processed'> = ['plants', 'soil', 'processed'];
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  if (!fs.existsSync(uploadsDir)) {
    console.log(`No local uploads directory found at ${uploadsDir}; skipping image upload.`);
    return { uploaded, skipped, failed };
  }

  if (!isStorageConfigured()) {
    console.log(
      'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping image upload to Supabase Storage.'
    );
    return { uploaded, skipped, failed };
  }

  for (const subdir of subdirs) {
    const dirPath = path.join(uploadsDir, subdir);
    if (!fs.existsSync(dirPath)) continue;

    const files = fs.readdirSync(dirPath).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) continue;

      const ext = path.extname(file).toLowerCase();
      const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

      if (dryRun) {
        uploaded += 1;
        continue;
      }

      try {
        await uploadImageBuffer({
          subdir,
          filename: file,
          buffer: fs.readFileSync(fullPath),
          contentType,
        });
        uploaded += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('duplicate')) {
          skipped += 1;
        } else {
          failed += 1;
          console.warn(`  [Image Failed] ${subdir}/${file}: ${msg}`);
        }
      }
    }
  }

  console.log(
    `Supabase Storage (${STORAGE_BUCKET}): uploaded=${uploaded}, skipped_existing=${skipped}, failed=${failed}`
  );
  return { uploaded, skipped, failed };
}

async function main() {
  const { sqlitePath, uploadsDir, uploadImages, dryRun } = parseArgs();

  if (!isDatabaseConfigured()) {
    console.error('Error: DATABASE_URL is not configured. Set your Supabase PostgreSQL connection string in .env.');
    process.exit(1);
  }

  if (!fs.existsSync(sqlitePath)) {
    console.error(`Error: SQLite file not found at ${sqlitePath}`);
    console.error('Pass --sqlite <path/to/agriguard.db> to specify your SQLite backup file.');
    process.exit(1);
  }

  // Create a timestamped safety copy of the SQLite file before reading
  const backupStamp = new Date().toISOString().replace(/[:.]/g, '-');
  const preBackupPath = `${sqlitePath}.pre-migration-${backupStamp}.bak`;
  fs.copyFileSync(sqlitePath, preBackupPath);
  console.log(`Created pre-migration SQLite backup: ${preBackupPath}`);

  if (dryRun) {
    console.log('DRY RUN MODE enabled — no rows or images will be written.');
  } else {
    await initDatabase();
  }

  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
  const pool = getPool();
  const report: TableMigrationStats[] = [];

  for (const spec of TABLES_IN_FK_ORDER) {
    const sqliteCols = getSqliteTableColumns(sqlite, spec.name);
    if (!sqliteCols) {
      report.push({ table: spec.name, migrated: 0, skipped: 0, failed: 0, note: 'not present in SQLite' });
      continue;
    }

    const activeCols = spec.columns.filter((col) => sqliteCols.has(col));
    if (activeCols.length === 0) {
      report.push({ table: spec.name, migrated: 0, skipped: 0, failed: 0, note: 'no matching columns' });
      continue;
    }

    const rows = sqlite.prepare(`SELECT ${activeCols.join(', ')} FROM ${spec.name}`).all() as Array<
      Record<string, unknown>
    >;

    if (dryRun) {
      report.push({ table: spec.name, migrated: rows.length, skipped: 0, failed: 0, note: 'dry-run count' });
      continue;
    }

    let migrated = 0;
    let skipped = 0;
    let failed = 0;

    const placeholders = activeCols.map((_, idx) => `$${idx + 1}`).join(', ');
    const conflictClause = spec.conflictTarget ? `ON CONFLICT ${spec.conflictTarget} DO NOTHING` : 'ON CONFLICT DO NOTHING';
    const insertSql = `INSERT INTO ${spec.name} (${activeCols.join(', ')}) VALUES (${placeholders}) ${conflictClause}`;

    for (const row of rows) {
      const values = activeCols.map((col) => normalizeCellValue(col, row[col]));
      try {
        const res = await pool.query(insertSql, values);
        if ((res.rowCount || 0) > 0) {
          migrated += 1;
        } else {
          skipped += 1;
        }
      } catch (err) {
        failed += 1;
        console.warn(
          `  [Row Error] table=${spec.name} id=${String(row.id ?? '?')}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }

    if (spec.hasIdentity) {
      try {
        await pool.query(
          `SELECT setval(pg_get_serial_sequence('${spec.name}', 'id'), COALESCE((SELECT MAX(id) FROM ${spec.name}), 1), (SELECT COUNT(*) > 0 FROM ${spec.name}))`
        );
      } catch (err) {
        console.warn(`  [Sequence Sync Warning] ${spec.name}:`, err instanceof Error ? err.message : err);
      }
    }

    report.push({ table: spec.name, migrated, skipped, failed });
  }

  sqlite.close();

  console.log('\n=== SQLite -> Supabase PostgreSQL Migration Summary ===');
  for (const item of report) {
    const suffix = item.note ? ` (${item.note})` : '';
    console.log(
      `  ${item.table.padEnd(22)} migrated=${String(item.migrated).padStart(4)}  skipped=${String(item.skipped).padStart(4)}  failed=${String(item.failed).padStart(4)}${suffix}`
    );
  }

  if (uploadImages || isStorageConfigured()) {
    console.log('\n=== Local Uploads -> Supabase Storage ===');
    await migrateImagesToSupabase(uploadsDir, dryRun);
  }
}

main()
  .catch((err) => {
    console.error('Migration failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
