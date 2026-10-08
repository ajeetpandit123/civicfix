import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import type { Role, User, UserStatus } from '@prisma/client';
import type { Env } from '../config/env.js';
import { hashToken, randomToken } from '../lib/crypto.js';
import { AppError, ConflictError, UnauthorizedError, ValidationError } from '../lib/errors.js';
import { emailVerificationUrl, passwordResetMail, passwordResetUrl, verificationMail } from './emailService.js';
import { deliverEmail } from './notificationService.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { writeAudit } from './auditService.js';
import { notifyMany } from './notificationService.js';

const ACCESS_TYP = 'access';
const REFRESH_COOKIE = 'cf_refresh';

export function refreshCookieName(): string {
  return REFRESH_COOKIE;
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export type AccessClaims = {
  sub: string;
  role: Role;
  email: string;
};

export async function signAccessToken(env: Env, claims: AccessClaims): Promise<string> {
  return new SignJWT({ role: claims.role, email: claims.email, typ: ACCESS_TYP })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secretKey(env.JWT_ACCESS_SECRET));
}

export async function verifyAccessToken(env: Env, token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, secretKey(env.JWT_ACCESS_SECRET));
  if (payload.typ !== ACCESS_TYP || !payload.sub || typeof payload.role !== 'string') {
    throw new UnauthorizedError('Invalid access token');
  }
  return {
    sub: payload.sub,
    role: payload.role as Role,
    email: String(payload.email ?? ''),
  };
}

export async function registerUser(env: Env, input: {
  email: string;
  password: string;
  name: string;
  phone?: string;
}): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (existing) throw new ConflictError('An account with this email already exists');

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      passwordHash,
      name: input.name,
      phone: input.phone,
      role: 'CITIZEN',
      status: 'PENDING_VERIFICATION',
    },
  });

  const verifyToken = randomToken();
  await prisma.emailVerification.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(verifyToken),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    },
  });

  // The token exists in plaintext only here; the row above stores just its hash.
  const mail = verificationMail(user.email, emailVerificationUrl(env.WEB_ORIGIN, verifyToken));
  await deliverEmail(env, mail.to, mail.subject, mail.text);
  return user;
}

/**
 * Staff registration (officer / field worker). Public input can only REQUEST one
 * of the two staff roles — never ADMIN — and the account starts as
 * PENDING_VERIFICATION with its employee profile but NO permissions, until an
 * admin approves it. Seed staff rows are direct (role known at creation time);
 * this path is the untrusted one, so nothing is granted here.
 */
export async function registerStaff(
  _env: Env,
  input: {
    role: 'OFFICER' | 'FIELD_WORKER';
    name: string;
    email: string;
    password: string;
    phone?: string;
    employeeId: string;
    designation?: string;
    organization?: string;
    departmentId: string;
    jurisdictionId?: string;
    teamId?: string;
    officeLocation?: string;
  },
): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (existing) throw new ConflictError('An account with this email already exists');

  const department = await prisma.department.findFirst({ where: { id: input.departmentId, deletedAt: null } });
  if (!department) throw new ValidationError(`Unknown department: ${input.departmentId}`);
  if (input.role === 'OFFICER') {
    const jurisdiction = await prisma.jurisdiction.findFirst({
      where: { id: input.jurisdictionId!, deletedAt: null },
    });
    if (!jurisdiction) throw new ValidationError(`Unknown jurisdiction: ${input.jurisdictionId}`);
  } else {
    const team = await prisma.fieldTeam.findFirst({ where: { id: input.teamId!, deletedAt: null } });
    if (!team) throw new ValidationError(`Unknown field team: ${input.teamId}`);
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      passwordHash,
      name: input.name,
      phone: input.phone,
      role: input.role,
      status: 'PENDING_VERIFICATION',
    },
  });

  if (input.role === 'OFFICER') {
    await prisma.officerProfile.create({
      data: {
        userId: user.id,
        departmentId: department.id,
        jurisdictionId: input.jurisdictionId!,
        title: input.designation ?? 'Municipal Officer',
        employeeId: input.employeeId,
        designation: input.designation,
        organization: input.organization,
        officeLocation: input.officeLocation,
        isActive: true,
      },
    });
  } else {
    await prisma.fieldWorkerProfile.create({
      data: {
        userId: user.id,
        teamId: input.teamId ?? null,
        employeeId: input.employeeId,
        designation: input.designation,
        organization: input.organization,
        isActive: true,
      },
    });
  }

  await writeAudit({
    actorId: user.id,
    action: 'staff.request',
    entityType: 'User',
    entityId: user.id,
    metadata: { role: input.role, employeeId: input.employeeId, departmentId: department.id },
  });

  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE', deletedAt: null } });
  await notifyMany(
    admins.map((a) => a.id),
    {
      type: 'VERIFICATION_REQUIRED',
      title: 'New staff verification request',
      body: `${user.name} (${input.role}, employee ID ${input.employeeId}) is waiting for approval.`,
    },
  );

  return user;
}

