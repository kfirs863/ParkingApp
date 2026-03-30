# 🏠 Android Widget — ספירה לאחור של החניה

Widget קטן על מסך הבית שמציג: מספר חניה + זמן שנותר.

---

## ⚠️ דרישה: Expo Bare Workflow

Widget אנדרואיד דורש קוד Kotlin נייטיב.  
לא ניתן ב-Expo Go — צריך לבצע eject:

```bash
npx expo prebuild --platform android
```

---

## 📦 תלויות

```bash
npm install @boltfoundry/expo-android-widget
# או אלטרנטיבה:
npm install react-native-android-widget
```

---

## 📁 קבצים שנוצרים

```
android/app/src/main/
├── java/com/parkingapp/
│   ├── ParkingWidgetProvider.kt      ← לוגיקה של Widget
│   └── ParkingWidgetUpdateService.kt ← עדכון ב-background
├── res/
│   ├── layout/
│   │   └── parking_widget.xml        ← עיצוב ה-Widget
│   └── xml/
│       └── parking_widget_info.xml   ← הגדרות
└── AndroidManifest.xml               ← רישום
```

---

## 🔧 `ParkingWidgetProvider.kt`

```kotlin
package com.parkingapp

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import java.util.concurrent.TimeUnit

class ParkingWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        val prefs = context.getSharedPreferences("parking_widget", Context.MODE_PRIVATE)
        val spotNumber  = prefs.getString("spot_number", null)
        val toTimeMs    = prefs.getLong("to_time_ms", 0L)
        val isActive    = prefs.getBoolean("is_active", false)

        for (widgetId in appWidgetIds) {
            val views = RemoteViews(context.packageName, R.layout.parking_widget)

            if (isActive && spotNumber != null && toTimeMs > System.currentTimeMillis()) {
                val remaining = toTimeMs - System.currentTimeMillis()
                val hours   = TimeUnit.MILLISECONDS.toHours(remaining)
                val minutes = TimeUnit.MILLISECONDS.toMinutes(remaining) % 60
                val display = if (hours > 0) "%d:%02d ש'".format(hours, minutes)
                              else "%d דק'".format(minutes + 1)

                views.setTextViewText(R.id.widget_spot,   "🅿️ $spotNumber")
                views.setTextViewText(R.id.widget_timer,  display)
                views.setTextViewText(R.id.widget_label,  "זמן שנותר")
                views.setInt(R.id.widget_root, "setBackgroundColor", 0xFF13131A.toInt())
            } else {
                views.setTextViewText(R.id.widget_spot,  "🅿️ —")
                views.setTextViewText(R.id.widget_timer, "אין חניה פעילה")
                views.setTextViewText(R.id.widget_label, "")
            }

            appWidgetManager.updateAppWidget(widgetId, views)
        }
    }
}
```

---

## 🎨 `res/layout/parking_widget.xml`

```xml
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:gravity="center"
    android:padding="12dp"
    android:background="#13131A">

    <TextView
        android:id="@+id/widget_spot"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:textColor="#F0F0F5"
        android:textSize="18sp"
        android:fontFamily="sans-serif-medium" />

    <TextView
        android:id="@+id/widget_timer"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:textColor="#F5A623"
        android:textSize="28sp"
        android:fontFamily="sans-serif-black"
        android:layout_marginTop="4dp" />

    <TextView
        android:id="@+id/widget_label"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:textColor="#8888A0"
        android:textSize="11sp"
        android:layout_marginTop="2dp" />

</LinearLayout>
```

---

## 📡 חיבור מ-React Native → Widget

כשחניה נהיית פעילה, שמור ב-SharedPreferences כדי שה-Widget יקרא:

```typescript
// src/hooks/useWidgetSync.ts
import { NativeModules } from 'react-native';
import { ParkingRequest } from './useParking';

export async function syncWidgetData(session: ParkingRequest | null): Promise<void> {
  try {
    if (session?.status === 'confirmed') {
      await NativeModules.SharedPrefs?.set({
        spot_number: session.spotNumber,
        to_time_ms:  String(session.toTime.getTime()),
        is_active:   'true',
      });
    } else {
      await NativeModules.SharedPrefs?.set({ is_active: 'false' });
    }
    // Trigger widget refresh
    await NativeModules.WidgetManager?.updateWidgets();
  } catch {
    // Widget sync is best-effort — don't crash the app
  }
}
```

קרא ל-`syncWidgetData(session)` ב-`ActiveParkingCard` בכל שינוי ב-`session`.

---

## ⏱️ עדכון אוטומטי

ב-`parking_widget_info.xml` הגדר עדכון כל דקה:
```xml
<appwidget-provider
    android:updatePeriodMillis="60000"
    android:minWidth="180dp"
    android:minHeight="90dp" />
```

---

## 📋 סיכום שלבים

1. `npx expo prebuild --platform android`
2. צור את קבצי ה-Kotlin ו-XML מהדוגמאות למעלה
3. רשם את ה-Provider ב-`AndroidManifest.xml`
4. קרא ל-`syncWidgetData` ב-`ActiveParkingCard` כשיש session פעיל
5. `npx expo run:android`
