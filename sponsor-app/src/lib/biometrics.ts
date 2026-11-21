import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export type BiometricAvailability =
  | { available: true; enrolled: boolean; type: LocalAuthentication.AuthenticationType[] }
  | { available: false };

/**
 * Check whether the device supports biometric authentication (Face ID /
 * Touch ID on iOS) and whether the user has enrolled a biometric.
 */
export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return { available: false };

  const enrolled = await LocalAuthentication.isEnrolledAsync();
  const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
  return { available: true, enrolled, type: supportedTypes };
}

/**
 * Prompt the user for biometric authentication.
 *
 * Returns `true` when the local authentication prompt succeeds. When the
 * device has no biometrics enrolled, callers should fall back to a PIN or
 * device passcode flow.
 */
export async function authenticateWithBiometrics(
  promptMessage = 'Unlock your sponsorship wallet'
): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    cancelLabel: 'Cancel',
    fallbackLabel: 'Use passcode',
    disableDeviceFallback: false,
  });
  return result.success;
}

/**
 * Human-readable label for the device's strongest supported biometric.
 *
 * iOS uses Apple's trademarked names (Face ID / Touch ID); Android has no
 * equivalent trademark, so it gets platform-neutral labels instead of
 * incorrectly borrowing Apple's terms.
 */
export function biometricLabel(types: LocalAuthentication.AuthenticationType[]): string {
  const isAndroid = Platform.OS === 'android';
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return isAndroid ? 'Face unlock' : 'Face ID';
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return isAndroid ? 'Fingerprint' : 'Touch ID';
  }
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return 'Iris';
  }
  return isAndroid ? 'Biometric unlock' : 'Biometrics';
}
