/**
 * Normaliza payload do webhook Meta (WhatsApp Cloud API) para o formato
 * esperado por handleMessagesUpsert / extractMessageData (Evolution-like).
 */

export interface MetaWebhookValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
  messages?: Array<{
    from: string;
    id: string;
    timestamp: string;
    type: string;
    text?: { body?: string };
    image?: { id?: string; caption?: string };
    video?: { id?: string; caption?: string };
    audio?: { id?: string };
    document?: { id?: string; filename?: string };
  }>;
  message_echoes?: Array<{
    from: string;
    id: string;
    timestamp: string;
    type: string;
    text?: { body?: string };
    image?: { id?: string };
    video?: { id?: string };
    audio?: { id?: string };
    document?: { id?: string };
  }>;
  statuses?: Array<unknown>;
}

/**
 * Retorna evento no formato que webhookController.handleMessagesUpsert espera:
 * { data: { messages: [ { remoteJid, fromMe, pushName, conversation, messageType, key: { id, timestamp } } ] } }
 */
export function normalizeMetaWebhookToEvolutionFormat(body: {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{ field?: string; value?: MetaWebhookValue }>;
  }>;
}): Array<{ phone_number_id: string; eventData: { data: { messages: unknown[] } } }> {
  const results: Array<{ phone_number_id: string; eventData: { data: { messages: unknown[] } } }> = [];
  const entry = body.entry;
  if (!Array.isArray(entry)) return results;

  for (const e of entry) {
    const changes = e.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      if (change.field !== 'messages' && change.field !== 'message_echoes') continue;
      const value = change.value as MetaWebhookValue | undefined;
      if (!value) continue;
      const phone_number_id = value.metadata?.phone_number_id;
      if (!phone_number_id) continue;

      const contactsMap = new Map<string, string>();
      if (Array.isArray(value.contacts)) {
        for (const c of value.contacts) {
          if (c.wa_id) contactsMap.set(c.wa_id, c.profile?.name || '');
        }
      }

      const messages: unknown[] = [];
      const fromMe = change.field === 'message_echoes';
      const list = change.field === 'message_echoes' ? value.message_echoes : value.messages;
      if (!Array.isArray(list)) continue;

      const typeToMessageType: Record<string, string> = {
        audio: 'audioMessage',
        image: 'imageMessage',
        video: 'videoMessage',
        document: 'documentMessage',
        sticker: 'stickerMessage',
      };
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
        results.push({
          phone_number_id,
          eventData: { data: { messages } },
        });
      }
    }
  }
  return results;
}
