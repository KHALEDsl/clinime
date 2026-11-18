// Per-staff draft storage for the local Maeen preview.
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function problem(status, message) {
  return Object.assign(new Error(message), { status });
}

function requiredText(value, limit) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > limit || value.includes('\0')) {
    throw problem(400, 'بيانات المسودة غير مكتملة أو أطول من المسموح.');
  }
  return value.trim();
}

function intentFingerprint(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) {
    throw problem(400, 'تعذّر التحقق من هوية الطلب.');
  }
  return 'intent:' + value.toLowerCase();
}

function optionalDate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(value + 'T00:00:00.000Z');
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value) return value;
  }
  throw problem(400, 'تاريخ المسودة غير صالح.');
}

function normalize(input) {
  if (!input || typeof input !== 'object') throw problem(400, 'بيانات المسودة مطلوبة.');
  const id = input.id == null ? null : requiredText(input.id, 128);
  const revision = input.revision ?? 0;
  if (!Number.isSafeInteger(revision) || (id ? revision < 1 : revision !== 0)) {
    throw problem(400, 'رقم نسخة المسودة غير صالح.');
  }
  return {
    requestId: requiredText(input.requestId, 128),
    id,
    revision,
    serviceId: requiredText(input.serviceId, 256),
    serviceName: requiredText(input.serviceName, 512),
    format: requiredText(input.format, 80),
    text: requiredText(input.text, 12000),
    targetDate: optionalDate(input.targetDate),
  };
}

export function openDraftStore(path) {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    closeSync(openSync(path, 'a', 0o600));
  }
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, revision INTEGER NOT NULL,
      serviceId TEXT NOT NULL, serviceName TEXT NOT NULL, format TEXT NOT NULL,
      text TEXT NOT NULL, targetDate TEXT, updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS draft_list ON drafts(owner, updatedAt DESC);
    CREATE TABLE IF NOT EXISTS draft_requests (
      owner TEXT NOT NULL, requestId TEXT NOT NULL, fingerprint TEXT NOT NULL,
      result TEXT NOT NULL, PRIMARY KEY(owner, requestId)
    );
  `);
  const fields = 'id, revision, serviceId, serviceName, format, text, targetDate, updatedAt';
  const byOwner = db.prepare('SELECT ' + fields + ' FROM drafts WHERE owner=? ORDER BY updatedAt DESC, rowid DESC');
  const byId = db.prepare('SELECT ' + fields + ' FROM drafts WHERE owner=? AND id=?');
  const request = db.prepare('SELECT fingerprint, result FROM draft_requests WHERE owner=? AND requestId=?');
  const remember = db.prepare('INSERT INTO draft_requests(owner, requestId, fingerprint, result) VALUES(?,?,?,?)');
  const insert = db.prepare('INSERT INTO drafts(id,owner,revision,serviceId,serviceName,format,text,targetDate,updatedAt) VALUES(?,?,1,?,?,?,?,?,?)');
  const update = db.prepare('UPDATE drafts SET revision=revision+1,serviceId=?,serviceName=?,format=?,text=?,targetDate=?,updatedAt=? WHERE owner=? AND id=? AND revision=?');

  function get(owner, id) {
    const draft = byId.get(requiredText(owner, 320), requiredText(id, 128));
    if (!draft) throw problem(404, 'ما لقينا المسودة في حسابك.');
    return { ...draft };
  }

  function retained(owner, requestId, fingerprint) {
    const previous = request.get(owner, requestId);
    if (previous && previous.fingerprint !== fingerprint) {
      throw problem(409, 'سبق استخدام رقم الطلب لحفظ تعديل مختلف.');
    }
    return previous ? JSON.parse(previous.result) : null;
  }

  // Let the chat endpoint return a committed turn before re-running generation,
  // even if the model is offline or another editor has since changed the draft.
  function replay(owner, requestId, fingerprint) {
    return retained(requiredText(owner, 320), requiredText(requestId, 128), intentFingerprint(fingerprint));
  }

  function save(ownerInput, input) {
    const owner = requiredText(ownerInput, 320);
    const { requestId, ...draft } = normalize(input);
    const fingerprint = input.fingerprint === undefined
      ? 'payload:' + createHash('sha256').update(JSON.stringify(draft)).digest('hex')
      : intentFingerprint(input.fingerprint);
    db.exec('BEGIN IMMEDIATE');
    try {
      const previous = retained(owner, requestId, fingerprint);
      if (previous) {
        db.exec('COMMIT');
        return previous;
      }

      const id = draft.id ?? randomUUID();
      const fields = [draft.serviceId, draft.serviceName, draft.format, draft.text, draft.targetDate, new Date().toISOString()];
      if (draft.id) {
        get(owner, id);
        if (update.run(...fields, owner, id, draft.revision).changes !== 1) {
          throw problem(409, 'تعدّلت المسودة في مكان آخر. افتح آخر نسخة قبل حفظ تعديلك.');
        }
      } else {
        insert.run(id, owner, ...fields);
      }
      const saved = get(owner, id);
      remember.run(owner, requestId, fingerprint, JSON.stringify(saved));
      db.exec('COMMIT');
      return saved;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    list: owner => byOwner.all(requiredText(owner, 320)).map(row => ({ ...row })),
    get, save, replay, close: () => db.close(),
  };
}
