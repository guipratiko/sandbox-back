import { GroupMessageService } from './groupMessageService';
import Instance from '../models/Instance';
import mongoose from 'mongoose';
import { sendMessage } from '../utils/evolutionAPI';
import { GroupMessageType } from './groupMessageService';

/**
 * Scheduler simples para processar mensagens de grupos agendadas.
 * Executa periodicamente, busca mensagens vencidas e envia.
 */
export function startGroupMessageScheduler(): void {
  const intervalMs = 60_000; // 60 segundos

  // Não iniciar múltiplas vezes
  if ((global as any).__GROUP_MESSAGE_SCHEDULER_STARTED__) {
    return;
  }
  (global as any).__GROUP_MESSAGE_SCHEDULER_STARTED__ = true;

  console.log('⏰ Scheduler de mensagens de grupos iniciado. Intervalo: 60s');

  const tick = async () => {
    try {
      const dueMessages = await GroupMessageService.getDueMessages(50);
      if (dueMessages.length === 0) {
        return;
      }

      console.log(
        `📨 Encontradas ${dueMessages.length} mensagem(ns) de grupo agendada(s) para processar`
      );

      for (const msg of dueMessages) {
        try {
          await GroupMessageService.updateScheduledStatus(msg.id, 'processing');

          // Obter instanceName a partir de instanceId + userId
          const instanceName = await resolveInstanceName(
            msg.instanceId,
            msg.userId
          );

          const groupIds: string[] =
            msg.groupIds && msg.groupIds.length > 0 ? msg.groupIds : [];

          if (groupIds.length === 0) {
            throw new Error(
              'Nenhum grupo associado à mensagem agendada. Cancelando.'
            );
          }

          for (const groupId of groupIds) {
            await sendGroupMessageByType(
              instanceName,
              groupId,
              msg.messageType as GroupMessageType,
              msg.contentJson
            );
          }

          await GroupMessageService.updateScheduledStatus(msg.id, 'sent');
          console.log(
            `✅ Mensagem de grupo agendada ${msg.id} enviada para ${groupIds.length} grupo(s)`
          );
        } catch (error: any) {
          const errorMessage = error?.message || String(error);
          console.error(
            `❌ Erro ao processar mensagem de grupo agendada ${msg.id}:`,
            errorMessage
          );
          await GroupMessageService.updateScheduledStatus(
            msg.id,
            'failed',
            errorMessage
          );
        }
      }
    } catch (error: any) {
      console.error(
        '❌ Erro no scheduler de mensagens de grupos:',
        error?.message || String(error)
      );
    }
  };

  // Executar imediatamente e depois em intervalos
  void tick();
  setInterval(() => {
    void tick();
  }, intervalMs);
}

async function resolveInstanceName(
  instanceId: string,
  userId: string
): Promise<string> {
  let userObjectId: mongoose.Types.ObjectId;
  let instanceObjectId: mongoose.Types.ObjectId;

  try {
    userObjectId = new mongoose.Types.ObjectId(userId);
    instanceObjectId = new mongoose.Types.ObjectId(instanceId);
  } catch {
    throw new Error('IDs inválidos para localizar instância');
  }

  const instance = await Instance.findOne({
    _id: instanceObjectId,
    userId: userObjectId,
  }).lean();

  if (!instance) {
    throw new Error('Instância não encontrada para mensagem agendada');
  }

  return (instance as any).instanceName as string;
}

/**
 * Helper local (duplicado do controller para evitar dependência circular)
 * Idealmente, no futuro, isso pode ser extraído para um helper compartilhado.
 */
async function sendGroupMessageByType(
  instanceName: string,
  groupId: string,
  messageType: GroupMessageType,
  contentJson: any
): Promise<void> {
  switch (messageType) {
    case 'text': {
      const text = contentJson?.text;
      if (!text || String(text).trim().length === 0) {
        throw new Error('Texto da mensagem é obrigatório');
      }
      await sendMessage(instanceName, {
        number: groupId,
        text: String(text),
      });
      break;
    }
    case 'media': {
      const mediaUrl = contentJson?.media;
      const mediaType = contentJson?.mediatype || 'image';
      const caption = contentJson?.caption;
      const fileName = contentJson?.fileName;

      if (!mediaUrl) {
        throw new Error('URL da mídia é obrigatória');
      }

      if (mediaType === 'image') {
        await sendMessage(instanceName, {
          number: groupId,
          image: mediaUrl,
          caption: caption || undefined,
        });
      } else if (mediaType === 'video') {
        await sendMessage(instanceName, {
          number: groupId,
          video: mediaUrl,
          caption: caption || undefined,
        });
      } else if (mediaType === 'audio') {
        await sendMessage(instanceName, {
          number: groupId,
          audio: mediaUrl,
        });
      } else {
        await sendMessage(instanceName, {
          number: groupId,
          document: mediaUrl,
          fileName: fileName || 'arquivo',
        });
      }
      break;
    }
    case 'poll': {
      const name = contentJson?.name;
      const values: string[] = contentJson?.values || [];
      const selectableCount = contentJson?.selectableCount ?? 1;

      if (!name || String(name).trim().length === 0) {
        throw new Error('Texto principal da enquete é obrigatório');
      }

      if (!Array.isArray(values) || values.length < 2) {
        throw new Error('A enquete deve ter pelo menos duas opções');
      }

      const { requestEvolutionAPI } = await import('../utils/evolutionAPI');
      await requestEvolutionAPI(
        'POST',
        `/message/sendPoll/${encodeURIComponent(instanceName)}`,
        {
          number: groupId,
          name: String(name),
          selectableCount,
          values,
        }
      );
      break;
    }
    case 'contact': {
      const contacts = contentJson?.contact;
      if (!Array.isArray(contacts) || contacts.length === 0) {
        throw new Error('Pelo menos um contato é obrigatório');
      }

      const { requestEvolutionAPI } = await import('../utils/evolutionAPI');
      await requestEvolutionAPI(
        'POST',
        `/message/sendContact/${encodeURIComponent(instanceName)}`,
        {
          number: groupId,
          contact: contacts,
        }
      );
      break;
    }
    case 'location': {
      const name = contentJson?.name;
      const address = contentJson?.address;
      const latitude = contentJson?.latitude;
      const longitude = contentJson?.longitude;

      if (
        latitude === undefined ||
        longitude === undefined ||
        latitude === null ||
        longitude === null
      ) {
        throw new Error('Latitude e longitude são obrigatórias');
      }

      const { requestEvolutionAPI } = await import('../utils/evolutionAPI');
      await requestEvolutionAPI(
        'POST',
        `/message/sendLocation/${encodeURIComponent(instanceName)}`,
        {
          number: groupId,
          name: name || '',
          address: address || '',
          latitude,
          longitude,
        }
      );
      break;
    }
    case 'audio': {
      const audioUrl = contentJson?.audio;
      if (!audioUrl) {
        throw new Error('URL do áudio é obrigatória');
      }

      const { requestEvolutionAPI } = await import('../utils/evolutionAPI');
      await requestEvolutionAPI(
        'POST',
        `/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`,
        {
          number: groupId,
          audio: audioUrl,
        }
      );
      break;
    }
    default:
      throw new Error(`Tipo de mensagem não suportado: ${messageType}`);
  }
}

