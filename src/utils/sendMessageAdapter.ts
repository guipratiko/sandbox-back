/**
 * Adaptador de envio: roteia para Evolution API ou OficialAPI-Clerky conforme instance.integration
 */

import axios from 'axios';
import { OFFICIAL_API_CLERKY_URL, OFFICIAL_API_CLERKY_API_KEY } from '../config/constants';
import { sendMessage as evolutionSendMessage } from './evolutionAPI';

export interface InstanceForSend {
  instanceName: string;
  integration?: string;
  phone_number_id?: string | null;
}

export interface SendMessagePayload {
  number: string;
  text?: string;
  image?: string;
  video?: string;
  audio?: string;
  /** Fallback: base64 do áudio quando envio por URL não for possível */
  audio_base64?: string;
  /** Mimetype quando usar audio_base64 (ex: audio/ogg) */
  audio_mimetype?: string;
  document?: string;
  caption?: string;
  fileName?: string;
  delay?: number;
}

/**
 * Envia mensagem usando Evolution API ou OficialAPI-Clerky conforme o tipo da instância.
 * Retorna formato compatível com extractMessageId (data.key.id ou data.messageId).
 */
export async function sendMessage(
  instance: InstanceForSend,
  payload: SendMessagePayload
): Promise<{ data?: { key?: { id: string }; messageId?: string } }> {
  if (instance.integration === 'WHATSAPP-CLOUD' && instance.phone_number_id) {
    const baseUrl = OFFICIAL_API_CLERKY_URL.replace(/\/$/, '');
    const headers: Record<string, string> = {};
    if (OFFICIAL_API_CLERKY_API_KEY) {
      headers['x-api-key'] = OFFICIAL_API_CLERKY_API_KEY;
    }
    const res = await axios.post(
      `${baseUrl}/api/message/send`,
      {
        phone_number_id: instance.phone_number_id,
        number: payload.number,
        text: payload.text,
        image: payload.image,
        video: payload.video,
        audio: payload.audio,
        audio_base64: payload.audio_base64,
        audio_mimetype: payload.audio_mimetype,
        document: payload.document,
        caption: payload.caption,
        fileName: payload.fileName,
      },
      { timeout: 60000, headers }
    );
    const messageId = res.data?.data?.messageId || '';
    return { data: { key: { id: messageId }, messageId } };
  }
  const evolutionResponse = await evolutionSendMessage(instance.instanceName, payload);
  return evolutionResponse;
}
