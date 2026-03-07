/**
 * Verifica assinatura x-hub-signature-256 do webhook Meta (WhatsApp Cloud API)
 * Requer body bruto (Buffer) antes de parsear JSON.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { META_OAUTH_CONFIG } from '../config/constants';

export function verifyWhatsAppOfficialSignature(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const rawBody = req.body;

  if (!META_OAUTH_CONFIG.APP_SECRET) {
    console.warn('META_APP_SECRET não configurado; ignorando verificação de assinatura');
    if (Buffer.isBuffer(rawBody)) {
      try {
        (req as Request & { body: unknown }).body = JSON.parse(rawBody.toString('utf8'));
      } catch {
        (req as Request & { body: unknown }).body = {};
      }
    }
    next();
    return;
  }

  if (!signature || !signature.startsWith('sha256=')) {
    res.status(401).send('Missing or invalid signature');
    return;
  }

  const expectedSig = signature.slice(7);
  let payload: Buffer;
  if (Buffer.isBuffer(rawBody)) {
    payload = rawBody;
  } else if (typeof rawBody === 'string') {
    payload = Buffer.from(rawBody, 'utf8');
  } else {
    res.status(400).send('Raw body required for signature verification');
    return;
  }

  const hmac = crypto.createHmac('sha256', META_OAUTH_CONFIG.APP_SECRET);
  hmac.update(payload);
  const computed = hmac.digest('hex');

  if (computed.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(expectedSig, 'hex'))) {
    res.status(401).send('Invalid signature');
    return;
  }

  try {
    (req as Request & { body: unknown }).body = JSON.parse(payload.toString('utf8'));
  } catch {
    (req as Request & { body: unknown }).body = {};
  }
  next();
}
