// Only these screens may be used without a registered, signed-in account.
const PUBLIC = new Set(['home', 'positions', 'privacy', 'login', 'register', 'reset']);
export const isPublic = route => PUBLIC.has(route.split('/')[0]);
export function safeDestination(route) {
  if (typeof route !== 'string' || !/^(dashboard|positions|applications(?:\/[A-Za-z0-9_-]{1,160})?|application\/[A-Za-z0-9_-]{1,160}|notifications|account|sessions|reports|vacancies)$/.test(route)) return 'dashboard';
  return route;
}
export function accountGate({route, user, mfaPending = false}) {
  const page = route.split('/')[0];
  if (page === 'mfa') return mfaPending ? 'mfa' : 'login';
  if (isPublic(route)) return 'public';
  if (!user) return 'login';
  if (!user.emailVerified) return 'verify';
  return 'protected';
}
export function validateRegistration({name, email, password, confirmPassword, consent}) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 150) return 'Enter your full name (up to 150 characters).';
  if (typeof email !== 'string' || !email.trim()) return 'Enter your email address.';
  if (typeof password !== 'string' || password.length < 12) return 'Use a password of at least 12 characters.';
  if (password !== confirmPassword) return 'Passwords do not match.';
  if (!consent) return 'Read and accept the privacy information to continue.';
  return null;
}
