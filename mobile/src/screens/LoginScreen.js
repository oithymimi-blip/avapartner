import { useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useWindowDimensions
} from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { api } from '../api'
import { useAuth } from '../stores/authStore'

export function LoginScreen({ navigation }) {
  const { width } = useWindowDimensions()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const login = useAuth(state => state.login)
  const isCompact = width < 360
  const passwordInputRef = useRef(null)
  const togglePasswordVisibility = () => {
    setShowPassword(prev => {
      const next = !prev

      // Sync native prop to avoid Android secureTextEntry lag and keep cursor at the end.
      requestAnimationFrame(() => {
        const input = passwordInputRef.current
        if (input) {
          input.setNativeProps({
            secureTextEntry: !next,
            selection: { start: password.length, end: password.length }
          })
        }
      })

      return next
    })
  }

  const submit = async () => {
    if (!email || !password) {
      setError('Email and password are required.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await api().post('/api/auth/login', { email, password })
      login(response.data.token, response.data.user)
    } catch (err) {
      const serverMessage = err?.response?.data?.error
      if (serverMessage) {
        setError(serverMessage)
      } else {
        setError('Unable to reach the server. Ensure the backend is running on your LAN and try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.flex}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          isCompact && styles.containerCompact
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.card, isCompact && styles.cardCompact]}>
          <Text style={[styles.title, isCompact && styles.titleCompact]}>Sign in</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#8C9199"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, isCompact && styles.inputCompact]}
              returnKeyType="next"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                ref={passwordInputRef}
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor="#8C9199"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                autoComplete="password"
                style={[styles.input, styles.inputWithToggle, isCompact && styles.inputCompact]}
                returnKeyType="done"
                onSubmitEditing={submit}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={togglePasswordVisibility}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <EyeIcon visible={showPassword} />
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.button, isCompact && styles.buttonCompact, loading && styles.buttonDisabled]}
            onPress={submit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Login</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('ResetPassword')}>
            <Text style={styles.link}>Forgot password?</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            No account?{' '}
            <Text style={styles.footerLink} onPress={() => navigation.navigate('Signup')}>
              Sign up
            </Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function EyeIcon({ visible }) {
  const stroke = visible ? '#1d4ed8' : '#0f172a'

  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2.25 12s3.75-6.5 9.75-6.5S21.75 12 21.75 12 18 18.5 12 18.5 2.25 12 2.25 12Z"
        stroke="#0f172a"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke={stroke}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {!visible && (
        <Path
          d="m4.5 4.5 15 15"
          stroke="#1d4ed8"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </Svg>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24
  },
  containerCompact: {
    paddingHorizontal: 16,
    paddingVertical: 24
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    rowGap: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8
  },
  cardCompact: {
    borderRadius: 16,
    padding: 20,
    rowGap: 14
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a'
  },
  titleCompact: {
    fontSize: 22
  },
  field: {
    rowGap: 8
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569'
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5f5',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#0f172a',
    fontSize: 16
  },
  inputWrapper: {
    position: 'relative',
    justifyContent: 'center'
  },
  inputWithToggle: {
    paddingRight: 54
  },
  inputCompact: {
    paddingVertical: 10
  },
  eyeButton: {
    position: 'absolute',
    right: 10,
    top: '50%',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e7edf7',
    borderWidth: 1,
    borderColor: '#d0d8e8',
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ translateY: -18 }],
    elevation: 1,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 6
  },
  button: {
    backgroundColor: '#1d4ed8',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14
  },
  buttonCompact: {
    paddingVertical: 12
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16
  },
  error: {
    color: '#b91c1c',
    backgroundColor: '#fee2e2',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#fecaca'
  },
  link: {
    textAlign: 'center',
    color: '#1d4ed8',
    fontWeight: '600',
    fontSize: 14
  },
  footer: {
    marginTop: 16,
    alignItems: 'center'
  },
  footerText: {
    color: '#475569',
    fontSize: 14
  },
  footerLink: {
    color: '#1d4ed8',
    fontWeight: '600'
  }
})
