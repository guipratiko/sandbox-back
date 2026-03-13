/**
 * Webhook WhatsApp Cloud API (Meta) - verificação e recebimento
 */

import { Request, Response } from 'express';
import Instance from '../models/Instance';
import { META_OAUTH_CONFIG } from '../config/constants';
import { normalizeMetaWebhookToEvolutionFormat } from '../utils/metaWebhookNormalizer';
import { fetchMetaMediaAndUploadToMidiaService } from '../utils/mediaService';
import { handleMessagesUpsert } from './webhookController';
import { ContactService } from '../services/contactService';
import { CRMColumnService } from '../services/crmColumnService';
import { formatWhatsAppPhone } from '../utils/formatters';

/** Mensagem no formato normalizado (metaWebhookNormalizer), com campos opcionais de mídia */
interface NormalizedMessage {
  key?: { id?: string };
  messageType?: string;
  messageId?: string;
  mediaId?: string;
  metaType?: string;
  mediaUrl?: string;
}

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
    for (const item of normalized) {
      const { phone_number_id } = item;
      const instance = await Instance.findOne({
        phone_number_id,
        integration: 'WHATSAPP-CLOUD',
      });
      if (!instance) {
        console.log('[WhatsApp Oficial] Nenhuma instância encontrada para phone_number_id:', phone_number_id);
        continue;
      }

      if ('contactsSync' in item) {
        const userId = instance.userId?.toString();
        if (!userId) continue;
        const columns = await CRMColumnService.initializeColumns(userId);
        const firstColumn = columns.find((c) => c.orderIndex === 0);
        const columnId = firstColumn?.id ?? null;
        for (const c of item.contactsSync) {
          const remoteJid = `${c.wa_id}@s.whatsapp.net`;
          const phone = formatWhatsAppPhone(remoteJid);
          try {
            await ContactService.findOrCreate({
              userId,
              instanceId: instance._id.toString(),
              remoteJid,
              phone,
              name: c.name || phone,
              profilePicture: null,
              columnId,
            });
          } catch (err) {
            console.warn('[WhatsApp Oficial] Coex contactsSync: falha ao upsert contato', c.wa_id, err);
          }
        }
        console.log('[WhatsApp Oficial] Coex contactsSync processado', { phone_number_id, count: item.contactsSync.length });
        continue;
      }

      const eventData = item.eventData;
      const token = (instance as any).meta_access_token || META_OAUTH_CONFIG.SYSTEM_USER_TOKEN;
      const messages = (eventData?.data?.messages ?? []) as NormalizedMessage[];
      for (const msg of messages) {
        const mediaId = msg.mediaId;
        if (mediaId && (msg.metaType || msg.messageType)) {
          const keyId = (msg.key && typeof msg.key === 'object' && msg.key.id) ? msg.key.id : msg.messageId || `msg_${Date.now()}`;
          const metaType: string = msg.metaType || (msg.messageType === 'audioMessage' ? 'audio' : msg.messageType === 'imageMessage' ? 'image' : msg.messageType === 'videoMessage' ? 'video' : msg.messageType === 'documentMessage' ? 'document' : msg.messageType ?? 'document');
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
