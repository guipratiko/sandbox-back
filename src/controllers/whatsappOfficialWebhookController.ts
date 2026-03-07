/**
 * Webhook WhatsApp Cloud API (Meta) - verificação e recebimento
 */

import { Request, Response } from 'express';
import Instance from '../models/Instance';
import { META_OAUTH_CONFIG } from '../config/constants';
import { normalizeMetaWebhookToEvolutionFormat } from '../utils/metaWebhookNormalizer';
import { handleMessagesUpsert } from './webhookController';

export function verifyWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === META_OAUTH_CONFIG.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    return;
  }
  res.status(403).send('Forbidden');
}

export async function receiveWebhook(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    if (body.object !== 'whatsapp_business_account') {
      res.status(200).json({ status: 'ok' });
      return;
    }

    const normalized = normalizeMetaWebhookToEvolutionFormat(body as Parameters<typeof normalizeMetaWebhookToEvolutionFormat>[0]);
    for (const { phone_number_id, eventData } of normalized) {
      const instance = await Instance.findOne({
        phone_number_id,
        integration: 'WHATSAPP-CLOUD',
      });
      if (!instance) {
        continue;
      }
      await handleMessagesUpsert(instance, eventData);
    }

    res.status(200).json({ status: 'ok' });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Erro ao processar webhook WhatsApp Oficial:', msg);
    res.status(200).json({ status: 'ok' });
  }
}
