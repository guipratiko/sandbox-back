/**
 * Rotas públicas (sem autenticação) para landing page
 */

import { Router } from 'express';
import { getPublicStatus, getPublicQRCode, getQRCodeStatus } from '../controllers/publicController';

const router = Router();

// Endpoint de status agregado de todos os serviços
router.get('/status', getPublicStatus);

// Endpoints públicos de QR Code
router.get('/qrcode/:token', getPublicQRCode);
router.get('/qrcode/:token/status', getQRCodeStatus);

export default router;
