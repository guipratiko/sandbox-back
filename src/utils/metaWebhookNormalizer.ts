/**
 * Normaliza payload do webhook Meta (WhatsApp Cloud API) para o formato
 * esperado por handleMessagesUpsert / extractMessageData (Evolution-like).
 */

export interface MetaWebhookMessageLike {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body?: string };
  image?: { id?: string; caption?: string };
  video?: { id?: string; caption?: string };
  audio?: { id?: string };
  document?: { id?: string; filename?: string };
}

export interface MetaWebhookValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
  messages?: MetaWebhookMessageLike[];
  message_echoes?: MetaWebhookMessageLike[];
  /** Coex: mensagens enviadas/recebidas pelo WhatsApp Business App */
  smb_message_echoes?: MetaWebhookMessageLike[];
  statuses?: Array<unknown>;
}

export type NormalizedMetaWebhookItem =
  | { phone_number_id: string; eventData: { data: { messages: unknown[] } } }
  | { phone_number_id: string; contactsSync: Array<{ wa_id: string; name?: string }> };

/**
 * Retorna eventos no formato que webhookController espera:
 * - messages/message_echoes/smb_message_echoes/history → eventData para handleMessagesUpsert
 * - smb_app_state_sync → contactsSync para upsert de contatos (Coex)
 */
export function normalizeMetaWebhookToEvolutionFormat(body: {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{ field?: string; value?: MetaWebhookValue & { messages?: MetaWebhookMessageLike[] } }>;
  }>;
}): NormalizedMetaWebhookItem[] {
  const results: NormalizedMetaWebhookItem[] = [];
  const entry = body.entry;
  if (!Array.isArray(entry)) return results;

  const typeToMessageType: Record<string, string> = {
    audio: 'audioMessage',
    image: 'imageMessage',
    video: 'videoMessage',
    document: 'documentMessage',
    sticker: 'stickerMessage',
  };

  function pushMessages(
    phone_number_id: string,
    list: MetaWebhookMessageLike[],
    fromMe: boolean,
    contactsMap: Map<string, string>
  ): void {
    const messages: unknown[] = [];
    for (const msg of list) {
      const from = msg.from || '';
      const remoteJid = from ? `${from}@s.whatsapp.net` : '';
      let conversation = '';
      if (msg.text?.body) conversation = msg.text.body;
      const pushName = contactsMap.get(from) || from;
      const msgType = msg.type || 'text';
      const messageType = typeToMessageType[msgType] || msgType;
      const mediaId =
        msgType === 'audio' ? msg.audio?.id
        : msgType === 'image' ? msg.image?.id
        : msgType === 'video' ? msg.video?.id
        : msgType === 'document' ? msg.document?.id
        : undefined;
      messages.push({
        remoteJid,
        fromMe,
        pushName,
        conversation,
        messageType,
        key: { id: msg.id, timestamp: msg.timestamp },
        messageTimestamp: msg.timestamp,
        ...(mediaId ? { mediaId, metaType: msgType } : {}),
      });
    }
    if (messages.length > 0) {
      results.push({ phone_number_id, eventData: { data: { messages } } });
    }
  }

  for (const e of entry) {
    const changes = e.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = change.value as (MetaWebhookValue & { messages?: MetaWebhookMessageLike[] }) | undefined;
      if (!value) continue;
      const phone_number_id = value.metadata?.phone_number_id;
      if (!phone_number_id) continue;

      const contactsMap = new Map<string, string>();
      if (Array.isArray(value.contacts)) {
        for (const c of value.contacts) {
          if (c.wa_id) contactsMap.set(c.wa_id, c.profile?.name || '');
        }
      }

      // messages, message_echoes, smb_message_echoes (Coex), history (Coex)
      if (change.field === 'messages' && Array.isArray(value.messages)) {
        pushMessages(phone_number_id, value.messages, false, contactsMap);
        continue;
      }
      if (change.field === 'message_echoes' && Array.isArray(value.message_echoes)) {
        pushMessages(phone_number_id, value.message_echoes, true, contactsMap);
        continue;
      }
      if (change.field === 'smb_message_echoes' && Array.isArray(value.smb_message_echoes)) {
        pushMessages(phone_number_id, value.smb_message_echoes, true, contactsMap);
        continue;
      }
      if (change.field === 'history' && Array.isArray(value.messages)) {
        pushMessages(phone_number_id, value.messages, false, contactsMap);
        continue;
      }

      // Coex: smb_app_state_sync — contatos do WhatsApp Business App
      if (change.field === 'smb_app_state_sync' && Array.isArray(value.contacts)) {
        const contactsSync = value.contacts
          .filter((c): c is { wa_id: string; profile?: { name?: string } } => !!c.wa_id)
          .map((c) => ({ wa_id: c.wa_id, name: c.profile?.name }));
        if (contactsSync.length > 0) {
          results.push({ phone_number_id, contactsSync });
        }
      }
    }
  }
  return results;
}
