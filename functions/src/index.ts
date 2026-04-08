import * as functions from 'firebase-functions';
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

    const pushes: Promise<void>[] = [];
    for (const d of ownersSnap.docs) {
      const data = d.data() as UserDoc;
      if (d.id === req.requesterId) continue;
      if (!data.fcmToken || data.pushGeneral === false) continue;
      if (await isSpotOccupied(d.id, req.fromTime, req.toTime)) continue;
      pushes.push(sendPush(data.fcmToken as string, d.id,
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
