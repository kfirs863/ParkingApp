import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import fetch from 'node-fetch';

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
  pushGeneral?: boolean; // false = opted out of broadcast pushes
}

// ─── Helpers ──────────────────────────────────────────────

async function getUser(uid: string): Promise<UserDoc | null> {
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? (snap.data() as UserDoc) : null;
}

async function getToken(uid: string): Promise<string | null> {
  const user = await getUser(uid);
  return user?.fcmToken ?? null;
}

async function sendPush(
  token: string,
  uid: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        title,
        body,
        data: data ?? {},
        sound: 'default',
        channelId: 'parking_alerts',
        priority: 'high',
      }),
    });
    const result = await res.json() as any;
    if (result.data?.status === 'error') {
      if (result.data.details?.error === 'DeviceNotRegistered') {
        await db.collection('users').doc(uid).update({ fcmToken: null });
        functions.logger.warn(`Stale Expo token removed for uid=${uid}`);
      } else {
        functions.logger.error('Expo push error', result.data);
      }
    }
  } catch (err) {
    functions.logger.error('Expo push send failed', err);
  }
}

function fmtTime(ts: admin.firestore.Timestamp): string {
  return ts.toDate().toLocaleTimeString('he-IL', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem',
  });
}

async function isSpotOccupied(
  ownerId: string,
  fromTime: admin.firestore.Timestamp,
  toTime: admin.firestore.Timestamp
): Promise<boolean> {
  const snap = await db
    .collection('parkingRequests')
    .where('ownerId', '==', ownerId)
    .where('status', 'in', ['approved', 'confirmed'])
    .where('toTime', '>', fromTime)
    .get();
  // Client-side check for the other bound (Firestore can't range-filter two fields)
  return snap.docs.some((d) => d.data().fromTime.toMillis() < toTime.toMillis());
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
      const token = await getToken(after.requesterId);
      if (token) await sendPush(token, after.requesterId,
        'הבקשה שלך אושרה!',
        `חניה ${after.spotNumber} של ${after.ownerName} זמינה עד ${fmtTime(after.toTime)}. הכנס מספר רכב לאישור.`,
        { requestId: id, action: 'confirm_car' }
      );
    }

    // open → confirmed (guest, car known upfront)
    if (before.status === 'open' && after.status === 'confirmed' && after.isGuest) {
      const token = await getToken(after.requesterId);
      if (token) await sendPush(token, after.requesterId,
        'האורח שלך יכול לחנות!',
        `חניה ${after.spotNumber} של ${after.ownerName} אושרה עד ${fmtTime(after.toTime)}.`,
        { requestId: id, action: 'view_active' }
      );
    }

    // approved → confirmed
    if (before.status === 'approved' && after.status === 'confirmed' && after.ownerId) {
      const token = await getToken(after.ownerId);
      if (token) await sendPush(token, after.ownerId,
        'מישהו נכנס לחניה שלך',
        `${after.requesterName} חונה בחניה ${after.spotNumber} עד ${fmtTime(after.toTime)}.`,
        { requestId: id, action: 'view_active' }
      );
    }

    // → cancelled
    if (before.status !== 'cancelled' && after.status === 'cancelled') {
      if (before.status === 'approved' && after.ownerId) {
        const token = await getToken(after.requesterId);
        if (token) await sendPush(token, after.requesterId,
          'האישור בוטל',
          `${after.ownerName} ביטל את אישור החניה. שלח בקשה חדשה.`,
          { requestId: id, action: 'cancelled' }
        );
      }
      if (before.status === 'confirmed' && after.ownerId) {
        const token = await getToken(after.ownerId);
        if (token) await sendPush(token, after.ownerId,
          'החניה שלך פנויה',
          `${after.requesterName} יצא מהחניה לפני הזמן.`,
          { requestId: id, action: 'freed' }
        );
      }
    }
  });

