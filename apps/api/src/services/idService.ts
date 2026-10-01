import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export async function nextPublicId(): Promise<string> {
  const seq = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const current = await tx.sequence.upsert({
      where: { name: 'complaint' },
      update: { value: { increment: 1 } },
      create: { name: 'complaint', value: 10001 },
    });
    return current.value;
  });
  return `CF-${seq}`;
}
