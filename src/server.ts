// Configurar timezone para São Paulo, Brasil (America/Sao_Paulo)
process.env.TZ = 'America/Sao_Paulo';

// Importar constants primeiro para carregar dotenv
import { SERVER_CONFIG } from './config/constants';
import packageJson from '../package.json';

// Timezone configurado (logs removidos para reduzir verbosidade)

import express, { Express } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { connectAllDatabases } from './config/databases';
import routes from './routes';
import webhookRoutes from './routes/webhook.routes';
import webhookAPIRoutes from './routes/webhookAPIRoutes';
import { instagramWebhookProxy } from './middleware/instagramWebhookProxy';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { initializeSocket } from './socket/socketServer';
import {
  securityHeaders,
  generalRateLimiter,
  authRateLimiter,
  customSecurityHeaders,
  detectSuspiciousAgents,
} from './middleware/security';

const app: Express = express();
const httpServer = createServer(app);
const PORT = SERVER_CONFIG.PORT;

// Configurar trust proxy para funcionar corretamente com rate limiting atrás de proxy/load balancer
// Configurado para 1 proxy (Traefik) - mais seguro que 'true' (que confia em todos os proxies)
// Isso permite que express-rate-limit identifique corretamente o IP real do cliente
app.set('trust proxy', 1);

// Middlewares de Segurança (devem vir primeiro)
// 1. Helmet - Headers de segurança
app.use(securityHeaders);

// 2. Headers de segurança customizados
app.use(customSecurityHeaders);

// 3. Detectar User-Agents suspeitos (logging)
app.use(detectSuspiciousAgents);

// 4. Rate Limiting geral
app.use('/api', generalRateLimiter);

// Configurar CORS para aceitar múltiplas origens
const allowedOrigins = [
  SERVER_CONFIG.CORS_ORIGIN, // https://app.onlyflow.com.br
  'https://onlyflow.com.br',
  'https://www.onlyflow.com.br',
  'http://localhost:3000', // Para desenvolvimento
  'http://localhost:3001', // Para desenvolvimento alternativo
];

app.use(cors({
  origin: (origin, callback) => {
    // Permitir requisições sem origin (ex: Postman, mobile apps)
    if (!origin) {
      return callback(null, true);
    }
    
    // Verificar se a origin está na lista permitida
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
// Aumentar limite de payload para suportar imagens em base64 comprimidas (10MB)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware de debug para webhooks removido (reduzir verbosidade)

// Conectar a todos os bancos de dados (MongoDB, PostgreSQL, Redis)
connectAllDatabases();

// Webhook do Instagram (público - Meta chama diretamente)
// IMPORTANTE: Deve vir ANTES de /webhook para não ser capturado pelo router genérico
app.use('/webhook/instagram', instagramWebhookProxy);
console.log('✅ Webhook do Instagram registrado: /webhook/instagram');

// Rotas de Webhook (devem vir antes de /api pois são chamadas diretamente pela Evolution API)
// IMPORTANTE: Esta rota deve vir DEPOIS do webhook do Instagram
app.use('/webhook', webhookRoutes);
console.log('✅ Rotas de webhook registradas: /webhook/api/:instanceName');

// Rotas da API Externa (Webhook API) - Requer autenticação por token de instância
app.use('/api/v1/webhook', webhookAPIRoutes);
console.log('✅ Rotas de API externa registradas: /api/v1/webhook/*');

// Rota raiz
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Onlyflow API está funcionando',
    version: process.env.VERSION || packageJson.version || '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      instances: '/api/instances',
      crm: '/api/crm',
      dispatches: '/api/dispatches (proxy para microserviço)',
      workflows: '/api/workflows',
      webhook: '/webhook/api/:instanceName',
    },
  });
});

// Rotas da API
app.use('/api', routes);

// Middleware de erro 404
app.use(notFoundHandler);

// Middleware de tratamento de erros
app.use(errorHandler);

// Inicializar Socket.io
initializeSocket(httpServer);


// Iniciar servidor
httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📡 Ambiente: ${SERVER_CONFIG.NODE_ENV}`);
  console.log(`🌐 API disponível em http://localhost:${PORT}/api`);
  console.log(`🔌 WebSocket disponível em ws://localhost:${PORT}`);
  console.log(`📥 Webhook disponível em http://localhost:${PORT}/webhook/api/:instanceName`);

});

export default app;

