import { randomInt, randomUUID } from 'node:crypto';
import E from './care-point-engine.cjs';
import { ApiError, canonical, hash, invalid, mac, read, token, update, uuid } from './core.mjs';
import { newVisitProgram } from './visit-rewards.mjs';
import { createCarePrizeMail } from './care-prize-mail.mjs';

export const CARE_LEDGER = 'clinic/care-point-v1';
const BOOKING_LEDGER = 'clinic/booking-ledger-v1';
const WEEK_MS = 7 * 86400000, OFFSET = 3 * 3600000;
const iso = value => new Date(value).toISOString();
const conflict = code => { throw new ApiError(409, code); };
const fresh = () => ({ schema: 1, enabled: true, revision: 0, weeks: {}, requests: {}, profiles: {} });

function firstName(value) {
  const bad = () => { throw new ApiError(400, 'NAME_INVALID', 'اكتبي اسمك الأول بحروف فقط، بحد أقصى ٣٠ حرفًا.'); };
  if (typeof value !== 'string' || value.length > 200 || /[\p{C}\p{N}<>@]/u.test(value)) return bad();
  const normalized = value.normalize('NFC').trim().replace(/\p{Zs}+/gu, ' ');
  if (!/^[\p{L}][\p{L}\p{M}]*(?: +[\p{L}][\p{L}\p{M}]*)*$/u.test(normalized)) return bad();
  const chosen = normalized.split(' ')[0];
  if (Array.from(chosen).length > 30) return bad();
  return chosen;
}
function chosenName(ledger, userId) {
  try { return firstName(ledger.profiles?.[userId]?.firstName); } catch { return null; }
}
function suggestedName(user) {
  if (!user || typeof user.name !== 'string') return null;
  try { return firstName(user.name); } catch { return null; }
}

