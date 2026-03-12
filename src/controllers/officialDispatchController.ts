/**
 * Disparo em massa de templates (API Oficial): cota por tier e envio.
 */

import { Response, NextFunction } from 'express';
import axios from 'axios';
import mongoose from 'mongoose';
import Instance from '../models/Instance';
import OfficialDispatchUsage from '../models/OfficialDispatchUsage';
import { AuthRequest } from '../middleware/auth';
import { validateAndConvertUserId } from '../utils/helpers';
import { OFFICIAL_API_CLERKY_URL, OFFICIAL_API_CLERKY_API_KEY } from '../config/constants';
import { createNotFoundError, createValidationError, handleControllerError } from '../utils/errorHelpers';

const BASE = (OFFICIAL_API_CLERKY_URL || '').replace(/\/$/, '');

/** Converte tier da Meta (ex: TIER_250, TIER_1K) para número. */
function tierToNumber(tier?: string): number {
  if (!tier || typeof tier !== 'string') return 0;
  const u = tier.toUpperCase();
  const match = u.match(/TIER_(\d+)([K]?)/);
  if (!match) return 0;
  const num = parseInt(match[1], 10);
  const k = match[2] === 'K';
  return k ? num * 1000 : num;
}

/** Data atual em YYYY-MM-DD (UTC). */
function todayKey(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

async function getInstanceOfficial(req: AuthRequest): Promise<{
  instanceId: mongoose.Types.ObjectId;
  phone_number_id: string;
  meta_access_token?: string | null;
}> {
  const userId = req.user?.id;
  const userObjectId = validateAndConvertUserId(userId);
  const { id } = req.params;
  const instance = await Instance.findOne({ _id: id, userId: userObjectId });
  if (!instance) throw createNotFoundError('Instância');
  if (instance.integration !== 'WHATSAPP-CLOUD') {
    throw createValidationError('Apenas instâncias da API Oficial');
  }
  const phone_number_id = (instance as any).phone_number_id ?? (instance as any).instanceId;
  if (!phone_number_id) throw createValidationError('Instância sem phone_number_id');
  return {
    instanceId: instance._id,
    phone_number_id,
    meta_access_token: (instance as any).meta_access_token ?? null,
  };
}

/** GET /instances/:id/official-dispatch-quota — cota disponível (tier - usado hoje). */
export const getOfficialDispatchQuota = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { instanceId, phone_number_id } = await getInstanceOfficial(req);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (OFFICIAL_API_CLERKY_API_KEY) headers['x-api-key'] = OFFICIAL_API_CLERKY_API_KEY;

    const settingsRes = await axios.get<{ messaging_limit_tier?: string }>(`${BASE}/api/phone/${phone_number_id}/settings`, {
      headers,
      timeout: 15000,
    });
    const tier = settingsRes.data?.messaging_limit_tier;
    const tierNumber = tierToNumber(tier);

    const date = todayKey();
    const usageDoc = await OfficialDispatchUsage.findOne({ instanceId, date });
    const usedToday = usageDoc?.count ?? 0;
    const remaining = Math.max(0, tierNumber - usedToday);

    res.status(200).json({
      status: 'success',
      data: {
        tier: tier || null,
        tierNumber,
        usedToday,
        remaining,
      },
    });
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.data?.message) {
      return next(createValidationError(error.response.data.message));
    }
    return next(handleControllerError(error, 'Erro ao obter cota de disparo'));
  }
};

export interface OfficialDispatchRecipient {
  to: string;
  body_params: string[];
}

/** POST /instances/:id/official-dispatches — envia template em massa. */
export const sendOfficialDispatches = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { instanceId, phone_number_id, meta_access_token } = await getInstanceOfficial(req);
    const { template_name, language_code, recipients } = req.body as {
      template_name?: string;
      language_code?: string;
      recipients?: OfficialDispatchRecipient[];
    };

    if (!template_name || !language_code || !Array.isArray(recipients) || recipients.length === 0) {
      return next(createValidationError('template_name, language_code e recipients (array) são obrigatórios'));
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (OFFICIAL_API_CLERKY_API_KEY) headers['x-api-key'] = OFFICIAL_API_CLERKY_API_KEY;

    const settingsRes = await axios.get<{ messaging_limit_tier?: string }>(`${BASE}/api/phone/${phone_number_id}/settings`, {
      headers,
      timeout: 15000,
    });
    const tierNumber = tierToNumber(settingsRes.data?.messaging_limit_tier);
    const date = todayKey();
    const usageDoc = await OfficialDispatchUsage.findOne({ instanceId, date });
    const usedToday = usageDoc?.count ?? 0;
    const remaining = Math.max(0, tierNumber - usedToday);

    if (recipients.length > remaining) {
      return next(
        createValidationError(
          `Cota insuficiente. Restam ${remaining} envios hoje (tier ${tierNumber}, já usados ${usedToday}). Reduza a lista ou tente amanhã.`
        )
      );
    }

    const results: { to: string; success: boolean; messageId?: string; error?: string }[] = [];
    let newCount = usedToday;

    for (const r of recipients) {
      const to = String(r?.to ?? '').trim();
      if (!to) {
        results.push({ to: '', success: false, error: 'Número ausente' });
        continue;
      }
      const body_params = Array.isArray(r.body_params) ? r.body_params.map((p) => String(p ?? '')) : [];

      try {
        const payload: Record<string, unknown> = {
          phone_number_id,
          to,
          template_name,
          language_code,
          body_params,
        };
        if (meta_access_token) payload.access_token = meta_access_token;

        const sendRes = await axios.post<{ status?: string; data?: { messageId?: string }; message?: string }>(
          `${BASE}/api/message/send-template`,
          payload,
          { headers, timeout: 30000 }
        );

        if (sendRes.data?.status === 'error') {
          results.push({ to, success: false, error: sendRes.data.message || 'Erro ao enviar' });
          continue;
        }

        const messageId = sendRes.data?.data?.messageId;
        results.push({ to, success: true, messageId });
        newCount += 1;
      } catch (err) {
        const msg = axios.isAxiosError(err) && err.response?.data?.message ? err.response.data.message : (err as Error).message;
        results.push({ to, success: false, error: msg });
      }
    }

    await OfficialDispatchUsage.findOneAndUpdate(
      { instanceId, date },
      { $set: { count: newCount }, $setOnInsert: { instanceId, date, count: newCount } },
      { upsert: true, new: true }
    );

    const sent = results.filter((x) => x.success).length;
    const failed = results.filter((x) => !x.success).length;

    res.status(200).json({
      status: 'success',
      data: {
        total: recipients.length,
        sent,
        failed,
        results,
      },
    });
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.data?.message) {
      return next(createValidationError(error.response.data.message));
    }
    return next(handleControllerError(error, 'Erro ao enviar disparos'));
  }
};
