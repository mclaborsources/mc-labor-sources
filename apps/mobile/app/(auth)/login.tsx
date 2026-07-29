import { useEffect, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Linking,
  ActivityIndicator,
  type TextInputProps,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { BRAND_PHONE, BRAND_PHONE_HREF, fonts, FF, cardShadow, accents, type AccentKey } from '@/theme/brand';
import { AuthAppHeader, AuthHero, ErrorBanner, InfoBanner, Screen, screenLayout } from '@/components/ui';
import { signIn, getMe } from '@/lib/api';
import { registerForPushNotifications } from '@/lib/push';
import { useAuth } from '@/context/AuthContext';

function LoginField({
  icon,
  accent = 'blue',
  trailing,
  ...props
}: TextInputProps & {
  icon: keyof typeof Ionicons.glyphMap;
  accent?: AccentKey;
  trailing?: ReactNode;
}) {
  const tone = accents[accent];
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.fieldTile, focused && { borderColor: tone.border }, cardShadow]}>
      <LinearGradient colors={tone.gradient} style={styles.fieldIcon}>
        <Ionicons name={icon} size={20} color="#fff" />
      </LinearGradient>
      <TextInput
        {...props}
        style={styles.fieldInput}
        placeholderTextColor={FF.textMuted}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
      />
      {trailing}
    </View>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const { error } = useLocalSearchParams<{ error?: string }>();
  const { refresh, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (error === 'not-worker' || error === 'not-mobile') signOut();
  }, [error, signOut]);

  const onSubmit = async () => {
    setFormError('');
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      await refresh();
      const profile = await getMe();
      if (profile.role === 'WORKER') {
        await registerForPushNotifications(profile.id).catch(() => {});
        router.replace('/(tabs)/assignments');
      } else if (profile.role === 'SUPERVISOR') {
        await registerForPushNotifications(profile.id).catch(() => {});
        router.replace('/(supervisor)/timesheets');
      } else {
        await signOut();
        setFormError('This account uses the web portal. Workers and supervisors can sign in here.');
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const tone = accents.blue;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <AuthAppHeader />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <Screen scroll contentContainerStyle={styles.screenContent}>
          <AuthHero />

          <View style={screenLayout.sectionHead}>
            <Text style={screenLayout.sectionLabel}>Sign in</Text>
            <View style={screenLayout.sectionPill}>
              <Ionicons name="lock-closed-outline" size={12} color={FF.primary} />
              <Text style={screenLayout.sectionPillText}>Secure access</Text>
            </View>
          </View>

          {error === 'not-worker' || error === 'not-mobile' ? (
            <InfoBanner message="Workers and supervisors only — admins and customers should use the web portal." />
          ) : null}

          <LoginField
            icon="mail-outline"
            accent="blue"
            placeholder="Email or training account name"
            autoCapitalize="none"
            keyboardType="default"
            autoComplete="username"
            value={email}
            onChangeText={setEmail}
            returnKeyType="next"
          />

          <LoginField
            icon="lock-closed-outline"
            accent="indigo"
            placeholder="Password"
            secureTextEntry={!showPassword}
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
            returnKeyType="go"
            onSubmitEditing={onSubmit}
            trailing={
              <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={FF.textMuted} />
              </Pressable>
            }
          />

          <ErrorBanner message={formError} />

          <Pressable
            style={({ pressed }) => [styles.signInTile, pressed && styles.signInPressed, loading && styles.signInDisabled]}
            onPress={onSubmit}
            disabled={loading}
          >
            <LinearGradient colors={tone.gradient} style={styles.signInGradient}>
              <View style={styles.signInIcon}>
                <Ionicons name="log-in-outline" size={20} color="#fff" />
              </View>
              {loading ? (
                <ActivityIndicator color="#fff" style={styles.signInSpinner} />
              ) : (
                <Text style={styles.signInLabel}>Sign In</Text>
              )}
              <View style={styles.signInChevron}>
                <Ionicons name="chevron-forward" size={14} color="#fff" />
              </View>
            </LinearGradient>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.helpTile, pressed && styles.helpPressed, cardShadow]}
            onPress={() => Linking.openURL(BRAND_PHONE_HREF)}
          >
            <LinearGradient colors={accents.green.gradient} style={styles.fieldIcon}>
              <Ionicons name="call-outline" size={20} color="#fff" />
            </LinearGradient>
            <View style={styles.helpTextBlock}>
              <Text style={styles.helpLabel}>Need help?</Text>
              <Text style={styles.helpPhone}>{BRAND_PHONE}</Text>
            </View>
            <View style={[styles.helpChevron, { backgroundColor: accents.green.bg }]}>
              <Ionicons name="chevron-forward" size={14} color={accents.green.color} />
            </View>
          </Pressable>

          <Text style={styles.copyright}>© {new Date().getFullYear()} MC Labor Sources Inc.</Text>
        </Screen>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  screenContent: {
    paddingBottom: 32,
  },
  fieldTile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: FF.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: FF.border,
    padding: 12,
    paddingRight: 14,
    marginBottom: 12,
  },
  fieldIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  fieldInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: FF.text,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },
  eyeBtn: {
    padding: 6,
    marginLeft: 4,
  },
  signInTile: {
    borderRadius: 24,
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 12,
    ...cardShadow,
  },
  signInGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingRight: 14,
  },
  signInIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  signInLabel: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: '#fff',
  },
  signInChevron: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  signInSpinner: {
    flex: 1,
    alignItems: 'flex-start',
  },
  signInPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.985 }],
  },
  signInDisabled: {
    opacity: 0.8,
  },
  helpTile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: FF.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: FF.border,
    padding: 16,
    marginBottom: 8,
  },
  helpPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.985 }],
  },
  helpTextBlock: {
    flex: 1,
  },
  helpLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: FF.textMuted,
  },
  helpPhone: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: FF.text,
    marginTop: 2,
  },
  helpChevron: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyright: {
    marginTop: 16,
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 11,
    color: FF.textMuted,
  },
});
