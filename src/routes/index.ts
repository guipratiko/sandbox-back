import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import publicRoutes from './public.routes';
import instanceRoutes from './instance.routes';
import crmRoutes from './crm.routes';
import workflowRoutes from './workflow.routes';
import googleRoutes from './google.routes';
import aiAgentRoutes from './aiAgent.routes';
import dashboardRoutes from './dashboard.routes';
import premiumWebhookRoutes from './premiumWebhook.routes';
import subscriptionRoutes from './subscription.routes';
import adminRoutes from './admin.routes';
import groupMovementRoutes from './groupMovement.routes';
import { dispatchProxy } from '../middleware/dispatchProxy';
import { scrapingFlowProxy } from '../middleware/scrapingFlowProxy';
import { groupProxy } from '../middleware/groupProxy';
import { instagramProxy } from '../middleware/instagramProxy';
import { checkInstagramInstanceLimit } from '../middleware/instagramInstanceLimit';
import { instagramOAuthCallbackProxy } from '../middleware/instagramOAuthCallbackProxy';
import { instagramWebhookProxy } from '../middleware/instagramWebhookProxy';
import { instagramPrivacyProxy } from '../middleware/instagramPrivacyProxy';
import { protect, requirePremium } from '../middleware/auth';
import { createCheckout } from '../controllers/asaasCheckoutController';

const router = Router();

// Rotas públicas (sem autenticação)
router.use('/public', publicRoutes);

// Rotas
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/webhook', premiumWebhookRoutes); // Webhook de compra premium e Asaas checkout (públicos)
router.use('/instances', instanceRoutes);
router.use('/crm', crmRoutes);
// Proxy para microserviço de disparos - requer autenticação e plano premium
router.use('/dispatches', protect, requirePremium, dispatchProxy);
// Checkout de créditos Scraping (Asaas) - antes do proxy
router.post('/scraping-flow/checkout', protect, createCheckout);
// Proxy para microserviço Scraping-Flow - requer autenticação
router.use('/scraping-flow', protect, scrapingFlowProxy);
// Rotas de movimentações de grupos e mensagens automáticas (devem vir antes do proxy)
// Rotas de movimentações de grupos (ainda no backend principal)
router.use('/groups', groupMovementRoutes);
// Proxy para microserviço de grupos - requer autenticação e plano premium
// Nota: As rotas acima já têm proteção, então o proxy só captura rotas não mapeadas
router.use('/groups', protect, requirePremium, groupProxy);
// Rotas públicas de privacidade do Instagram (devem vir ANTES das rotas protegidas)
// Essas rotas são chamadas diretamente pelo Meta e não requerem autenticação
router.use('/instagram/privacy', instagramPrivacyProxy);
// Rota pública para callback OAuth do Instagram (deve vir ANTES da rota protegida)
router.use('/instagram/instances/oauth/callback', instagramOAuthCallbackProxy);
// Proxy para microserviço de Instagram - requer autenticação, plano premium e respeita limite do plano
router.use('/instagram', protect, requirePremium, checkInstagramInstanceLimit, instagramProxy);
router.use('/workflows', workflowRoutes);
router.use('/google', googleRoutes);
router.use('/ai-agent', aiAgentRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/admin', adminRoutes);

export default router;

