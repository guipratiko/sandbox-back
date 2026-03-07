/**
 * Controller para endpoints públicos (landing page)
 */

import { Request, Response, NextFunction } from 'express';
import { getAllServicesStatus } from '../services/publicStatusService';
import { handleControllerError, createNotFoundError } from '../utils/errorHelpers';
import Instance from '../models/Instance';

/**
 * Obter status de todos os serviços
 * GET /api/public/status
 */
export const getPublicStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const status = await getAllServicesStatus();

    res.status(200).json({
      status: 'success',
      data: status,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao verificar status dos serviços'));
  }
};

/**
 * Exibir QR Code publicamente
 * GET /api/public/qrcode/:token
 */
export const getPublicQRCode = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { token } = req.params;

    if (!token) {
      return next(createNotFoundError('Token não fornecido'));
    }

    // Buscar instância pelo token
    const instance = await Instance.findOne({ token }).select('qrcodeBase64 name status');

    if (!instance) {
      const errorHtml = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>QR Code não encontrado - Clerky</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: linear-gradient(135deg, #eff6ff 0%, #e0e7ff 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 16px;
            }
            .container {
              background: white;
              border-radius: 16px;
              box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
              padding: 32px;
              max-width: 448px;
              width: 100%;
              text-align: center;
            }
            .icon { width: 80px; height: 80px; margin: 0 auto 24px; color: #ef4444; }
            h1 { font-size: 24px; font-weight: 700; color: #111827; margin-bottom: 16px; }
            p { color: #4b5563; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="container">
            <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h1>QR Code não encontrado</h1>
            <p>O link que você está tentando acessar é inválido ou expirou.</p>
          </div>
        </body>
        </html>
      `;
      res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(errorHtml);
      return;
    }

    if (!instance.qrcodeBase64) {
      const errorHtml = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>QR Code não disponível - Clerky</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: linear-gradient(135deg, #eff6ff 0%, #e0e7ff 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 16px;
            }
            .container {
              background: white;
              border-radius: 16px;
              box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
              padding: 32px;
              max-width: 448px;
              width: 100%;
              text-align: center;
            }
            .icon { width: 80px; height: 80px; margin: 0 auto 24px; color: #eab308; }
            h1 { font-size: 24px; font-weight: 700; color: #111827; margin-bottom: 16px; }
            p { color: #4b5563; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="container">
            <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h1>QR Code não disponível</h1>
            <p>O QR Code ainda não foi gerado para esta instância.</p>
          </div>
        </body>
        </html>
      `;
      res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(errorHtml);
      return;
    }

    // Se a instância já está conectada, mostrar mensagem
    if (instance.status === 'connected') {
      const successHtml = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>WhatsApp Conectado - Clerky</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: linear-gradient(135deg, #eff6ff 0%, #e0e7ff 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 16px;
            }
            .container {
              background: white;
              border-radius: 16px;
              box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
              padding: 32px;
              max-width: 448px;
              width: 100%;
              text-align: center;
            }
            .icon { width: 80px; height: 80px; margin: 0 auto 24px; color: #22c55e; }
            h1 { font-size: 24px; font-weight: 700; color: #111827; margin-bottom: 16px; }
            p { color: #4b5563; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="container">
            <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h1>WhatsApp já está conectado!</h1>
            <p>Esta instância já foi conectada com sucesso.</p>
          </div>
        </body>
        </html>
      `;
      res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(successHtml);
      return;
    }

    // Retornar página HTML bonita com o QR Code
    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Escaneie o QR Code - Clerky</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #eff6ff 0%, #e0e7ff 50%, #f3e8ff 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
          }
          
          .container {
            background: white;
            border-radius: 24px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            padding: 24px;
            max-width: 512px;
            width: 100%;
          }
          
          @media (min-width: 768px) {
            .container {
              padding: 40px;
            }
          }
          
          .header {
            text-align: center;
            margin-bottom: 32px;
          }
          
          .icon-container {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 64px;
            height: 64px;
            background: linear-gradient(135deg, #3b82f6 0%, #4f46e5 100%);
            border-radius: 16px;
            margin-bottom: 16px;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
          }
          
          .icon-container svg {
            width: 32px;
            height: 32px;
            color: white;
          }
          
          h1 {
            font-size: 24px;
            font-weight: 700;
            color: #111827;
            margin-bottom: 8px;
          }
          
          @media (min-width: 768px) {
            h1 {
              font-size: 30px;
            }
          }
          
          .subtitle {
            color: #4b5563;
            font-size: 14px;
            line-height: 1.5;
          }
          
          @media (min-width: 768px) {
            .subtitle {
              font-size: 16px;
            }
          }
          
          .qrcode-container {
            background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          
          @media (min-width: 768px) {
            .qrcode-container {
              padding: 32px;
            }
          }
          
          .qrcode-wrapper {
            position: relative;
            display: inline-block;
          }
          
          .qrcode-image {
            max-width: 100%;
            height: auto;
            border-radius: 12px;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
            border: 4px solid white;
            display: block;
          }
          
          .instructions {
            background: #eff6ff;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 24px;
          }
          
          @media (min-width: 768px) {
            .instructions {
              padding: 24px;
            }
          }
          
          .instructions-title {
            font-size: 14px;
            font-weight: 600;
            color: #1e3a8a;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          
          .instructions-title svg {
            width: 20px;
            height: 20px;
            flex-shrink: 0;
          }
          
          .instructions-list {
            font-size: 14px;
            color: #1e40af;
            line-height: 1.75;
            list-style: decimal;
            list-style-position: inside;
            padding-left: 0;
          }
          
          .instructions-list li {
            margin-bottom: 8px;
          }
          
          .instructions-list li:last-child {
            margin-bottom: 0;
          }
          
          .instructions-list strong {
            font-weight: 600;
          }
          
          .status-text {
            text-align: center;
            font-size: 12px;
            color: #6b7280;
            line-height: 1.5;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Header -->
          <div class="header">
            <div class="icon-container">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <h1>Conecte seu WhatsApp</h1>
            <p class="subtitle">Escaneie o QR Code abaixo com o aplicativo WhatsApp</p>
          </div>

          <!-- QR Code Container -->
          <div class="qrcode-container">
            <div class="qrcode-wrapper">
              <img
                src="${instance.qrcodeBase64}"
                alt="QR Code WhatsApp"
                class="qrcode-image"
              />
            </div>
          </div>

          <!-- Instructions -->
          <div class="instructions">
            <h2 class="instructions-title">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Como escanear:
            </h2>
            <ol class="instructions-list">
              <li>Abra o aplicativo WhatsApp no seu celular</li>
              <li>Toque em <strong>Menu</strong> ou <strong>Configurações</strong></li>
              <li>Selecione <strong>Aparelhos conectados</strong></li>
              <li>Toque em <strong>Conectar um aparelho</strong></li>
              <li>Escaneie este QR Code</li>
            </ol>
          </div>

          <!-- Status -->
          <div>
            <p class="status-text">
              Esta página atualiza automaticamente quando o QR Code for escaneado
            </p>
          </div>

          <!-- Auto-refresh script -->
          <script>
            // Auto-refresh a cada 5 segundos se ainda não estiver conectado
            let refreshCount = 0;
            const maxRefreshes = 120; // 10 minutos (120 * 5s)
            
            const checkStatus = setInterval(() => {
              refreshCount++;
              if (refreshCount >= maxRefreshes) {
                clearInterval(checkStatus);
                return;
              }
              
              fetch('/api/public/qrcode/${token}/status')
                .then(res => res.json())
                .then(data => {
                  if (data.status === 'connected') {
                    window.location.reload();
                  }
                })
                .catch(() => {
                  // Ignorar erros silenciosamente
                });
            }, 5000);
          </script>
        </div>
      </body>
      </html>
    `;

    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(html);
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao exibir QR Code público'));
  }
};

/**
 * Verificar status da instância (para auto-refresh)
 * GET /api/public/qrcode/:token/status
 */
export const getQRCodeStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { token } = req.params;

    if (!token) {
      res.status(404).json({ status: 'not_found' });
      return;
    }

    const instance = await Instance.findOne({ token }).select('status');

    if (!instance) {
      res.status(404).json({ status: 'not_found' });
      return;
    }

    res.status(200).json({
      status: instance.status,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao verificar status do QR Code'));
  }
};