export async function authenticate(
  env: Env,
  email: string,
  password: string,
  meta: { userAgent?: string; ip?: string },
): Promise<{ user: User; accessToken: string; refreshToken: string }> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || user.deletedAt) throw new UnauthorizedError('Invalid email or password');
  if (user.status === 'DISABLED') throw new UnauthorizedError('This account has been disabled');

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new UnauthorizedError('Invalid email or password');

  const accessToken = await signAccessToken(env, {
    sub: user.id,
    role: user.role,
    email: user.email,
  });
  const refreshToken = randomToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400000),
      userAgent: meta.userAgent?.slice(0, 300),
      ip: meta.ip?.slice(0, 64),
    },
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { user, accessToken, refreshToken };
}

export async function rotateRefreshToken(
  env: Env,
  refreshToken: string,
  meta: { userAgent?: string; ip?: string },
): Promise<{ user: User; accessToken: string; refreshToken: string }> {
  const tokenHash = hashToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new UnauthorizedError('Invalid refresh token');
  }
  if (stored.user.status === 'DISABLED' || stored.user.deletedAt) {
    throw new UnauthorizedError('Account unavailable');
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const next = randomToken();
  await prisma.refreshToken.create({
    data: {
      userId: stored.userId,
      tokenHash: hashToken(next),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400000),
      userAgent: meta.userAgent?.slice(0, 300),
      ip: meta.ip?.slice(0, 64),
    },
  });

  const accessToken = await signAccessToken(env, {
    sub: stored.user.id,
    role: stored.user.role,
    email: stored.user.email,
  });
  return { user: stored.user, accessToken, refreshToken: next };
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const tokenHash = hashToken(refreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function verifyEmail(token: string): Promise<void> {
  const stored = await prisma.emailVerification.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
    throw new AppError(400, 'Invalid or expired verification token', 'INVALID_TOKEN');
  }
  await prisma.$transaction([
    prisma.emailVerification.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
    prisma.user.update({
      where: { id: stored.userId },
      data: { emailVerifiedAt: new Date(), status: 'ACTIVE' },
    }),
  ]);
}

export async function requestPasswordReset(env: Env, email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || user.deletedAt) return;
  const token = randomToken();
  await prisma.passwordReset.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    },
  });
  logger.info({ to: user.email }, 'password_reset_issued');

  // Only the hash is persisted, so the link must leave the process right now.
  const mail = passwordResetMail(user.email, passwordResetUrl(env.WEB_ORIGIN, token));
  await deliverEmail(env, mail.to, mail.subject, mail.text);
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const stored = await prisma.passwordReset.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
    throw new AppError(400, 'Invalid or expired reset token', 'INVALID_TOKEN');
  }
  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.passwordReset.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: stored.userId }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

export function publicUser(user: User): {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
} {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
  };
}
