import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import Instance from '../models/Instance';
import { requestEvolutionAPI } from '../utils/evolutionAPI';
import { JWT_CONFIG, SERVER_CONFIG } from '../config/constants';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

let io: SocketServer | null = null;

export const initializeSocket = (httpServer: HttpServer): SocketServer => {
  io = new SocketServer(httpServer, {
    cors: {
      origin: SERVER_CONFIG.CORS_ORIGIN,
      credentials: true,
    },
  });

  // Middleware de autenticação
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

    if (!token) {
      // Permitir conexão sem token para microserviços internos (ex: disparo-clerky)
      // Eles podem emitir eventos, mas não receber eventos de usuários
      socket.userId = undefined;
      return next();
    }

    try {
      const decoded = jwt.verify(token, JWT_CONFIG.SECRET) as { id: string };
      socket.userId = decoded.id.toString(); // Garantir que é string
      next();
    } catch (error) {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    // Adicionar socket à sala do usuário para receber eventos específicos
    if (socket.userId) {
      const userIdStr = socket.userId.toString();
      socket.join(userIdStr);
      
      // Também adicionar à sala com ObjectId original (caso seja necessário)
      socket.join(socket.userId);
    }

    // Quando cliente solicita verificação de status
    socket.on('check-instance-status', async (instanceId: string) => {
      try {
        if (!socket.userId) {
          socket.emit('error', { message: 'Usuário não autenticado' });
          return;
        }

        const instance = await Instance.findOne({
          _id: instanceId,
          userId: socket.userId,
        });

        if (!instance) {
          socket.emit('error', { message: 'Instância não encontrada' });
          return;
        }

        // Verificar status na Evolution API
        const evolutionResponse = await requestEvolutionAPI(
          'GET',
          `/instance/connectionState/${encodeURIComponent(instance.instanceName)}`
        );

        const evolutionState =
          evolutionResponse.data?.state ||
          evolutionResponse.data?.status ||
          evolutionResponse.data?.instance?.state ||
          evolutionResponse.data?.instance?.status ||
          evolutionResponse.data?.connectionState?.state ||
          evolutionResponse.data?.connectionState?.status;

        let newStatus: 'created' | 'connecting' | 'connected' | 'disconnected' | 'error' =
          instance.status;

        const normalizedState = String(evolutionState || '').toLowerCase().trim();

        if (normalizedState === 'open' || normalizedState === 'connected') {
          newStatus = 'connected';
        } else if (
          normalizedState === 'close' ||
          normalizedState === 'disconnected' ||
          normalizedState === 'closed'
        ) {
          newStatus = 'disconnected';
        } else if (normalizedState === 'connecting' || normalizedState === 'connect') {
          newStatus = 'connecting';
        } else if (normalizedState === 'error' || normalizedState === 'failed') {
          newStatus = 'error';
        }

        // Atualizar no banco se mudou
        if (newStatus !== instance.status) {
          await Instance.updateOne({ _id: instanceId }, { status: newStatus });
        }

        // Emitir atualização
        socket.emit('instance-status-updated', {
          instanceId,
          status: newStatus,
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Erro ao verificar status';
        console.error('Erro ao verificar status:', errorMessage);
        socket.emit('error', { message: errorMessage });
      }
    });

    // Listener para eventos do microserviço de disparos
    // O microserviço emite 'dispatch-updated' e o backend principal re-emite para o frontend
    // Apenas sockets sem userId (microserviços) podem emitir este evento
    socket.on('dispatch-updated', (data: { userId: string; dispatch: any }) => {
      if (!data.userId || !data.dispatch) {
        return;
      }

      const userIdStr = data.userId.toString();
      
      // Re-emitir para o frontend na sala do usuário
      if (io) {
        io.to(userIdStr).emit('dispatch-updated', {
          dispatch: data.dispatch,
        });
      }
    });

    // Listener para eventos do microserviço Scraping-Flow (saldo de créditos)
    socket.on('scraping-credits-updated', (data: { userId: string; credits: number }) => {
      if (!data.userId || data.credits == null) return;
      const userIdStr = String(data.userId);
      if (io) io.to(userIdStr).emit('scraping-credits-updated', { credits: data.credits });
    });

    // Listener para eventos do microserviço de grupos
    // O microserviço emite 'groups-updated' e o backend principal re-emite para o frontend
    socket.on('groups-updated', (data: { userId: string; instanceId: string }) => {
      if (!data.userId || !data.instanceId) {
        return;
      }

      const userIdStr = data.userId.toString();
      
      // Re-emitir para o frontend na sala do usuário
      if (io) {
        io.to(userIdStr).emit('groups-updated', {
          instanceId: data.instanceId,
        });
      }
    });

    // Listener para requisição de informações do grupo via WebSocket
    socket.on('request-group-info', async (data: { instanceId: string; groupId: string; requestId?: string }) => {
      try {
        if (!socket.userId) {
          socket.emit('error', { message: 'Usuário não autenticado' });
          return;
        }

        if (!data.instanceId || !data.groupId) {
          socket.emit('error', { message: 'instanceId e groupId são obrigatórios' });
          return;
        }

        // Buscar instância no MongoDB
        const instance = await Instance.findOne({
          _id: data.instanceId,
          userId: socket.userId,
        });

        if (!instance) {
          socket.emit('error', { message: 'Instância não encontrada' });
          return;
        }

        // Buscar informações do grupo na Evolution API
        try {
          const evolutionResponse = await requestEvolutionAPI(
            'GET',
            `/group/findGroupInfos/${encodeURIComponent(instance.instanceName)}?groupJid=${encodeURIComponent(data.groupId)}`
          );

          // Extrair restrict e announce da resposta
          const restrict = evolutionResponse.data?.restrict ?? false;
          const announce = evolutionResponse.data?.announce ?? false;

          // Emitir resposta para o frontend
          socket.emit('group-info-response', {
            instanceId: data.instanceId,
            groupId: data.groupId,
            restrict,
            announce,
            requestId: data.requestId,
          });
        } catch (apiError: unknown) {
          const errorMessage = apiError instanceof Error ? apiError.message : 'Erro ao buscar informações do grupo';
          console.error('Erro ao buscar informações do grupo na Evolution API:', errorMessage);
          socket.emit('error', { message: errorMessage });
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Erro ao processar requisição';
        console.error('Erro ao processar request-group-info:', errorMessage);
        socket.emit('error', { message: errorMessage });
      }
    });

    // Listener para resposta do microserviço de grupos (caso seja necessário no futuro)
    socket.on('group-info-response', (data: { userId: string; instanceId: string; groupId: string; restrict: boolean; announce: boolean; requestId?: string }) => {
      if (!data.userId || !data.instanceId || !data.groupId) {
        return;
      }

      const userIdStr = data.userId.toString();
      
      // Re-emitir para o frontend na sala do usuário
      if (io) {
        io.to(userIdStr).emit('group-info-response', {
          instanceId: data.instanceId,
          groupId: data.groupId,
          restrict: data.restrict,
          announce: data.announce,
          requestId: data.requestId,
        });
      }
    });

    socket.on('disconnect', () => {
      // Cliente desconectado (log removido para reduzir verbosidade)
    });
  });

  return io;
};

export const getIO = (): SocketServer => {
  if (!io) {
    throw new Error('Socket.io não foi inicializado');
  }
  return io;
};


