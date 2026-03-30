import React, { useState, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform,
  ActivityIndicator
} from 'react-native';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import { auth } from '../../config/firebase'; // וודא שהנתיב נכון
import { PhoneAuthProvider } from 'firebase/auth';

// הגדרת צבעים מקומית למניעת שגיאות undefined
const THEME_COLORS = {
  background: '#0A0A0F',
  primary: '#F5A623',
  text: '#FFFFFF',
  textSecondary: '#8E8E93',
  inputBackground: '#1C1C1E'
};

export default function PhoneScreen({ navigation }: any) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const recaptchaVerifier = useRef(null);

  const handleSendCode = async () => {
    if (!phoneNumber) return;
    setLoading(true);
    try {
      const phoneProvider = new PhoneAuthProvider(auth);
      // לוגיקת שליחת קוד...
      console.log("Sending code to:", phoneNumber);
      // navigation.navigate('Verify', { phoneNumber });
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <FirebaseRecaptchaVerifierModal
        ref={recaptchaVerifier}
        firebaseConfig={auth.app.options}
      />
      
      <View style={styles.content}>
        <Text style={styles.title}>מה המספר שלך?</Text>
        <Text style={styles.subtitle}>נשלח לך קוד אימות ב-SMS</Text>

        <TextInput
          style={styles.input}
          placeholder="מספר טלפון"
          placeholderTextColor="#666"
          keyboardType="phone-pad"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
        />

        <TouchableOpacity 
          style={styles.button} 
          onPress={handleSendCode}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.buttonText}>שלח קוד</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME_COLORS.background, // שימוש במשתנה המקומי הבטוח
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: THEME_COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: THEME_COLORS.textSecondary,
    marginBottom: 32,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    height: 56,
    backgroundColor: THEME_COLORS.inputBackground,
    borderRadius: 12,
    paddingHorizontal: 16,
    color: THEME_COLORS.text,
    fontSize: 18,
    marginBottom: 24,
    textAlign: 'right',
  },
  button: {
    width: '100%',
    height: 56,
    backgroundColor: THEME_COLORS.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
});