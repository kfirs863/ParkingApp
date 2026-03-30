# 🚀 מדריך הפעלה מלא — ParkingApp

---

## שלב 1 — דרישות מקדימות

התקן את הכלים הבאים אם עדיין אין לך אותם:

```bash
# Node.js (גרסה 18 ומעלה)
# הורד מ: https://nodejs.org

# בדוק שהתקנה הצליחה:
node -v   # צריך להיות v18.x.x או מעלה
npm -v

# Expo CLI
npm install -g expo-cli eas-cli

# Firebase CLI
npm install -g firebase-tools

# בדוק:
expo --version
firebase --version
```

---

## שלב 2 — יצירת פרויקט Expo

```bash
# צור פרויקט חדש בתיקייה שתרצה
npx create-expo-app ParkingApp --template blank-typescript
cd ParkingApp

# מחק את App.tsx שנוצר אוטומטית — נחליף בקוד שלנו
rm App.tsx
```

העתק את כל הקבצים שבנינו לתוך התיקייה:
```
ParkingApp/
├── App.tsx
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── functions/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── index.ts
└── src/
    └── (כל שאר הקבצים)
```

---

## שלב 3 — התקנת תלויות של האפליקציה

```bash
# בתוך תיקיית ParkingApp:
npm install \
  @react-navigation/native \
  @react-navigation/native-stack \
  @react-navigation/bottom-tabs \
  react-native-screens \
  react-native-safe-area-context \
  firebase \
  expo-status-bar \
  expo-notifications \
  @react-native-async-storage/async-storage

# בדוק שהכל עבר בלי שגיאות:
npm list --depth=0
```

---

## שלב 4 — הגדרת Firebase

### 4א — צור פרויקט Firebase

