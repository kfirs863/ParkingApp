import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

admin.initializeApp();

const db = admin.firestore();

// ─── Types ────────────────────────────────────────────────
interface ParkingRequest {
  requesterId: string;
  requesterName: string;
  ownerId?: string;
  ownerName?: string;
  spotNumber?: string;
  status: string;
  isGuest?: boolean;
  carNumber?: string;
  fromTime: admin.firestore.Timestamp;
  toTime: admin.firestore.Timestamp;
}

interface UserDoc {
  fcmToken?: string;
  ownedSpot?: string | null;
  // Push preferences. All default to true (undefined = enabled).
  pushGeneral?: boolean;   // legacy alias for pushBroadcast — kept for backward compat
  pushBroadcast?: boolean; // new request fan-out to spot owners
  pushMyEvents?: boolean;  // events on this user's own active sessions
  pushReminders?: boolean; // pings (owner→requester) and thanks (requester→owner)
}

// ─── Helpers ──────────────────────────────────────────────

async function getUser(uid: string): Promise<UserDoc | null> {
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? (snap.data() as UserDoc) : null;
}

type PushCategory = 'broadcast' | 'myEvents' | 'reminders';

// Returns the user's FCM token IF their preferences allow this category of
// push; otherwise null. Treat undefined preferences as "enabled" so existing
// users (who don't yet have the new fields on their doc) keep getting pushes.
async function getTokenIfAllowed(uid: string, category: PushCategory): Promise<string | null> {
  const user = await getUser(uid);
  if (!user?.fcmToken) return null;
  if (category === 'broadcast') {
    if (user.pushBroadcast === false) return null;
    if (user.pushGeneral === false) return null; // legacy
  } else if (category === 'myEvents') {
    if (user.pushMyEvents === false) return null;
  } else if (category === 'reminders') {
    if (user.pushReminders === false) return null;
  }
  return user.fcmToken;
}

async function sendPush(
  token: string,
  uid: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  try {
    await admin.messaging().send({
      token,
      notification: { title, body },
      data: data ?? {},
      android: {
        priority: 'high',
        notification: {
          channelId: 'parking_alerts',
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: { sound: 'default' },
        },
      },
    });
  } catch (err: any) {
    const errCode = err?.errorInfo?.code ?? err?.code ?? '';
    if (
      errCode === 'messaging/registration-token-not-registered' ||
      errCode === 'messaging/invalid-registration-token'
    ) {
      await db.collection('users').doc(uid).update({ fcmToken: null });
      functions.logger.warn(`Stale FCM token removed for uid=${uid}`);
    } else {
      functions.logger.error('FCM push send failed', err?.message ?? err);
    }
  }
}

function fmtTime(ts: admin.firestore.Timestamp): string {
  return ts.toDate().toLocaleTimeString('he-IL', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem',
  });
}

