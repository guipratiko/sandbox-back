/**
 * Controller para Novidades do Sistema
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { NewsService } from '../services/newsService';
import {
  createValidationError,
  handleControllerError,
} from '../utils/errorHelpers';

/**
 * Obter últimas novidades ativas (para dashboard)
 * GET /api/news/latest?limit=5
 */
export const getLatestNews = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    const news = await NewsService.getLatestNews(limit);

    res.status(200).json({
      status: 'success',
      data: news,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao buscar novidades'));
  }
};

/**
 * Obter todas as novidades ativas
 * GET /api/news
 */
export const getAllActiveNews = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const news = await NewsService.getAllActiveNews();

    res.status(200).json({
      status: 'success',
      data: news,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao buscar novidades'));
  }
};

/**
 * Obter todas as novidades (incluindo inativas) - para administração
 * GET /api/admin/news
 */
export const getAllNews = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const news = await NewsService.getAllNews();

    res.status(200).json({
      status: 'success',
      data: news,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao buscar todas as novidades'));
  }
};

/**
 * Obter novidade por ID
 * GET /api/news/:id
 */
export const getNewsById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      return next(createValidationError('ID da novidade é obrigatório'));
    }

    const news = await NewsService.getNewsById(id);

    if (!news) {
      return next(createValidationError('Novidade não encontrada'));
    }

    res.status(200).json({
      status: 'success',
      data: news,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao buscar novidade'));
  }
};

/**
 * Criar nova novidade
 * POST /api/admin/news
 */
export const createNews = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { type, tool, title, description, fullContent, imageUrl, publishedAt, isActive, priority } = req.body;

    if (!type || !title || !description) {
      return next(createValidationError('Tipo, título e descrição são obrigatórios'));
    }

    if (!['system_update', 'tool_update', 'announcement'].includes(type)) {
      return next(createValidationError('Tipo inválido. Use: system_update, tool_update ou announcement'));
    }

    const news = await NewsService.createNews({
      type,
      tool: tool || null,
      title,
      description,
      fullContent: fullContent || null,
      imageUrl: imageUrl || null,
      publishedAt: publishedAt ? new Date(publishedAt) : undefined,
      isActive: isActive ?? true,
      priority: priority ?? 5,
    });

    res.status(201).json({
      status: 'success',
      data: news,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao criar novidade'));
  }
};

/**
 * Atualizar novidade
 * PUT /api/admin/news/:id
 */
export const updateNews = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { type, tool, title, description, fullContent, imageUrl, publishedAt, isActive, priority } = req.body;

    if (!id) {
      return next(createValidationError('ID da novidade é obrigatório'));
    }

    if (type && !['system_update', 'tool_update', 'announcement'].includes(type)) {
      return next(createValidationError('Tipo inválido. Use: system_update, tool_update ou announcement'));
    }

    const news = await NewsService.updateNews(id, {
      type,
      tool: tool !== undefined ? tool : undefined,
      title,
      description,
      fullContent: fullContent !== undefined ? fullContent : undefined,
      imageUrl: imageUrl !== undefined ? imageUrl : undefined,
      publishedAt: publishedAt ? new Date(publishedAt) : undefined,
      isActive,
      priority,
    });

    if (!news) {
      return next(createValidationError('Novidade não encontrada'));
    }

    res.status(200).json({
      status: 'success',
      data: news,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao atualizar novidade'));
  }
};

/**
 * Deletar novidade
 * DELETE /api/admin/news/:id
 */
export const deleteNews = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      return next(createValidationError('ID da novidade é obrigatório'));
    }

    const deleted = await NewsService.deleteNews(id);

    if (!deleted) {
      return next(createValidationError('Novidade não encontrada'));
    }

    res.status(200).json({
      status: 'success',
      message: 'Novidade deletada com sucesso',
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao deletar novidade'));
  }
};
