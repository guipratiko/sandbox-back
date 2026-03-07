/**
 * Controller para Banners do Dashboard
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { BannerService } from '../services/bannerService';
import {
  createValidationError,
  handleControllerError,
} from '../utils/errorHelpers';

/**
 * Obter todos os banners ativos
 * GET /api/dashboard/banners
 */
export const getBanners = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const banners = await BannerService.getActiveBanners();

    res.status(200).json({
      status: 'success',
      data: banners,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao buscar banners'));
  }
};

/**
 * Obter todos os banners (incluindo inativos) - para administração
 * GET /api/dashboard/banners/all
 */
export const getAllBanners = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const banners = await BannerService.getAllBanners();

    res.status(200).json({
      status: 'success',
      data: banners,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao buscar todos os banners'));
  }
};

/**
 * Obter banner por ID
 * GET /api/dashboard/banners/:id
 */
export const getBannerById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      return next(createValidationError('ID do banner é obrigatório'));
    }

    const banner = await BannerService.getBannerById(id);

    if (!banner) {
      return next(createValidationError('Banner não encontrado'));
    }

    res.status(200).json({
      status: 'success',
      data: banner,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao buscar banner'));
  }
};

/**
 * Criar novo banner
 * POST /api/dashboard/banners
 */
export const createBanner = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { imageUrl, linkUrl, title, order, isActive } = req.body;

    if (!imageUrl) {
      return next(createValidationError('URL da imagem é obrigatória'));
    }

    const banner = await BannerService.createBanner({
      imageUrl,
      linkUrl: linkUrl || null,
      title: title || null,
      order: order ?? 0,
      isActive: isActive ?? true,
    });

    res.status(201).json({
      status: 'success',
      data: banner,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao criar banner'));
  }
};

/**
 * Atualizar banner
 * PUT /api/dashboard/banners/:id
 */
export const updateBanner = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { imageUrl, linkUrl, title, order, isActive } = req.body;

    if (!id) {
      return next(createValidationError('ID do banner é obrigatório'));
    }

    const banner = await BannerService.updateBanner(id, {
      imageUrl,
      linkUrl: linkUrl !== undefined ? linkUrl : undefined,
      title: title !== undefined ? title : undefined,
      order,
      isActive,
    });

    if (!banner) {
      return next(createValidationError('Banner não encontrado'));
    }

    res.status(200).json({
      status: 'success',
      data: banner,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao atualizar banner'));
  }
};

/**
 * Deletar banner
 * DELETE /api/dashboard/banners/:id
 */
export const deleteBanner = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      return next(createValidationError('ID do banner é obrigatório'));
    }

    const deleted = await BannerService.deleteBanner(id);

    if (!deleted) {
      return next(createValidationError('Banner não encontrado'));
    }

    res.status(200).json({
      status: 'success',
      message: 'Banner deletado com sucesso',
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao deletar banner'));
  }
};