// Returns the set of ownerIds whose configured availabilityRules permit the
// requested window. An owner with NO active rule is always included (legacy
// behavior). An owner with one or more active rules is only included if at
// least one rule covers part of the request window in Asia/Jerusalem time.
async function filterByAvailabilityRules(
  ownerIds: string[],
  fromTime: admin.firestore.Timestamp,
  toTime: admin.firestore.Timestamp
): Promise<Set<string>> {
  const allowed = new Set<string>(ownerIds);
  if (ownerIds.length === 0) return allowed;

  const CHUNK = 30;
  // ownerId → array of active rules (empty if none configured)
  const rulesByOwner = new Map<string, Array<{ days: number[]; fromHHMM: string; toHHMM: string }>>();
  for (const id of ownerIds) rulesByOwner.set(id, []);

  for (let i = 0; i < ownerIds.length; i += CHUNK) {
    const chunk = ownerIds.slice(i, i + CHUNK);
    const snap = await db
      .collection('availabilityRules')
      .where('ownerId', 'in', chunk)
      .where('active', '==', true)
      .get();
    for (const d of snap.docs) {
      const r = d.data();
      const arr = rulesByOwner.get(r.ownerId);
      if (arr) arr.push({ days: r.days, fromHHMM: r.fromHHMM, toHHMM: r.toHHMM });
    }
  }

  // Compare in Asia/Jerusalem wall-clock time. The request window may span
  // multiple local days; check each day in [fromTime, toTime].
  const reqFromMs = fromTime.toMillis();
  const reqToMs = toTime.toMillis();

  for (const ownerId of ownerIds) {
    const rules = rulesByOwner.get(ownerId) ?? [];
    if (rules.length === 0) continue; // no rules → keep allowed

    let matchesAny = false;
    // Walk every local day touched by the request and test each rule.
    const cursor = new Date(reqFromMs);
    while (cursor.getTime() < reqToMs && !matchesAny) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jerusalem', hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
      }).formatToParts(cursor);
      const m = Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<string, string>;
      const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const localDay = dayMap[m.weekday ?? 'Sun'] ?? 0;
      const yearStr = m.year ?? '1970', monthStr = m.month ?? '01', dayStr = m.day ?? '01';

      for (const r of rules) {
        if (!r.days.includes(localDay)) continue;
        // Build the rule's local window for this calendar day, in absolute ms.
        const [fhStr, fmStr] = r.fromHHMM.split(':');
        const [thStr, tmStr] = r.toHHMM.split(':');
        const ruleStart = jerusalemWallClockToUTC(yearStr, monthStr, dayStr, +(fhStr ?? '0'), +(fmStr ?? '0'));
        const ruleEnd = jerusalemWallClockToUTC(yearStr, monthStr, dayStr, +(thStr ?? '0'), +(tmStr ?? '0'));
        if (ruleStart < reqToMs && ruleEnd > reqFromMs) { matchesAny = true; break; }
      }
      // Advance to next local midnight in Asia/Jerusalem.
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    if (!matchesAny) allowed.delete(ownerId);
  }

  return allowed;
}

// Convert a Y-M-D h:m wall-clock in Asia/Jerusalem to UTC ms, accounting for
// DST at that local instant (not at "now"). Same trick used in the recurring
// rule generator: pretend the local clock is UTC, ask Intl what time *that*
// UTC instant would show in Jerusalem, subtract the difference.
function jerusalemWallClockToUTC(year: string, month: string, day: string, h: number, mi: number): number {
  const asIfUTC = Date.UTC(+year, +month - 1, +day, h, mi, 0);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(asIfUTC));
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<string, string>;
  const offsetMs =
    Date.UTC(
      +(m.year ?? '1970'), +(m.month ?? '01') - 1, +(m.day ?? '01'),
      +(m.hour ?? '0'), +(m.minute ?? '0'), +(m.second ?? '0')
    ) - asIfUTC;
  return asIfUTC - offsetMs;
}

// One query for all owners' active sessions, then per-owner overlap.
async function findOccupiedOwners(
  ownerIds: string[],
  fromTime: admin.firestore.Timestamp,
  toTime: admin.firestore.Timestamp
): Promise<Set<string>> {
  const occupied = new Set<string>();
  if (ownerIds.length === 0) return occupied;
  // Firestore `in` clauses are capped at 30 entries (Nov 2023+)
  const CHUNK = 30;
  for (let i = 0; i < ownerIds.length; i += CHUNK) {
    const chunk = ownerIds.slice(i, i + CHUNK);
    const snap = await db
      .collection('parkingRequests')
      .where('ownerId', 'in', chunk)
      .where('status', 'in', ['approved', 'confirmed'])
      .where('toTime', '>', fromTime)
      .get();
    for (const d of snap.docs) {
      const data = d.data();
      if (data.fromTime.toMillis() < toTime.toMillis()) occupied.add(data.ownerId);
    }
  }
  return occupied;
}

