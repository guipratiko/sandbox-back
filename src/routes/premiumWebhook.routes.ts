import { Router } from 'express';
import { receivePremiumWebhook } from '../controllers/premiumWebhookController';
import { receiveAsaasCheckoutWebhook } from '../controllers/asaasCheckoutController';

const router = Router();

// Rota pública para receber webhook de compra premium
router.post('/premium-purchase', receivePremiumWebhook);

// Rota pública para webhook Asaas (CHECKOUT_PAID - créditos Scraping Flow)
router.post('/asaas-checkout', receiveAsaasCheckoutWebhook);

export default router;


