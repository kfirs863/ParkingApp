import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PhoneAuthProvider } from 'firebase/auth';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';

// ייבוא הקונפיגורציה והעיצוב מהפרויקט שלך
// הערה: השגיאות בתצוגה המקדימה נובעות מכך שהסביבה לא תמיד מצליחה לקשר קבצים חיצוניים, 
// אך הקוד תקין עבור הפרויקט שלך ב-Expo Go.
import { auth } from '../../config/firebase';
import { colors, spacing, typography, borderRadius } from '../../theme';

export default function PhoneScreen({ navigation }: any) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  
  // רפרנס לרכיב ה-Recaptcha שחיוני ב-Expo לאימות טלפוני
  const recaptchaVerifier = useRef<FirebaseRecaptchaVerifierModal>(null);

  /**
   * פונקציה לעיבוד מספר הטלפון לפורמט בינלאומי E.164 (+972...)
   * מוודאת שהמספר שנשלח ל-Firebase תואם למספרי הבדיקה שהגדרת.
   */
  const formatPhoneNumber = (number: string) => {
    // השארת ספרות בלבד
    let cleanNumber = number.replace(/\D/g, '');
    
    // הסרת ה-0 ההתחלתי (למשל 0528283530 הופך ל-528283530)
    if (cleanNumber.startsWith('0')) {
      cleanNumber = cleanNumber.substring(1);
    }
    
    // הוספת הקידומת הבינלאומית של ישראל
    return `+972${cleanNumber}`;
  };

  const handleContinue = async () => {
    // בדיקה בסיסית של אורך המספר (9 ספרות ללא ה-0)
    const rawDigits = phoneNumber.replace(/\D/g, '');
    if (rawDigits.length < 9) {
      Alert.alert('שגיאה', 'נא להזין מספר טלפון תקין');
      return;
    }

    setLoading(true);
    try {
      const formattedNumber = formatPhoneNumber(phoneNumber);
      console.log("מנסה לשלוח קוד למספר:", formattedNumber);
      
      // אתחול שליחת הקוד דרך Firebase
      const phoneProvider = new PhoneAuthProvider(auth);
      const verificationId = await phoneProvider.verifyPhoneNumber(
        formattedNumber,
        recaptchaVerifier.current!
      );

      setLoading(false);
      
      // מעבר למסך ה-OTP עם מזהה האימות והמספר המפורמט
      if (navigation) {
        navigation.navigate('OTP', { 
          verificationId,
          phoneNumber: formattedNumber 
        });
      }
    } catch (error: any) {
      setLoading(false);
      console.error('שגיאת אימות טלפון:', error);
      
      let errorMessage = 'לא ניתן לשלוח קוד כעת. נא לוודא חיבור לאינטרנט ולנסות שוב.';
      
      if (error.code === 'auth/invalid-phone-number') {
        errorMessage = 'מספר הטלפון שהוזן אינו תקין.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'נשלחו יותר מדי בקשות למספר הזה. נא להמתין ולנסות שוב מאוחר יותר.';
      }
      
      Alert.alert('שגיאה', errorMessage);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* רכיב ה-Recaptcha - חובה עבור Expo ו-Firebase לאימות SMS */}
      <FirebaseRecaptchaVerifierModal
        ref={recaptchaVerifier}
        firebaseConfig={auth?.app?.options || {}}
        attemptInvisibleRetries={3}
        title="אימות אבטחה"
        cancelLabel="ביטול"
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation?.goBack()}
        >
          <Ionicons name="arrow-forward" size={24} color={colors.text.primary} />
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>מה המספר שלך?</Text>
          <Text style={styles.subtitle}>נשלח לך קוד אימות ב-SMS</Text>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>מספר טלפון</Text>
          <View style={styles.phoneInputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="05X-XXXXXXX"
              placeholderTextColor={colors.text.muted}
              keyboardType="phone-pad"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              maxLength={11}
              autoFocus
            />
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.button,
              (!phoneNumber || loading) && styles.buttonDisabled,
            ]}
            onPress={handleContinue}
            disabled={!phoneNumber || loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.text.primary} />
            ) : (
              <Text style={styles.buttonText}>המשך</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.main,
  },
  content: {
    flex: 1,
    padding: spacing.xl,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  header: {
    marginBottom: spacing.xxl,
  },
  title: {
    ...typography.h1,
    color: colors.text.primary,
    textAlign: 'right',
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body1,
    color: colors.text.secondary,
    textAlign: 'right',
  },
  inputContainer: {
    marginBottom: spacing.xl,
  },
  inputLabel: {
    ...typography.caption,
    color: colors.text.secondary,
    textAlign: 'right',
    marginBottom: spacing.xs,
  },
  phoneInputWrapper: {
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 56,
    justifyContent: 'center',
  },
  input: {
    ...typography.h3,
    color: colors.text.primary,
    textAlign: 'right',
  },
  footer: {
    marginTop: 'auto',
  },
  button: {
    backgroundColor: colors.primary,
    height: 56,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  buttonDisabled: {
    backgroundColor: colors.background.card,
    elevation: 0,
  },
  buttonText: {
    ...typography.button,
    color: colors.text.primary,
  },
});