// ─────────────────────────────────────────────────────────
// TRIGGER: status transitions on parkingRequests
// ─────────────────────────────────────────────────────────
export const onParkingRequestUpdated = functions
  .region('europe-west1')
  .firestore.document('parkingRequests/{requestId}')
  .onUpdate(async (change) => {
    const before = change.before.data() as ParkingRequest;
    const after  = change.after.data()  as ParkingRequest;
    const id     = change.after.id;

    // open → approved (regular)
    if (before.status === 'open' && after.status === 'approved' && !after.isGuest) {
      const token = await getTokenIfAllowed(after.requesterId, "myEvents");
      if (token) await sendPush(token, after.requesterId,
        'הבקשה שלך אושרה!',
        `חניה ${after.spotNumber ?? '?'} של ${after.ownerName ?? 'בעל החניה'} זמינה עד ${fmtTime(after.toTime)}. הכנס מספר רכב לאישור.`,
        { requestId: id, action: 'confirm_car' }
      );
    }

    // open → confirmed (guest, car known upfront)
    if (before.status === 'open' && after.status === 'confirmed' && after.isGuest) {
      const token = await getTokenIfAllowed(after.requesterId, "myEvents");
      if (token) await sendPush(token, after.requesterId,
        'האורח שלך יכול לחנות!',
        `חניה ${after.spotNumber ?? '?'} של ${after.ownerName ?? 'בעל החניה'} אושרה עד ${fmtTime(after.toTime)}.`,
        { requestId: id, action: 'view_active' }
      );
    }

    // approved → confirmed
    if (before.status === 'approved' && after.status === 'confirmed' && after.ownerId) {
      const token = await getTokenIfAllowed(after.ownerId, "myEvents");
      if (token) await sendPush(token, after.ownerId,
        'מישהו נכנס לחניה שלך',
        `${after.requesterName ?? 'הדייר'} חונה בחניה ${after.spotNumber ?? '?'} עד ${fmtTime(after.toTime)}.`,
        { requestId: id, action: 'view_active' }
      );
    }

    // → cancelled
    if (before.status !== 'cancelled' && after.status === 'cancelled') {
      if (before.status === 'approved' && after.ownerId) {
        const token = await getTokenIfAllowed(after.requesterId, "myEvents");
        if (token) await sendPush(token, after.requesterId,
          'האישור בוטל',
          `${after.ownerName ?? 'בעל החניה'} ביטל את אישור החניה. שלח בקשה חדשה.`,
          { requestId: id, action: 'cancelled' }
        );
      }
      if (before.status === 'confirmed' && after.ownerId) {
        const token = await getTokenIfAllowed(after.ownerId, "myEvents");
        if (token) await sendPush(token, after.ownerId,
          'החניה שלך פנויה',
          `${after.requesterName ?? 'הדייר'} יצא מהחניה לפני הזמן.`,
          { requestId: id, action: 'freed' }
        );
      }
    }
  });

