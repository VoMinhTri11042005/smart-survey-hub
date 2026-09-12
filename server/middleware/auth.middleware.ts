/**
 * Firebase Authentication middleware.
 * Uses Firebase Admin SDK when FIREBASE_SERVICE_ACCOUNT is configured.
 * Gracefully degrades: if no key is set, all requests pass through.
 */
import type { Request, Response, NextFunction } from 'express';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: { uid: string; email?: string; [key: string]: any };
    }
  }
}

let adminAuth: any = null;
let initAttempted = false;

async function getAdminAuth() {
  if (initAttempted) return adminAuth;
  initAttempted = true;

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) {
    console.log('ℹ️  FIREBASE_SERVICE_ACCOUNT not set — auth middleware disabled (all requests allowed).');
    return null;
  }

  try {
    const { cert, initializeApp, getApps } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');

    if (getApps().length === 0) {
      const parsed = JSON.parse(serviceAccount);
      initializeApp({ credential: cert(parsed) });
    }
    adminAuth = getAuth();
    console.log('✅ Firebase Admin SDK initialized — API authentication enabled.');
    return adminAuth;
  } catch (err) {
    console.warn('⚠️  Failed to initialize Firebase Admin SDK:', (err as Error).message);
    return null;
  }
}

// Initialize eagerly (non-blocking)
getAdminAuth();

/**
 * Optional auth: if token exists and is valid, attach user. Otherwise continue.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const auth = await getAdminAuth();
  if (!auth) return next();

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();

  try {
    const token = header.split('Bearer ')[1];
    const decoded = await auth.verifyIdToken(token);
    req.user = { uid: decoded.uid, email: decoded.email };
  } catch (_) {
    // Token invalid — continue without user
  }
  next();
}

/**
 * Required auth: request must have a valid Firebase token.
 * If Firebase Admin is not configured, all requests pass through (backward compatible).
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = await getAdminAuth();
  // If admin SDK not configured, skip auth entirely (backward compatible)
  if (!auth) return next();

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Yêu cầu đăng nhập.' });
  }

  try {
    const token = header.split('Bearer ')[1];
    const decoded = await auth.verifyIdToken(token);
    req.user = { uid: decoded.uid, email: decoded.email };
    next();
  } catch (_) {
    res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn.' });
  }
}