// ─────────────────────────────────────────────────────────
// TRIGGER: new open request
//
// FIX: unified into ONE trigger — no double-push.
// Logic:
//   1. Find owners with matching availability window → send targeted push
//   2. If ANY targeted push was sent → skip broadcast entirely
//   3. If NO targeted owners → broadcast to opt-in owners only
//
// Result: every owner gets AT MOST ONE notification per request.
// ─────────────────────────────────────────────────────────
export const onNewParkingRequest = functions
  .region('europe-west1')
  .firestore.document('parkingRequests/{requestId}')
  .onCreate(async (snap) => {
    const req = snap.data() as ParkingRequest;
    if (req.status !== 'open') return;

    // Step 1: targeted push to availability-window owners
    // Firestore can't range-filter on two different fields,
    // so we filter fromTime <= req.toTime and check toTime client-side
    const availSnap = await db
      .collection('spotAvailability')
      .where('status',   '==', 'active')
      .where('fromTime', '<=', req.toTime)
      .get();

    const targetedUids = new Set<string>();

    for (const d of availSnap.docs) {
      const avail = d.data();
      // Client-side check for the other range bound
      if (avail.toTime.toMillis() < req.fromTime.toMillis()) continue;
      if (avail.ownerId === req.requesterId) continue;
      if (await isSpotOccupied(avail.ownerId, req.fromTime, req.toTime)) continue;
      targetedUids.add(avail.ownerId);
      const token = await getToken(avail.ownerId);
      if (!token) continue;
      await sendPush(token, avail.ownerId,
        'בקשה תואמת לחלון הזמינות שלך!',
        `${req.requesterName} צריך/ה חניה מ-${fmtTime(req.fromTime)} עד ${fmtTime(req.toTime)}.`,
        { requestId: snap.id, action: 'approve' }
      );
    }

    // Step 2: if any targeted push was sent → defer broadcast (don't skip forever)
    if (targetedUids.size > 0) {
      await snap.ref.update({
        targetedAt: admin.firestore.Timestamp.now(),
        broadcastSent: false,
      });
      functions.logger.info(`Targeted ${targetedUids.size} owners — broadcast deferred`);
      return;
    }

    // Step 3: broadcast to remaining opt-in owners
    const ownersSnap = await db.collection('users').where('ownedSpot', '!=', null).get();

    const tokens: { token: string; uid: string }[] = [];
    for (const d of ownersSnap.docs) {
      const data = d.data() as UserDoc;
      if (d.id === req.requesterId) continue;
      if (targetedUids.has(d.id)) continue;
      if (!data.fcmToken || data.pushGeneral === false) continue;
      if (await isSpotOccupied(d.id, req.fromTime, req.toTime)) continue;
      tokens.push({ token: data.fcmToken as string, uid: d.id });
    }

    if (tokens.length === 0) return;

    const BATCH = 100; // Expo recommends max 100 per request
    for (let i = 0; i < tokens.length; i += BATCH) {
      const slice = tokens.slice(i, i + BATCH);
      try {
        const messages = slice.map((t) => ({
          to: t.token,
          title: `${req.requesterName} מחפש/ת חניה`,
          body: `מ-${fmtTime(req.fromTime)} עד ${fmtTime(req.toTime)}. לחץ לאישור.`,
          data: { requestId: snap.id, action: 'approve' },
          sound: 'default' as const,
          channelId: 'parking_alerts',
          priority: 'high' as const,
        }));
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(messages),
        });
        const results = await res.json() as any;
        // Clean up stale tokens
        if (Array.isArray(results.data)) {
          results.data.forEach((receipt: any, idx: number) => {
            if (receipt.status === 'error' &&
                receipt.details?.error === 'DeviceNotRegistered') {
              db.collection('users').doc(slice[idx].uid).update({ fcmToken: null });
            }
          });
        }
      } catch (err) {
        functions.logger.error('Expo multicast failed', err);
      }
    }
  });

