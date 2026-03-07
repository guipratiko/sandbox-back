import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import * as asaasCheckoutService from '../services/asaasCheckoutService';
import User from '../models/User';
import mongoose from 'mongoose';
import { getIO } from '../socket/socketServer';

/** POST /scraping-flow/checkout - Cria checkout Asaas e retorna o link (usuário autenticado). */
export async function createCheckout(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const e: AppError = new Error('Usuário não identificado');
      e.statusCode = 401;
      return next(e);
    }
    const packageKey = req.body?.package as string;
    if (packageKey !== '25' && packageKey !== '50') {
      const e: AppError = new Error('package deve ser "25" ou "50"');
      e.statusCode = 400;
      return next(e);
    }
    const result = await asaasCheckoutService.createCheckout(userId, packageKey as '25' | '50');
    res.json({ status: 'success', data: { link: result.link, checkoutId: result.id } });
  } catch (error) {
    next(error);
  }
}

/** Payload do webhook Asaas (CHECKOUT_PAID) ou payload alternativo com userId. */
interface AsaasCheckoutWebhookPayload {
  event?: string;
  userId?: string;
  value?: number;
  credits?: number;
  checkout?: {
    items?: Array<{ externalReference?: string; value?: number; quantity?: number }>;
  };
}

async function creditUser(userId: string, creditsToAdd: number): Promise<boolean> {
  if (creditsToAdd <= 0) return false;
  const idStr = String(userId).trim();
  if (!idStr || !mongoose.Types.ObjectId.isValid(idStr)) {
    console.warn('[AsaasCheckout] creditUser: userId inválido ou vazio', { userId: idStr });
    return false;
  }
  const userObjectId = new mongoose.Types.ObjectId(idStr);
  const updated = await User.findByIdAndUpdate(
    userObjectId,
    { $inc: { scrapingCredits: creditsToAdd } },
    { new: true }
  ).select('scrapingCredits');
  if (!updated) {
    console.warn('[AsaasCheckout] creditUser: usuário não encontrado no MongoDB', { userId: idStr });
    return false;
  }
  const newCredits = Number(updated.scrapingCredits) || 0;
  try {
    const io = getIO();
    io.to(idStr).emit('scraping-credits-updated', { credits: newCredits });
  } catch {
    // ignore socket errors
  }
  return true;
}

/** Normaliza payload: aceita objeto direto, { body: {...} } ou [{ body: {...} }] (formato Asaas/API Gateway). */
function normalizeWebhookBody(raw: unknown): AsaasCheckoutWebhookPayload {
  if (Array.isArray(raw) && raw.length > 0 && raw[0] && typeof raw[0] === 'object' && 'body' in raw[0]) {
    return (raw[0] as { body: AsaasCheckoutWebhookPayload }).body;
  }
  if (raw && typeof raw === 'object' && 'body' in raw && typeof (raw as { body: unknown }).body === 'object') {
    return (raw as { body: AsaasCheckoutWebhookPayload }).body;
  }
  return (raw as AsaasCheckoutWebhookPayload) || {};
}

/** POST /webhook/asaas-checkout - Recebe CHECKOUT_PAID do Asaas ou payload com userId + value/credits e adiciona créditos. */
export async function receiveAsaasCheckoutWebhook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = normalizeWebhookBody(req.body);

    // Formato alternativo: { userId, value } ou { userId, credits } — identifica explicitamente o usuário a ser creditado
    if (body.userId) {
      const userId = String(body.userId).trim();
      const numCredits = Number(body.credits);
      const numValue = Number(body.value);
      let creditsToAdd = 0;
      if (Number.isFinite(numCredits) && numCredits > 0) {
        creditsToAdd = Math.floor(numCredits);
      } else if (Number.isFinite(numValue) && numValue > 0) {
        creditsToAdd = asaasCheckoutService.valueToCredits(numValue);
      }
      if (userId && creditsToAdd > 0) {
        await creditUser(userId, creditsToAdd);
      }
      res.status(200).json({ received: true });
      return;
    }

    // Formato Asaas: checkout.items[].externalReference (userId) e value — com ou sem event CHECKOUT_PAID
    const items = body.checkout?.items;
    if (!items?.length) {
      res.status(200).json({ received: true });
      return;
    }

    for (const item of items) {
      const userId = item.externalReference;
      const value = Number(item.value) || 0;
      const quantity = Number(item.quantity) || 1;
      if (!userId || value <= 0) continue;

      const creditsToAdd = asaasCheckoutService.valueToCredits(value) * quantity;
      if (creditsToAdd <= 0) continue;

      await creditUser(userId, creditsToAdd);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
}