// The calendar is Riyadh Sunday 00:00, independent of host locale or DST.
export function careWeek(time) {
  const local = new Date(time + OFFSET);
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - local.getUTCDay()) - OFFSET;
  return { key: iso(start + OFFSET).slice(0, 10), startsAt: iso(start), endsAt: iso(start + WEEK_MS) };
}
function weekRow(time) { return { ...careWeek(time), players: {}, rounds: {}, frozenAt: null, winnerId: null, tie: null, prize: null }; }
function publicWeek(ledger, week, time) {
  // Financial selection freezes its own audit record; play remains available
  // until the calendar cutoff unless the owner explicitly pauses the game.
  return { key: week.key, startsAt: week.startsAt, endsAt: week.endsAt, status: time >= Date.parse(week.endsAt) ? 'closed' : ledger.enabled ? 'active' : 'paused', prizeSar: 100, pointsPerRound: 100 };
}
function rankings(week, ledger) {
  const rows = Object.entries(week.players).filter(([, p]) => p.points >= 100 && (!week.frozenAt || p.eligible !== false)).map(([userId, p]) => ({ userId, alias: chosenName(ledger, userId), points: p.points }));
  rows.sort((a, b) => b.points - a.points || (a.alias || '').localeCompare(b.alias || ''));
  let rank = 0;
  return rows.map((row, index) => { if (!index || row.points !== rows[index - 1].points) rank = index + 1; return { ...row, rank }; });
}
function safeRows(rows, userId, offset = 0, limit = 50) {
  const named = rows.filter(row => row.alias);
  return { rows: named.slice(offset, offset + limit).map(({ alias, points, rank, userId: id }) => ({ alias, points, rank, isYou: id === userId })), total: rows.length, visibleTotal: named.length };
}
function activeRound(week, userId, time) {
  const player = week.players[userId], round = player?.activeRound && week.rounds[player.activeRound];
  return round && !round.completedAt && time < Date.parse(round.expiresAt) ? round : null;
}
const safeRound = round => round ? { id: round.id, seed: round.seed, expiresAt: round.expiresAt } : null;
function playerReceipt(ledger, userId, requestId) {
  return ledger.requests['play:' + userId + ':' + requestId] || null;
}
function project(ledger, time, userId, page = {}, suggestion = null) {
  const current = careWeek(time), week = ledger.weeks[current.key] || weekRow(time), rows = rankings(week, ledger);
  const value = { week: publicWeek(ledger, week, time), leaderboard: safeRows(rows, userId, page.offset, page.limit) };
  if (userId) {
    const player = week.players[userId], rank = rows.find(row => row.userId === userId)?.rank ?? null;
    const name = chosenName(ledger, userId);
    value.player = { points: player?.points || 0, rank, totalCompetitors: rows.length, roundsCompleted: player?.roundsCompleted || 0, alias: name, eligible: !week.frozenAt || player?.eligible !== false, needsName: !name, suggestedName: suggestion };
    value.round = value.week.status === 'active' ? safeRound(activeRound(week, userId, time)) : null;
    value.lastCompletion = player?.lastCompletion || Object.values(ledger.weeks).sort((a,b)=>b.key.localeCompare(a.key)).find(row=>row.players[userId]?.lastCompletion)?.players[userId].lastCompletion || null;
  }
  return value;
}
function freezeEnded(ledger, time, onlyKey) {
  let changed = false;
  for (const week of Object.values(ledger.weeks)) {
    if (onlyKey && week.key !== onlyKey) continue;
    if (week.frozenAt || time < Date.parse(week.endsAt)) continue;
    const rows = rankings(week, ledger), leaders = rows.filter(row => row.points === rows[0]?.points);
    // The current competition admits every verified account, including owners.
    // Freeze that rule only now; already frozen historical eligibility stays put.
    for (const player of Object.values(week.players)) player.eligible = true;
    week.frozenAt = iso(time);
    week.leaderIds = leaders.map(row => row.userId);
    week.leaderPoints = leaders[0]?.points || 0;
    week.winnerId = leaders.length === 1 ? leaders[0].userId : null;
    week.tie = leaders.length > 1 ? { status: 'pending' } : { status: 'none' };
    changed = true;
  }
  return changed;
}
function bounded(ledger) {
  if (Object.keys(ledger.weeks).length > 104 || Object.keys(ledger.requests).length > 100000 || Object.keys(ledger.profiles || {}).length > 5000 || Buffer.byteLength(JSON.stringify(ledger)) > 8_000_000) throw new ApiError(503, 'CARE_CAPACITY', 'المسابقة غير متاحة مؤقتًا. حاولي لاحقًا.');
  for (const week of Object.values(ledger.weeks)) if (Object.keys(week.players).length > 2000 || Object.keys(week.rounds).length > 20000) throw new ApiError(503, 'CARE_CAPACITY');
}
function commit(ledger, result) { ledger.revision++; bounded(ledger); return { value: ledger, result }; }
function awardFor(week, winnerId) { return !winnerId || winnerId === week?.winnerId ? week : week?.awards?.[winnerId]; }
function adminProject(ledger, time) {
  const weeks = Object.values(ledger.weeks).sort((a, b) => b.key.localeCompare(a.key)).map(week => {
    const rows = rankings(week, ledger), top = rows[0]?.points || 0, leaders = rows.filter(row => row.points === top);
    const winnerName = week.winnerId ? chosenName(ledger, week.winnerId) : null;
    return { ...publicWeek(ledger, week, time), frozenAt: week.frozenAt, selectionMode: week.selectionMode || 'highest-score', selectedAt: week.selectedAt || null, selectedBy: week.selectedBy || null, participantCount: rows.length, totalRounds: Object.values(week.players).filter(p => !week.frozenAt || p.eligible !== false).reduce((sum, p) => sum + p.roundsCompleted, 0), leaderPoints: week.leaderPoints ?? top, leaderCount: week.leaderIds?.length ?? leaders.length, winner: week.winnerId ? { userId: week.winnerId, alias: winnerName, needsName: !winnerName } : null, tie: week.tie || { status: leaders.length > 1 ? 'pending' : 'none' }, prize: week.prize ? { ...week.prize } : { id: 'care-prize:' + week.key, amountSar: 100, status: 'unapproved' } };
  });
  for (const week of weeks) {
    const source = ledger.weeks[week.key];
    week.awards = week.winner ? [{ winner: week.winner, prize: week.prize, selectionMode: week.selectionMode }] : [];
    for (const award of Object.values(source.awards || {})) {
      const name = chosenName(ledger, award.winnerId);
      week.awards.push({ winner: { userId: award.winnerId, alias: name, needsName: !name }, prize: { ...award.prize }, selectionMode: award.selectionMode || 'manual' });
    }
  }
  const current = project(ledger, time), row = weeks.find(week => week.key === current.week.key), activeWeek = ledger.weeks[current.week.key];
  const scoredRanks = new Map((activeWeek ? rankings(activeWeek, ledger) : []).map(player => [player.userId, player.rank]));
  const joined = Object.entries(activeWeek?.players || {}).filter(([, player]) => !activeWeek.frozenAt || player.eligible !== false).map(([userId, player]) => { const name = chosenName(ledger, userId); return { userId, alias: name, needsName: !name, points: player.points, roundsCompleted: player.roundsCompleted, rank: scoredRanks.get(userId) ?? null }; });
  joined.sort((a, b) => b.points - a.points || (a.alias || '').localeCompare(b.alias || ''));
  return { settings: { enabled: ledger.enabled }, revision: ledger.revision, ...current, participantCount: row?.participantCount || 0, totalRounds: row?.totalRounds || 0, joinedCount: joined.length, participants: { rows: joined.slice(0, 50), total: joined.length }, weeks };
}