// ─────────────────────────────────────────────────────────
// TRIGGER: new open request → broadcast to all eligible owners
//
// Sends a push notification to every spot owner who:
//   - has a registered spot (ownedSpot != null)
//   - hasn't opted out of notifications (pushGeneral != false)
//   - isn't the requester themselves
//   - doesn't have an overlapping active booking on their spot
// ─────────────────────────────────────────────────────────
export const onNewParkingRequest = functions
  .region('europe-west1')
  .firestore.document('parkingRequests/{requestId}')
  .onCreate(async (snap) => {
    const req = snap.data() as ParkingRequest;
    if (req.status !== 'open') return;

    // Notify all owners with ownedSpot set, pushGeneral not opted-out,
    // who are not the requester and whose spot isn't already occupied.
    const ownersSnap = await db.collection('users').where('ownedSpot', '!=', null).get();

    // First pass: filter cheaply by token + opt-out + self.
    const candidates = ownersSnap.docs
      .filter((d) => d.id !== req.requesterId)
      .map((d) => ({ id: d.id, data: d.data() as UserDoc }))
      .filter((u) =>
        u.data.fcmToken &&
        u.data.pushGeneral !== false &&     // legacy
        u.data.pushBroadcast !== false      // new granular flag
      );

    // One bulk query to find which of those candidates already have an
    // overlapping active session — replaces N per-owner reads.
    const occupied = await findOccupiedOwners(
      candidates.map((u) => u.id),
      req.fromTime,
      req.toTime
    );

    // Owners with active availabilityRules: only notify them if the request's
    // window overlaps one of their rules. Owners without ANY active rule keep
    // the previous behavior (notify on every request) so we don't silently
    // mute existing users when this filter ships.
    const allowedByRules = await filterByAvailabilityRules(
      candidates.map((u) => u.id),
      req.fromTime,
      req.toTime
    );

    const pushes: Promise<void>[] = [];
    for (const u of candidates) {
      if (occupied.has(u.id)) continue;
      if (!allowedByRules.has(u.id)) continue;
      pushes.push(sendPush(u.data.fcmToken as string, u.id,
        `${req.requesterName} מחפש/ת חניה`,
        `מ-${fmtTime(req.fromTime)} עד ${fmtTime(req.toTime)}. לחץ לאישור.`,
        { requestId: snap.id, action: 'approve' }
      ));
    }

    if (pushes.length === 0) return;
    await Promise.all(pushes);
    functions.logger.info(`New request push sent to ${pushes.length} owners`);
  });

// ─────────────────────────────────────────────────────────
// SCHEDULED: expire stale requests every 15 minutes
//
// Transitions parkingRequests whose toTime has passed:
//   open|approved → expired   (parking never happened — notify both parties)
//   confirmed     → completed (parking happened — silent close, no push)
//
// Without the 'confirmed' branch, sessions stayed in 'confirmed' forever
// and bloated client queries (e.g. the "נתתי" badge on HomeScreen).
// ─────────────────────────────────────────────────────────
export const expireStaleRequests = functions
  .region('europe-west1')
  .pubsub.schedule('every 15 minutes')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    const staleSnap = await db
      .collection('parkingRequests')
      .where('status', 'in', ['open', 'approved', 'confirmed'])
      .where('toTime', '<', now)
      .get();

    if (staleSnap.empty) return;

    const pushPromises: Promise<void>[] = [];

    // Firestore batches are limited to 500 operations
    const BATCH_SIZE = 499;
    for (let i = 0; i < staleSnap.docs.length; i += BATCH_SIZE) {
      const chunk = staleSnap.docs.slice(i, i + BATCH_SIZE);
      const batch = db.batch();

      chunk.forEach((d) => {
        const data = d.data() as ParkingRequest;

        // 'confirmed' means the parking actually happened — close it as
        // 'completed' with no notifications (it's expected behavior).
        if (data.status === 'confirmed') {
          batch.update(d.ref, { status: 'completed', completedAt: now });
          return;
        }

        // 'open' / 'approved' — the parking never took place.
        batch.update(d.ref, { status: 'expired', expiredAt: now });

        // Notify requester
        if (data.requesterId) {
          pushPromises.push(
            getTokenIfAllowed(data.requesterId, "myEvents").then((token) => {
              if (!token) return;
              return sendPush(token, data.requesterId,
                'הבקשה שלך לא אושרה',
                `הבקשה ל-${fmtTime(data.toTime)} פגה תוקף. שלח בקשה חדשה אם עדיין צריך.`,
                { action: 'expired' }
              );
            })
          );
        }

        // Notify owner that their spot is free again (only if they had approved)
        if (data.status === 'approved' && data.ownerId) {
          pushPromises.push(
            getTokenIfAllowed(data.ownerId, "myEvents").then((token) => {
              if (!token) return;
              return sendPush(token, data.ownerId!,
                'החניה שלך פנויה שוב',
                `${data.requesterName} לא אישר/ה את קבלת החניה בזמן. החניה שלך חופשייה.`,
                { action: 'freed' }
              );
            })
          );
        }
      });

      await batch.commit();
    }

    await Promise.all(pushPromises);
    functions.logger.info(`Closed ${staleSnap.size} stale requests`);
  });


