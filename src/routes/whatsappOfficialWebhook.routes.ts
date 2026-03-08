import { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import express from 'express';
import { verifyWebhook, receiveWebhook } from '../controllers/whatsappOfficialWebhookController';
import { verifyWhatsAppOfficialSignature } from '../middleware/whatsappOfficialWebhookSignature';

const router = Router();

function logWebhookInteraction(req: Request, _res: Response, next: NextFunction): void {
  const ts = new Date().toISOString();
  const method = req.method;
  const url = req.url;
  const query = Object.keys(req.query).length ? JSON.stringify(req.query) : '';
  const hasSignature = !!req.headers['x-hub-signature-256'];
  const contentLength = req.headers['content-length'] ?? '-';
  console.log(`[WhatsApp Oficial] ${ts} ${method} ${url} ${query ? `query=${query}` : ''} signature=${hasSignature} content-length=${contentLength}`);
  next();
}

router.use(logWebhookInteraction);
router.get('/', verifyWebhook);

router.post(
  '/',
  express.raw({ type: 'application/json', limit: '1mb' }),
  verifyWhatsAppOfficialSignature,
  receiveWebhook
);

export default router;