export function createCarePoint({ store, secret, now = Date.now, mail, origin }) {
  const prizeMail = createCarePrizeMail({ store, mail, secret, origin, now });
  async function snapshot(user, page = {}) {
    const userId = user && typeof user === 'object' ? user.id : user;
    const result = project(await read(store, CARE_LEDGER) || fresh(), now(), userId, page, suggestedName(user));
    return result;
  }
  async function saveName(user, input) {
    const requestId = uuid(input.requestId), name = firstName(input.firstName), fingerprint = hash(canonical({ action: 'name', firstName: input.firstName }));
    await update(store, CARE_LEDGER, current => {
      const ledger = current || fresh(), receipt = playerReceipt(ledger, user.id, requestId);
      if (receipt) { if (receipt.fingerprint !== fingerprint) conflict('REQUEST_CONFLICT'); return { write: false, result: true }; }
      const profiles = ledger.profiles ||= {}, previous = profiles[user.id], time = iso(now());
      profiles[user.id] = { firstName: name, chosenAt: previous?.chosenAt || time, updatedAt: time };
      ledger.requests['play:' + user.id + ':' + requestId] = { fingerprint, action: 'name' };
      return commit(ledger, true);
    });
    return snapshot(user);
  }
  async function start(user, input) {
    const requestId = uuid(input.requestId), proposed = { id: randomUUID(), seed: token() };
    const result = await update(store, CARE_LEDGER, current => {
      const time = now(), ledger = current || fresh(), key = careWeek(time).key;
      const receipt = playerReceipt(ledger, user.id, requestId);
      const fingerprint = hash(canonical({ action: 'start' }));
      if (receipt) { if (receipt.fingerprint !== fingerprint) conflict('REQUEST_CONFLICT'); return { write: false, result: { roundId: receipt.roundId, weekKey: receipt.weekKey } }; }
      if (!chosenName(ledger, user.id)) throw new ApiError(409, 'NAME_REQUIRED', 'اختاري الاسم الأول الذي سيظهر في ترتيب التحدّي.');
      freezeEnded(ledger, time);
      if (!ledger.enabled) conflict('CARE_PAUSED');
      const week = ledger.weeks[key] ||= weekRow(time);
      const player = week.players[user.id] ||= { points: 0, roundsCompleted: 0, activeRound: null, lastCompletion: null, eligible: true };
      player.eligible = true;
      let round = activeRound(week, user.id, time);
      if (!round) {
        round = { ...proposed, userId: user.id, issuedAt: iso(time), expiresAt: iso(Math.min(time + 2 * 3600000, Date.parse(week.endsAt))) };
        week.rounds[round.id] = round; player.activeRound = round.id;
      }
      ledger.requests['play:' + user.id + ':' + requestId] = { fingerprint, roundId: round.id, weekKey: week.key };
      return commit(ledger, { roundId: round.id, weekKey: week.key });
    });
    const ledger = await read(store, CARE_LEDGER), value = project(ledger, now(), user.id, {}, suggestedName(user)), week = ledger.weeks[result.weekKey];
    return { ...value, round: safeRound(week.rounds[result.roundId]) };
  }
  async function complete(user, input) {
    const requestId = uuid(input.requestId), roundId = uuid(input.roundId), rotations = input.rotations;
    if (!Array.isArray(rotations) || rotations.length !== 16 || rotations.some(value => !Number.isInteger(value) || value < 0 || value > 3)) throw invalid();
    const fingerprint = hash(canonical({ action: 'complete', roundId, rotations }));
    const result = await update(store, CARE_LEDGER, current => {
      const time = now(), ledger = current || fresh(), key = careWeek(time).key;
      // Search retained issued rounds so retries after a week boundary recover
      // accepted completions, while an unsolved old round can never score.
      const week = Object.values(ledger.weeks).find(value => value.rounds[roundId]);
      const round = week?.rounds[roundId];
      if (!round || round.userId !== user.id) throw new ApiError(404, 'ROUND_NOT_FOUND');
      const receipt = playerReceipt(ledger, user.id, requestId);
      if (receipt) { if (receipt.fingerprint !== fingerprint) conflict('REQUEST_CONFLICT'); return { write: false, result: { awarded: 0, roundId } }; }
      if (round.completedAt) {
        if (round.solutionFingerprint !== hash(canonical(rotations))) conflict('ROUND_COMPLETED');
        ledger.requests['play:' + user.id + ':' + requestId] = { fingerprint, roundId, awarded: 0, weekKey: week.key };
        return commit(ledger, { awarded: 0, roundId });
      }
      if (!ledger.enabled) conflict('CARE_PAUSED');
      if (week.key !== key) conflict('CARE_CLOSED');
      if (time >= Date.parse(round.expiresAt)) conflict('ROUND_EXPIRED');
      const challenge = E.makeChallenge(round.seed), board = challenge.tiles.map((tile, i) => ({ ...tile, rotation: rotations[i] }));
      if (challenge.tiles.some((tile, i) => tile.fixed && rotations[i] !== tile.rotation) || !E.trace(challenge, board).success) conflict('ROUND_UNSOLVED');
      const player = week.players[user.id];
      player.eligible = true;
      player.points += 100; player.roundsCompleted++; player.activeRound = null;
      player.lastCompletion = { requestId, roundId, awarded: 100, completedAt: iso(time) };
      round.completedAt = iso(time); round.solutionFingerprint = hash(canonical(rotations));
      ledger.requests['play:' + user.id + ':' + requestId] = { fingerprint, roundId, awarded: 100, weekKey: week.key };
      return commit(ledger, { awarded: 100, roundId });
    });
    return { ...await snapshot(user), ...result };
  }
  async function sweep() {
    return update(store, CARE_LEDGER, current => {
      if (!current || !freezeEnded(current, now())) return { write: false, result: { frozen: false } };
      return commit(current, { frozen: true });
    });
  }
  async function adminSnapshot() {
    const snapshot = adminProject(await read(store, CARE_LEDGER) || fresh(), now());
    await Promise.all(snapshot.participants.rows.map(async row => {
      const account = await read(store, 'user/' + row.userId);
      row.account = account?.id === row.userId && typeof account.email === 'string' && mac(secret, 'user:' + account.email) === row.userId ? { name: account.name || '', email: account.email } : null;
    }));
    await Promise.all(snapshot.weeks.flatMap(week => week.awards.map(async award => {
      if (award.prize.status === 'credited') { try { award.prize.email = await prizeMail.status(week.key, award.prize.id); } catch { award.prize.email = { status: 'pending', retryAllowed: true }; } }
    })));
    const currentWeek = snapshot.weeks.find(week => week.key === snapshot.week.key);
    for (const row of snapshot.participants.rows) row.award = currentWeek?.awards.find(award => award.winner.userId === row.userId) || null;
    return snapshot;
  }
  async function notifyPrize(weekKey, winnerId) {
    try {
      const ledger = await read(store, CARE_LEDGER), week = ledger?.weeks[weekKey], award = awardFor(week, winnerId);
      if (week?.frozenAt && award?.winnerId && award.prize?.status === 'credited') await prizeMail.send({ weekKey, winnerId: award.winnerId, firstName: chosenName(ledger, award.winnerId), prize: award.prize });
    } catch { /* A confirmed wallet credit never becomes a failed credit because of mail. */ }
  }
  async function creditPrize(weekKey, winnerId) {
    const ledger = await read(store, CARE_LEDGER), week = ledger?.weeks[weekKey], award = awardFor(week, winnerId), prize = award?.prize;
    if (!prize || !week.frozenAt || !award.winnerId) conflict('PRIZE_NOT_APPROVED');
    // One deterministic marker and the financial credit share the booking CAS.
    // A lost acknowledgement is reconciled by reading this same transaction.
    await update(store, BOOKING_LEDGER, current => {
      const booking = current || { schema: 1, bookings: {}, requests: {} };
      booking.visitProgram ||= newVisitProgram();
      const program = booking.visitProgram;
      if (program.schema !== 1 || !program.transactions || !program.visits || !program.rewards) throw new ApiError(503, 'WALLET_PROGRAM_UNAVAILABLE');
      const existing = program.transactions[prize.id];
      if (existing) {
        if (existing.userId !== award.winnerId || existing.cents !== 10000 || existing.kind !== 'care-prize') conflict('PRIZE_LEDGER_CONFLICT');
        return { write: false, result: true };
      }
      program.transactions[prize.id] = { id: prize.id, userId: award.winnerId, cents: 10000, kind: 'care-prize', createdAt: prize.approvedAt, careWeekKey: weekKey };
      return { value: booking, result: true };
    });
    await update(store, CARE_LEDGER, current => {
      const prize = awardFor(current?.weeks[weekKey], winnerId)?.prize;
      if (!prize) conflict('PRIZE_NOT_APPROVED');
      if (prize.status === 'credited') return { write: false, result: true };
      prize.status = 'credited'; prize.creditedAt = iso(now());
      return commit(current, true);
    });
  }
  async function adminMutate(actor, input) {
    const requestId = uuid(input.requestId), fingerprint = hash(canonical(input));
    if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw invalid();
    let selectedAccount = null;
    if (input.action === 'select-winner') {
      if (typeof input.winnerId !== 'string' || !/^[a-f0-9]{64}$/.test(input.winnerId)) throw invalid();
      selectedAccount = await read(store, 'user/' + input.winnerId);
      if (selectedAccount?.id !== input.winnerId || typeof selectedAccount.email !== 'string' || mac(secret, 'user:' + selectedAccount.email) !== input.winnerId) conflict('WINNER_ACCOUNT_UNAVAILABLE');
    }
    const selectionEntropy = randomInt(0, 0x100000000);
    const result = await update(store, CARE_LEDGER, current => {
      const time = now(), ledger = current || fresh(), receiptKey = 'admin:' + actor.id + ':' + requestId, receipt = ledger.requests[receiptKey];
      if (receipt) { if (receipt.fingerprint !== fingerprint) conflict('REQUEST_CONFLICT'); return { write: false, result: { prizeWeek: receipt.prizeWeek, emailWeek: receipt.emailWeek, prizeWinnerId: receipt.prizeWinnerId, emailWinnerId: receipt.emailWinnerId } }; }
      if (input.revision !== ledger.revision) conflict('REVISION_CONFLICT');
      let prizeWeek = null, emailWeek = null, prizeWinnerId, emailWinnerId;
      if (input.action === 'settings-save') {
        if (typeof input.enabled !== 'boolean') throw invalid();
        ledger.enabled = input.enabled;
      } else {
        if (typeof input.weekKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.weekKey)) throw invalid();
        const week = ledger.weeks[input.weekKey];
        if (!week) throw new ApiError(404, 'CARE_WEEK_NOT_FOUND');
        if (['approve-prize', 'retry-prize-email'].includes(input.action) && input.winnerId !== undefined && (typeof input.winnerId !== 'string' || !/^[a-f0-9]{64}$/.test(input.winnerId) || !awardFor(week, input.winnerId))) conflict('AWARD_NOT_FOUND');
        if (input.action === 'select-winner') {
          if (week.key !== careWeek(time).key) conflict('PRIZE_SELECTION_LOCKED');
          if (week.winnerId === input.winnerId || week.awards?.[input.winnerId]) conflict('AWARD_ALREADY_SELECTED');
          if (!week.players[input.winnerId] || !selectedAccount) conflict('WINNER_NOT_PARTICIPANT');
          if (week.winnerId || week.prize) {
            if (!week.frozenAt) conflict('PRIZE_SELECTION_LOCKED');
            (week.awards ||= {})[input.winnerId] = { winnerId: input.winnerId, selectionMode: 'manual', selectedBy: actor.id, selectedAt: iso(time), prize: { id: 'care-prize:' + week.key + ':' + input.winnerId, amountSar: 100, status: 'approved', approvedAt: iso(time), approvedBy: actor.id } };
            prizeWeek = week.key; prizeWinnerId = input.winnerId;
          } else {
          const rows = rankings(week, ledger), top = rows[0]?.points || 0;
          for (const player of Object.values(week.players)) player.eligible = true;
          week.frozenAt = iso(time); week.selectionMode = 'manual'; week.selectedBy = actor.id; week.selectedAt = iso(time);
          week.leaderIds = rows.filter(row => row.points === top).map(row => row.userId); week.leaderPoints = top;
          week.winnerId = input.winnerId; week.tie = { status: 'none', resolution: 'manual-selection' };
          week.prize = { id: 'care-prize:' + week.key, amountSar: 100, status: 'approved', approvedAt: iso(time), approvedBy: actor.id };
          prizeWeek = week.key;
          }
        } else if (input.action === 'retry-prize-email') {
          const award = awardFor(week, input.winnerId);
          if (!week.frozenAt || !award?.winnerId || award.prize?.status !== 'credited') conflict('PRIZE_NOT_CREDITED');
          emailWeek = week.key; emailWinnerId = input.winnerId;
        } else if (input.action === 'approve-prize' && week.frozenAt && awardFor(week, input.winnerId)?.winnerId && ['approved','credited'].includes(awardFor(week, input.winnerId)?.prize?.status)) {
          // A reload may lose the browser's pending UUID after selection was
          // committed. Recover the already-authorized immutable prize only.
          prizeWeek = week.key; prizeWinnerId = input.winnerId;
        } else if (time < Date.parse(week.endsAt)) conflict('CARE_WEEK_ACTIVE');
        else if (input.action === 'finalize') freezeEnded(ledger, time, week.key);
        else if (input.action === 'resolve-tie') {
          if (!week.frozenAt) conflict('CARE_WEEK_NOT_FROZEN');
          if (week.tie?.status !== 'pending' || week.leaderIds.length < 2) conflict('TIE_NOT_PENDING');
          // Rejection sampling avoids modulo bias; entropy is generated once
          // per handler and a CAS retry cannot redraw an already frozen choice.
          const count = week.leaderIds.length, ceiling = Math.floor(0x100000000 / count) * count;
          let choice = selectionEntropy; while (choice >= ceiling) choice = randomInt(0, 0x100000000);
          const index = choice % count;
          week.winnerId = week.leaderIds[index];
          week.tie = { status: 'resolved', resolvedAt: iso(time), resolvedBy: actor.id, eligibleCount: count, drawId: requestId, selectionIndex: index };
        } else if (input.action === 'approve-prize') {
          if (!week.frozenAt || !week.winnerId || week.tie?.status === 'pending') conflict('PRIZE_WINNER_REQUIRED');
          week.prize ||= { id: 'care-prize:' + week.key, amountSar: 100, status: 'approved', approvedAt: iso(time), approvedBy: actor.id };
          prizeWeek = week.key;
        } else throw invalid();
      }
      ledger.requests[receiptKey] = { fingerprint, prizeWeek, emailWeek, ...(prizeWinnerId ? { prizeWinnerId } : {}), ...(emailWinnerId ? { emailWinnerId } : {}) };
      return commit(ledger, { prizeWeek, emailWeek, prizeWinnerId, emailWinnerId });
    });
    if (result.prizeWeek) { await creditPrize(result.prizeWeek, result.prizeWinnerId); await notifyPrize(result.prizeWeek, result.prizeWinnerId); }
    else if (result.emailWeek) await notifyPrize(result.emailWeek, result.emailWinnerId);
    return adminSnapshot();
  }
  return { snapshot, saveName, start, complete, adminSnapshot, adminMutate, sweep };
}
