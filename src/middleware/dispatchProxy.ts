/**
 * Middleware de proxy para redirecionar requisições de disparos para o microserviço
 */

import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { proxyRequest, ProxyConfig, FileUploadInfo, RequestWithFile } from '../utils/proxyHelpers';

const DISPATCH_SERVICE_URL = process.env.DISPATCH_SERVICE_URL || 'http://localhost:4332';

// Multer para processar arquivos antes de enviar ao microserviço
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

/**
 * Proxy para redirecionar requisições de /api/dispatches/* para o microserviço
 */
export const dispatchProxy = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Se for multipart/form-data, processar com multer primeiro
  if (req.headers['content-type']?.includes('multipart/form-data')) {
    return upload.single('file')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          status: 'error',
          message: err.message,
        });
      }
      
      // Continuar com o proxy após processar o arquivo
      await makeProxyRequest(req, res);
    });
  }
  
  // Para outras requisições, fazer proxy direto
  await makeProxyRequest(req, res);
};

async function makeProxyRequest(
  req: Request,
  res: Response
): Promise<void> {
  const proxyConfig: ProxyConfig = {
    serviceUrl: DISPATCH_SERVICE_URL,
    pathPrefix: '/dispatches',
    serviceName: 'Disparos',
    errorMessage: 'Serviço de disparos temporariamente indisponível',
    };

  // Se multer processou um arquivo, passar informações para o helper
  const reqWithFile = req as RequestWithFile;
  const fileUpload: FileUploadInfo | undefined = reqWithFile.file ? {
    fieldName: 'file',
    file: {
      buffer: reqWithFile.file.buffer,
      originalname: reqWithFile.file.originalname,
      mimetype: reqWithFile.file.mimetype,
    },
  } : undefined;

  await proxyRequest(req, res, proxyConfig, fileUpload);
}

