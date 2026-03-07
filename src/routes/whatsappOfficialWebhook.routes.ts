import { Router } from 'express';
import express from 'express';
import { verifyWebhook, receiveWebhook } from '../controllers/whatsappOfficialWebhookController';
import { verifyWhatsAppOfficialSignature } from '../middleware/whatsappOfficialWebhookSignature';

const router = Router();

router.get('/', verifyWebhook);

router.post(
  '/',
  express.raw({ type: 'application/json', limit: '1mb' }),
  verifyWhatsAppOfficialSignature,
  receiveWebhook
);

export default router;
