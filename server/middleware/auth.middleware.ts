import type { Request, Response, NextFunction } from 'express';
import type { Auth } from 'firebase-admin/auth';

declare global {
  namespace Express {
    interface Request {
      user?: { uid: string; email?: string; [key: string]: any };
    }
  }
}

let adminAuthPromise: Promise<Auth | null> | null = null;

function getAdminAuth(): Promise<Auth | null> {
  if (!adminAuthPromise) {
    adminAuthPromise = (async () => {
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (!serviceAccount) {
        console.log('ℹ️ FIREBASE_SERVICE_ACCOUNT not set — auth is disabled in development.');
        return null;
      }

      try {
        const [{ cert, initializeApp, getApps }, { getAuth }] = await Promise.all([
          import('firebase-admin/app'),
          import('firebase-admin/auth'),
        ]);
        if (getApps().length === 0) {
          initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
        }
        console.log('✅ Firebase Admin SDK initialized.');
        return getAuth();
      } catch (error) {
        console.error('Failed to initialize Firebase Admin SDK:', error);
        return null;
      }
    })();
  }
  return adminAuthPromise;
}

export async function assertAuthConfiguration() {
  if (process.env.NODE_ENV !== 'production') return;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is required in production.');
  }
  if (!process.env.ADMIN_EMAILS?.split(',').some(email => email.trim())) {
    throw new Error('ADMIN_EMAILS must contain at least one administrator in production.');
  }
  if (!await getAdminAuth()) {
    throw new Error('Firebase Admin could not be initialized; refusing to start without API authentication.');
  }
}

async function authenticate(req: Request, res: Response) {
  const auth = await getAdminAuth();
  if (!auth) {
    if (process.env.NODE_ENV === 'production') {
      res.status(503).json({ error: 'Dịch vụ xác thực chưa được cấu hình.' });
      return false;
    }
    return true;
  }

  const [scheme, token, ...extra] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token || extra.length > 0) {
    res.status(401).json({ error: 'Yêu cầu đăng nhập.' });
    return false;
  }

  try {
    const decoded = await auth.verifyIdToken(token);
    req.user = { uid: decoded.uid, email: decoded.email };
    return true;
  } catch {
    res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn.' });
    return false;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    if (await authenticate(req, res)) next();
  } catch (error) {
    next(error);
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    if (!await authenticate(req, res)) return;
    if (process.env.NODE_ENV !== 'production' && !process.env.FIREBASE_SERVICE_ACCOUNT) {
      next();
      return;
    }

    const admins = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map(email => email.trim().toLowerCase())
      .filter(Boolean);
    if (!req.user?.email || !admins.includes(req.user.email.toLowerCase())) {
      res.status(403).json({ error: 'Tài khoản này không có quyền quản trị.' });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
