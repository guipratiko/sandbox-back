/**
 * Middleware de proxy para redirecionar requisições de grupos para o microserviço
 */

import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { proxyRequest, ProxyConfig, FileUploadInfo, RequestWithFile } from '../utils/proxyHelpers';

const GROUP_SERVICE_URL = process.env.GROUP_SERVICE_URL || 'http://localhost:4334';

// Multer para processar arquivos antes de enviar ao microserviço
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB (mesmo limite do Grupo-Clerky)
  },
});

/**
 * Proxy para redirecionar requisições de /api/groups/* para o microserviço
 */
export const groupProxy = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Se for multipart/form-data, processar com multer primeiro
  if (req.headers['content-type']?.includes('multipart/form-data')) {
    // Determinar o campo do arquivo baseado na rota
    const fieldName = req.path.includes('/update-picture') ? 'image' : 'file';
    
    return upload.single(fieldName)(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          status: 'error',
          message: err.message,
        });
      }
      
      // Continuar com o proxy após processar o arquivo
      await makeProxyRequest(req, res, fieldName);
    });
  }
  
  // Para outras requisições, fazer proxy direto
  await makeProxyRequest(req, res);
};

async function makeProxyRequest(
  req: Request,
  res: Response,
  fieldName: string = 'file'
): Promise<void> {
  const proxyConfig: ProxyConfig = {
    serviceUrl: GROUP_SERVICE_URL,
    pathPrefix: '/groups',
    serviceName: 'Grupos',
    errorMessage: 'Serviço de grupos temporariamente indisponível',
    // leave-bulk pode demorar (várias chamadas à Evolution em sequência)
    timeout: req.path.endsWith('leave-bulk') ? 300000 : 30000, // 5 min para leave-bulk
  };

  // Se multer processou um arquivo, passar informações para o helper
  const reqWithFile = req as RequestWithFile;
  const fileUpload: FileUploadInfo | undefined = reqWithFile.file ? {
    fieldName: fieldName,
    file: {
      buffer: reqWithFile.file.buffer,
      originalname: reqWithFile.file.originalname,
      mimetype: reqWithFile.file.mimetype,
    },
  } : undefined;

  await proxyRequest(req, res, proxyConfig, fileUpload);
}