// ─────────────────────────────────────────────────────────
// SCHEDULED: generate today's windows from recurring rules (00:05 daily)
// ─────────────────────────────────────────────────────────
export const generateRecurringAvailability = functions
  .region('europe-west1')
  .pubsub.schedule('5 0 * * *')
  .timeZone('Asia/Jerusalem')
  .onRun(async () => {
    // Use Israel timezone for correct local date/time
    const nowUTC = new Date();
    const dateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    }).formatToParts(nowUTC);
    const partMap = Object.fromEntries(dateParts.map((p) => [p.type, p.value])) as Record<string, string>;
    const yearStr = partMap.year ?? '1970';
    const monthStr = partMap.month ?? '01';
    const dayStr = partMap.day ?? '01';
    const weekdayStr = partMap.weekday ?? 'Sun';
    const todayStr = `${yearStr}-${monthStr}-${dayStr}`;
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const israelDay = dayMap[weekdayStr] ?? 0;

    const rulesSnap = await db
      .collection('availabilityRules')
      .where('active', '==', true)
      .where('days', 'array-contains', israelDay)
      .get();

    if (rulesSnap.empty) return;

    // Build a Date in Asia/Jerusalem from a YYYY-MM-DD HH:MM string by
    // measuring the timezone offset at that *local* instant (not at "now",
    // which is wrong across DST boundaries). The trick: pretend the local
    // wall-clock string is UTC, then ask Intl what wall-clock that UTC
    // instant would have shown in Asia/Jerusalem. The difference is the
    // offset to subtract.
    const tzPartsAt = (d: Date) => {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jerusalem', hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).formatToParts(d);
      const m = Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<string, string>;
      return Date.UTC(
        +(m.year ?? '1970'), +(m.month ?? '01') - 1, +(m.day ?? '01'),
        +(m.hour ?? '0'), +(m.minute ?? '0'), +(m.second ?? '0')
      );
    };
    const buildJerusalemTime = (h: number, mi: number): Date => {
      const asIfUTC = Date.UTC(+yearStr, +monthStr - 1, +dayStr, h, mi, 0);
      const offsetMs = tzPartsAt(new Date(asIfUTC)) - asIfUTC;
      return new Date(asIfUTC - offsetMs);
    };

    // Firestore batches are limited to 500 operations
    const BATCH_SIZE = 499;
    let batch = db.batch();
    let batchCount = 0;

    for (const d of rulesSnap.docs) {
      const rule = d.data();
      const fromParts = (rule.fromHHMM as string).split(':').map(Number);
      const toParts = (rule.toHHMM as string).split(':').map(Number);
      const fh = fromParts[0] ?? 0;
      const fm = fromParts[1] ?? 0;
      const th = toParts[0] ?? 0;
      const tm = toParts[1] ?? 0;

      const fromTime = buildJerusalemTime(fh, fm);
      const toTime = buildJerusalemTime(th, tm);

      if (toTime <= nowUTC) continue;

      // Dedup: skip if already created for today
      const existing = await db.collection('spotAvailability')
        .where('ownerId', '==', rule.ownerId)
        .where('ruleId',  '==', d.id)
        .where('dateStr', '==', todayStr)
        .get();
      if (!existing.empty) continue;

      const ref = db.collection('spotAvailability').doc();
      batch.set(ref, {
        ownerId:        rule.ownerId,
        ownerName:      rule.ownerName,
        ownerApartment: rule.ownerApartment,
        ownerTower:     rule.ownerTower,
        spotNumber:     rule.spotNumber,
        fromTime:       admin.firestore.Timestamp.fromDate(fromTime),
        toTime:         admin.firestore.Timestamp.fromDate(toTime),
        status:         'active',
        ruleId:         d.id,
        dateStr:        todayStr,
        isRecurring:    true,
        createdAt:      admin.firestore.Timestamp.now(),
      });
      batchCount++;

      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) await batch.commit();
    functions.logger.info(`Generated recurring windows for ${rulesSnap.size} rules`);
  });