1. כנס ל־ [console.firebase.google.com](https://console.firebase.google.com)
2. לחץ **"Add project"**
3. שם: `parking-app` (או כל שם שתרצה)
4. בחר **לא** להפעיל Google Analytics (לא נחוץ)
5. לחץ **"Create project"**

### 4ב — הפעל Authentication

1. בתפריט השמאלי: **Build → Authentication**
2. לחץ **"Get started"**
3. לחץ על **Phone** → **Enable** → **Save**

### 4ג — הפעל Firestore

1. **Build → Firestore Database**
2. **"Create database"**
3. בחר **"Start in production mode"** (נעלה את ה-rules בשלב הבא)
4. Region: **europe-west1** (הכי קרוב לישראל)

### 4ד — קבל את ה-Config

1. בדף הראשי של Firebase: לחץ על **⚙️ Project settings**
2. גלול למטה ל-**"Your apps"**
3. לחץ על **"</> Web"**
4. שם: `parking-web-config` → **Register app**
5. העתק את ה-`firebaseConfig` שמופיע

### 4ה — עדכן `src/config/firebase.ts`

פתח את הקובץ והחלף:
```typescript
const firebaseConfig = {
  apiKey:            "AIza...",          // ← מה שהעתקת
  authDomain:        "parking-app-xxx.firebaseapp.com",
  projectId:         "parking-app-xxx",
  storageBucket:     "parking-app-xxx.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123...:web:abc..."
};
```

### 4ו — חבר את ה-Firebase CLI לפרויקט

```bash
# התחבר לחשבון Google
firebase login

# אתחל את הפרויקט (בתוך תיקיית ParkingApp)
firebase init

# בחר (Space לסימון, Enter לאישור):
#  ✅ Firestore
#  ✅ Functions
#  ✅ Emulators

# שאלות:
#  "Use an existing project" → בחר את parking-app שיצרת
#  Firestore rules file: firestore.rules  (Enter)
#  Firestore indexes file: firestore.indexes.json  (Enter)
#  Language for functions: TypeScript  (Enter)
#  Use ESLint: No  (Enter)
#  Install dependencies: Yes  (Enter)
#  Emulators: Auth, Firestore, Functions  (Space לסמן כולם → Enter)
```

---

## שלב 5 — הפעלת הבקאנד (Cloud Functions)

```bash
# עבור לתיקיית functions והתקן תלויות
cd functions
npm install
cd ..

# בנה את ה-TypeScript
cd functions && npm run build && cd ..

# Deploy ל-Firebase (פעם ראשונה לוקח ~3 דקות)
firebase deploy --only firestore:rules,firestore:indexes,functions
```

אם הכל עבר תראה:
```
✔  Deploy complete!
```

---

## שלב 6 — הגדרת Expo Push Notifications

```bash
# התחבר ל-Expo
eas login

# הגדר את הפרויקט
eas init

# זה ייצור project ID — העתק אותו
```

פתח `src/hooks/usePushNotifications.ts` ועדכן:
```typescript
const tokenData = await Notifications.getExpoPushTokenAsync({
  projectId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // ← Project ID מ-eas init
});
```

---

## שלב 7 — הרצה על מכשיר אמיתי (מומלץ לבדיקה)

### אפשרות א׳ — Expo Go (הכי מהיר, ללא Push)

```bash
# בתוך תיקיית ParkingApp
npx expo start

# סרוק את ה-QR עם אפליקציית "Expo Go" מה-Play Store
```

> ⚠️ **מגבלה:** Push Notifications לא עובד ב-Expo Go.
> לבדיקת Push — השתמש באפשרות ב׳.

### אפשרות ב׳ — APK לבדיקה מלאה (כולל Push)

```bash
# בנה APK לבדיקה (לוקח ~10 דקות, חינמי)
eas build --platform android --profile preview

# בסיום תקבל קישור להורדת ה-APK
# שלח אותו לעצמך ב-WhatsApp / Email והתקן על המכשיר
```

**לפני הבנייה**, וודא שיש `eas.json` בתיקייה הראשית:
```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "aab"
      }
    }
  }
}
```

```bash
# צור אותו אוטומטית:
eas build:configure
```

---

## שלב 8 — בדיקת Firebase Auth (OTP)

Firebase Phone Auth דורש אישור נוסף:

1. **Firebase Console → Authentication → Settings → Authorized domains**
2. וודא שיש את הדומיין `localhost` (לפיתוח)

**לבדיקה ללא SMS אמיתי** (חוסך עלויות):
1. **Authentication → Sign-in method → Phone**
2. גלול ל-**"Phone numbers for testing"**
3. הוסף: `+972500000000` עם קוד `123456`
4. השתמש במספר הזה כשתבדוק את ה-Onboarding

---

## שלב 9 — בדיקה עם Firebase Emulator (אופציונלי אבל מומלץ)

במקום לעבוד מול Firebase אמיתי בזמן פיתוח:

```bash
# הפעל את ה-Emulator Suite
firebase emulators:start

# תראה משהו כזה:
# ┌─────────────────────────────────────────────────────────┐
# │ All emulators ready! It is now safe to connect your app │
# ├────────────┬────────────────┬─────────────────────────  │
# │ Emulator   │ Host:Port      │ View in Emulator UI       │
# ├────────────┼────────────────┼─────────────────────────  │
# │ auth       │ localhost:9099 │ http://localhost:4000/auth │
# │ functions  │ localhost:5001 │                           │
# │ firestore  │ localhost:8080 │                           │
# └────────────┴────────────────┴─────────────────────────  │
```

פתח את `src/config/firebase.ts` והוסף **זמנית** (לפיתוח בלבד):
```typescript
// הוסף אחרי initializeApp:
if (__DEV__) {
  const { connectAuthEmulator } = require('firebase/auth');
  const { connectFirestoreEmulator } = require('firebase/firestore');
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFirestoreEmulator(db, 'localhost', 8080);
}
```

פתח דפדפן בכתובת: `http://localhost:4000` — תוכל לראות ולערוך את ה-Firestore ישירות.

---

## שלב 10 — סדר הבדיקה המומלץ

### בדיקה ראשונה — משתמש בודד

1. פתח את האפליקציה
2. הירשם עם מספר הטסט `+972500000000` וקוד `123456`
3. מלא פרופיל: שם, מגדל 1, דירה 1, חניה 42
4. לחץ "בקש חניה" → שלח בקשה ל-2 שעות מעכשיו
5. עבור ל-**Firebase Console → Firestore** וראה שנוצר document ב-`parkingRequests`

### בדיקה שנייה — שני משתמשים

השתמש בשני מכשירים (או מכשיר + אמולטור):

**מכשיר א׳ (בעל חניה):**
1. הירשם עם `+972500000001` / קוד `123456`
2. פרופיל: דירה 2, חניה 43

**מכשיר ב׳ (מבקש חניה):**
1. הירשם עם `+972500000002` / קוד `123456`
2. שלח בקשת חניה

**ואז:**
- מכשיר א׳ יקבל Push → ילחץ "אשר"
- מכשיר ב׳ יקבל Push → יכניס לוחית → חניה פעילה ✓

---

## שלב 11 — Deploy לפרודקשן (כשמוכן)

```bash
# בנה APK לפרודקשן
eas build --platform android --profile production

# זה יוצר .aab — אפשר להעלות ל-Google Play
# או לשלוח APK ישירות לדיירים ב-WhatsApp
```

---

## בעיות נפוצות

| בעיה | פתרון |
|------|--------|
| `Firebase: Error (auth/operation-not-allowed)` | הפעל Phone Auth ב-Firebase Console |
| OTP לא מגיע | השתמש במספרי טסט (שלב 8) |
| Push לא מגיע | חייב APK אמיתי, לא Expo Go |
| `DUPLICATE_REQUEST` מיד בפתיחה | ב-Firestore מחק documents ישנים מ-`parkingRequests` |
| Functions לא עובדות | `firebase deploy --only functions` מחדש |
| `Cannot find module` | `npm install` מחדש |

---

## סיכום — מה להפעיל בכל פעם

```bash
# פיתוח יומיומי:
firebase emulators:start        # בחלון אחד
npx expo start                  # בחלון שני

# אחרי שינוי ב-functions:
cd functions && npm run build && cd ..
firebase deploy --only functions

# שינוי ב-rules:
firebase deploy --only firestore:rules

# בנייה לבדיקה על מכשיר:
eas build --platform android --profile preview
```
