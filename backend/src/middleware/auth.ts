import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../services/autenticacaoServico";
import { AuthenticationError, ForbiddenError } from "../utils/AppError";
import { logger } from "../utils/logger";

export interface AuthRequest extends Request {
  user: {
    userId: string;
    email: string;
  };
}

/**
 * Middleware de autenticação obrigatória
 * Verifica se o token JWT é válido
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      throw new AuthenticationError("Token de autenticação não fornecido");
    }

    try {
      const payload = verifyAccessToken(token);
      (req as AuthRequest).user = payload;
      next();
    } catch (error) {
      logger.warn("Token inválido ou expirado", "Auth", {
        ip: req.ip,
        path: req.path,
        error: (error as Error).message,
      });
      throw new ForbiddenError("Token inválido ou expirado");
    }
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware de autenticação opcional
 * Se houver token, valida e anexa ao request
 * Se não houver ou for inválido, continua sem autenticação
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (token) {
    try {
      const payload = verifyAccessToken(token);
      (req as AuthRequest).user = payload;
    } catch (error) {
      // Token invalid, but continue without authentication
      logger.debug("Token opcional inválido, continuando sem auth", "Auth", {
        error: (error as Error).message,
      });
    }
  }

  next();
}