// ─────────────────────────────────────────────────────────
// CALLABLE: mint a custom token so the JS SDK can be synced after
// the native SDK signs in. The client passes its native ID token;
// we verify it with the Admin SDK and return a custom token for
// the same UID, which the JS SDK accepts via signInWithCustomToken.
// ─────────────────────────────────────────────────────────
export const mintCustomToken = functions
  .region('europe-west1')
  .https.onCall(async (data) => {
    const idToken: string = data?.idToken;
    if (!idToken) throw new functions.https.HttpsError('invalid-argument', 'idToken required');
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      const customToken = await admin.auth().createCustomToken(decoded.uid);
      return { customToken };
    } catch (err: any) {
      functions.logger.error('mintCustomToken failed:', err?.message, 'token prefix:', idToken?.slice(0, 20));
      throw new functions.https.HttpsError('unauthenticated', err?.message ?? 'Invalid ID token');
    }
  });

// ─────────────────────────────────────────────────────────
// TRIGGER: thanks — increment recipient's thanksCount and notify them.
// One thanks per (fromUid, requestId) pair; client should not write twice
// for the same request, but the dedup query here is a defense in depth.
// ─────────────────────────────────────────────────────────
export const onThanks = functions
  .region('europe-west1')
  .firestore.document('thanks/{thankId}')
  .onCreate(async (snap) => {
    const t = snap.data();
    if (!t.toUid || !t.fromUid || !t.requestId) return;

    // Dedup: if a previous thanks doc exists for the same (fromUid, requestId),
    // skip the increment — the client UI tries to prevent this but a flaky
    // network can resubmit.
    const dupSnap = await db
      .collection('thanks')
      .where('fromUid', '==', t.fromUid)
      .where('requestId', '==', t.requestId)
      .limit(2)
      .get();
    if (dupSnap.size > 1) {
      functions.logger.warn(`Duplicate thanks for request=${t.requestId}; skipping increment`);
      return;
    }

    await db.collection('users').doc(t.toUid).set(
      { thanksCount: admin.firestore.FieldValue.increment(1) },
      { merge: true }
    );

    const token = await getTokenIfAllowed(t.toUid, "reminders");
    if (token) {
      await sendPush(token, t.toUid,
        'קיבלת תודה 🙏',
        'מישהו הודה לך על שנתת לו לחנות.',
        { action: 'view_profile' }
      );
    }
  });

// ─────────────────────────────────────────────────────────
// TRIGGER: parkingPings — owner sends gentle reminder to requester
// Rate-limited: max 1 push per 5 minutes per requestId (server-side guard)
// ─────────────────────────────────────────────────────────
export const onParkingPing = functions
  .region('europe-west1')
  .firestore.document('parkingPings/{pingId}')
  .onCreate(async (snap) => {
    const ping = snap.data();

    // Server-side rate limit: check last ping for this request in last 5 mins
    const fiveMinsAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
    const recentPings = await db
      .collection('parkingPings')
      .where('requestId', '==', ping.requestId)
      .where('createdAt', '>', fiveMinsAgo)
      .get();

    // More than 1 = this ping + at least one recent → throttle
    if (recentPings.size > 1) {
      functions.logger.warn(`Ping throttled for requestId=${ping.requestId}`);
      await snap.ref.update({ throttled: true });
      return;
    }

    const token = await getTokenIfAllowed(ping.toUid, "reminders");
    if (!token) return;

    const toTime = (ping.toTime as admin.firestore.Timestamp).toDate()
      .toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });

    await sendPush(
      token, ping.toUid,
      'תזכורת: זמן החניה מסתיים בקרוב',
      `החניה ${ping.spotNumber} שלך מסתיימת ב-${toTime}. אנא התכונן/י לפנות את המקום.`,
      { requestId: ping.requestId, action: 'view_active' }
    );
  });
