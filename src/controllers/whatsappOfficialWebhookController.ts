/**
 * Webhook WhatsApp Cloud API (Meta) - verificação e recebimento
 */

import { Request, Response } from 'express';
import Instance from '../models/Instance';
import { META_OAUTH_CONFIG } from '../config/constants';
import { normalizeMetaWebhookToEvolutionFormat } from '../utils/metaWebhookNormalizer';
import { fetchMetaMediaAndUploadToMidiaService } from '../utils/mediaService';
import { handleMessagesUpsert } from './webhookController';

export function verifyWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('[WhatsApp Oficial] Webhook GET (verificação)', { mode, tokenPresent: !!token });
  if (mode === 'subscribe' && token === META_OAUTH_CONFIG.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    return;
  }
  res.status(403).send('Forbidden');
}

export async function receiveWebhook(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const entries = (body.entry as unknown[])?.length ?? 0;
    console.log('[WhatsApp Oficial] Webhook POST recebido', { object: body.object, entries });

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
        console.log('[WhatsApp Oficial] Nenhuma instância encontrada para phone_number_id:', phone_number_id);
        continue;
      }
      const token = (instance as any).meta_access_token || META_OAUTH_CONFIG.SYSTEM_USER_TOKEN;
      const messages = eventData?.data?.messages ?? [];
      for (const msg of messages) {
        const mediaId = msg.mediaId;
        if (mediaId && (msg.metaType || msg.messageType)) {
          const keyId = (msg.key && typeof msg.key === 'object' && msg.key.id) ? msg.key.id : msg.messageId || `msg_${Date.now()}`;
          const metaType = msg.metaType || (msg.messageType === 'audioMessage' ? 'audio' : msg.messageType === 'imageMessage' ? 'image' : msg.messageType === 'videoMessage' ? 'video' : msg.messageType === 'documentMessage' ? 'document' : msg.messageType);
          const url = await fetchMetaMediaAndUploadToMidiaService(mediaId, metaType, keyId, token);
          if (url) {
            msg.mediaUrl = url;
            console.log('[WhatsApp Oficial] Mídia baixada e enviada ao MidiaService:', msg.messageType, keyId);
          }
        }
      }
      const msgCount = messages.length;
      console.log('[WhatsApp Oficial] Processando evento', { phone_number_id, instanceName: instance.instanceName, messages: msgCount });
      await handleMessagesUpsert(instance, eventData);
    }

    res.status(200).json({ status: 'ok' });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[WhatsApp Oficial] Erro ao processar webhook:', msg);
    res.status(200).json({ status: 'ok' });
  }
}