// ─────────────────────────────────────────────────────────
// SCHEDULED: expire stale requests every 15 minutes
// ─────────────────────────────────────────────────────────
export const expireStaleRequests = functions
  .region('europe-west1')
  .pubsub.schedule('every 15 minutes')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    const staleSnap = await db
      .collection('parkingRequests')
      .where('status', 'in', ['open', 'approved'])
      .where('toTime', '<', now)
      .get();

    if (staleSnap.empty) return;

    const batch = db.batch();
    const pushPromises: Promise<void>[] = [];

    staleSnap.docs.forEach((d) => {
      const data = d.data() as ParkingRequest;
      batch.update(d.ref, { status: 'expired', expiredAt: now });

      // Notify requester
      if (data.requesterId) {
        pushPromises.push(
          getToken(data.requesterId).then((token) => {
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
          getToken(data.ownerId).then((token) => {
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

    await Promise.all([batch.commit(), ...pushPromises]);
    functions.logger.info(`Expired ${staleSnap.size} stale requests`);
  });

// ─────────────────────────────────────────────────────────
// SCHEDULED: fallback broadcast for unclaimed targeted requests
//
// When a new request matches an availability window, only the
// matching owner(s) get notified. If none of them approve within
// 10 minutes, broadcast to all other owners so the requester
// isn't stuck waiting.
// Runs every 5 minutes.
// ─────────────────────────────────────────────────────────
export const broadcastUnclaimedRequests = functions
  .region('europe-west1')
  .pubsub.schedule('every 5 minutes')
  .onRun(async () => {
    const cutoff = admin.firestore.Timestamp.fromMillis(
      Date.now() - 10 * 60 * 1000 // 10 minutes ago
    );

    const snap = await db
      .collection('parkingRequests')
      .where('status', '==', 'open')
      .where('broadcastSent', '==', false)
      .where('targetedAt', '<', cutoff)
      .get();

    if (snap.empty) return;

    for (const reqDoc of snap.docs) {
      const req = reqDoc.data() as ParkingRequest;

      const ownersSnap = await db
        .collection('users')
        .where('ownedSpot', '!=', null)
        .get();

      const tokens: { token: string; uid: string }[] = [];
      for (const d of ownersSnap.docs) {
        const data = d.data() as UserDoc;
        if (d.id === req.requesterId) continue;
        if (!data.fcmToken || data.pushGeneral === false) continue;
        if (await isSpotOccupied(d.id, req.fromTime, req.toTime)) continue;
        tokens.push({ token: data.fcmToken as string, uid: d.id });
      }

      if (tokens.length > 0) {
        const BATCH = 100;
        for (let i = 0; i < tokens.length; i += BATCH) {
          const slice = tokens.slice(i, i + BATCH);
          try {
            const messages = slice.map((t) => ({
              to: t.token,
              title: `${req.requesterName} עדיין מחפש/ת חניה`,
              body: `מ-${fmtTime(req.fromTime)} עד ${fmtTime(req.toTime)}. לחץ לאישור.`,
              data: { requestId: reqDoc.id, action: 'approve' },
              sound: 'default' as const,
              channelId: 'parking_alerts',
              priority: 'high' as const,
            }));
            const res = await fetch('https://exp.host/--/api/v2/push/send', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
              body: JSON.stringify(messages),
            });
            const results = (await res.json()) as any;
            if (Array.isArray(results.data)) {
              results.data.forEach((receipt: any, idx: number) => {
                if (
                  receipt.status === 'error' &&
                  receipt.details?.error === 'DeviceNotRegistered'
                ) {
                  db.collection('users')
                    .doc(slice[idx].uid)
                    .update({ fcmToken: null });
                }
              });
            }
          } catch (err) {
            functions.logger.error('Fallback broadcast failed', err);
          }
        }
      }

      // Mark so we don't broadcast again
      await reqDoc.ref.update({ broadcastSent: true });
    }

    functions.logger.info(
      `Fallback broadcast sent for ${snap.size} unclaimed requests`
    );
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
    const israelFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const todayStr = israelFormatter.format(nowUTC); // YYYY-MM-DD
    const israelDay = new Date(
      nowUTC.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' })
    ).getDay();

    const rulesSnap = await db
      .collection('availabilityRules')
      .where('active', '==', true)
      .where('days', 'array-contains', israelDay)
      .get();

    if (rulesSnap.empty) return;

    const batch = db.batch();

    for (const d of rulesSnap.docs) {
      const rule = d.data();
      const [fh, fm] = (rule.fromHHMM as string).split(':').map(Number);
      const [th, tm] = (rule.toHHMM   as string).split(':').map(Number);

      // Build dates in Israel timezone by computing UTC offset
      const israelNow = new Date(nowUTC.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
      const offsetMs = israelNow.getTime() - nowUTC.getTime();
      const baseDate = new Date(`${todayStr}T00:00:00.000Z`);

      const fromTime = new Date(baseDate.getTime() + (fh * 60 + fm) * 60000 - offsetMs);
      const toTime   = new Date(baseDate.getTime() + (th * 60 + tm) * 60000 - offsetMs);

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
    }

    await batch.commit();
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
  .https.onCall(async (data, context) => {
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

    const token = await getToken(ping.toUid);
    if (!token) return;

    const toTime = (ping.toTime as admin.firestore.Timestamp).toDate()
      .toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

    await sendPush(
      token, ping.toUid,
      'תזכורת: זמן החניה מסתיים בקרוב',
      `החניה ${ping.spotNumber} שלך מסתיימת ב-${toTime}. אנא התכונן/י לפנות את המקום.`,
      { requestId: ping.requestId, action: 'view_active' }
    );
  });
