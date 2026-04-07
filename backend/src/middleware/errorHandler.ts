/**
 * Middleware Global de Tratamento de Erros
 * Centraliza o tratamento de erros da aplicação
 */

import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError, ValidationError, DatabaseError, InternalServerError } from '../utils/AppError';
import { logger } from '../utils/logger';

/**
 * Sanitiza dados sensíveis antes de logar
 * Remove campos como senha, tokens, etc.
 */
function sanitizeLogData(data: any): any {
    if (!data || typeof data !== 'object') {
        return data;
    }

    const sensitiveFields = [
        'password',
        'confirmPassword',
        'newPassword',
        'oldPassword',
        'currentPassword',
        'token',
        'accessToken',
        'refreshToken',
        'resetToken',
        'verificationToken',
        'secret',
        'apiKey',
        'authorization',
    ];

    const sanitized = Array.isArray(data) ? [...data] : { ...data };

    for (const key in sanitized) {
        if (Object.prototype.hasOwnProperty.call(sanitized, key)) {
            const lowerKey = key.toLowerCase();

            // Check if field name contains sensitive keywords
            if (sensitiveFields.some(field => lowerKey.includes(field))) {
                sanitized[key] = '[REDACTED]';
            } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
                // Recursively sanitize nested objects
                sanitized[key] = sanitizeLogData(sanitized[key]);
            }
        }
    }

    return sanitized;
}

/**
 * Trata erros do Zod (validação)
 */
function handleZodError(error: ZodError): ValidationError {
    const formattedErrors = error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
    }));

    return new ValidationError('Erro de validação nos dados enviados', formattedErrors);
}

/**
 * Trata erros do Prisma (banco de dados)
 */
function handlePrismaError(error: Error): AppError {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Erros conhecidos do Prisma
        switch (error.code) {
            case 'P2002': // Unique constraint violation
                return new ValidationError(`Já existe um registro com esse valor único`, {
                    field: error.meta?.target,
                });

            case 'P2025': // Record not found
                return new AppError('Registro não encontrado', 404, true, 'NOT_FOUND');

            case 'P2003': // Foreign key constraint violation
                return new ValidationError('Referência inválida a outro registro');

            case 'P2014': // Relation violation
                return new ValidationError('Violação de relacionamento entre registros');

            case 'P2024': // Timeout
                return new DatabaseError('Timeout na conexão com o banco de dados. Tente novamente.');

            case 'P2034': // Transaction conflict
                return new DatabaseError('Conflito de transação. Tente novamente.');

            default:
                logger.error('Erro do Prisma não mapeado', error, 'PrismaError', { code: error.code });
                return new DatabaseError('Erro ao processar operação no banco de dados');
        }
    }

    if (error instanceof Prisma.PrismaClientValidationError) {
        return new ValidationError('Dados inválidos para operação no banco');
    }

    if (error instanceof Prisma.PrismaClientInitializationError) {
        return new AppError(
            'Serviço de autenticação temporariamente indisponível. Tente novamente em instantes.',
            503,
            true,
            'DATABASE_UNAVAILABLE'
        );
    }

    return new DatabaseError('Erro desconhecido no banco de dados');
}

/**
 * Middleware de tratamento de erros
 */
export function errorHandler(
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
): void {
    // Se já foi enviada resposta, delega para o handler padrão do Express
    if (res.headersSent) {
        return next(err);
    }

    let error: AppError;

    // Identifica o tipo de erro e converte para AppError
    if (err instanceof AppError) {
        error = err;
    } else if (err instanceof ZodError) {
        error = handleZodError(err);
    } else if (err instanceof Prisma.PrismaClientKnownRequestError ||
        err instanceof Prisma.PrismaClientValidationError ||
        err instanceof Prisma.PrismaClientInitializationError) {
        error = handlePrismaError(err);
    } else {
        // Erro desconhecido
        error = new InternalServerError(
            process.env.NODE_ENV === 'production'
                ? 'Erro interno do servidor'
                : err.message
        );
    }

    // Log do erro (sanitiza dados sensíveis)
    const logContext = `${req.method} ${req.path}`;
    const logData = {
        body: sanitizeLogData(req.body),
        query: sanitizeLogData(req.query),
        params: sanitizeLogData(req.params),
        user: (req as any).user?.userId,
    };

    if (error.statusCode >= 500) {
        logger.error(error.message, err, logContext, logData);
    } else if (error.statusCode >= 400) {
        logger.warn(error.message, logContext, logData);
    }

    // Resposta ao cliente
    const response: any = {
        error: {
            message: error.message,
            code: error.code,
        },
    };

    // Adiciona detalhes em desenvolvimento ou se for erro operacional
    if (process.env.NODE_ENV !== 'production' || error.isOperational) {
        if (error.details) {
            response.error.details = error.details;
        }
    }

    // Adiciona stack trace apenas em desenvolvimento
    if (process.env.NODE_ENV !== 'production') {
        response.error.stack = err.stack;
    }

    res.status(error.statusCode).json(response);
}

/**
 * Middleware para rotas não encontradas (404)
 */
export function notFoundHandler(req: Request, res: Response): void {
    logger.warn(`Rota não encontrada: ${req.method} ${req.path}`, 'NotFound', {
        ip: req.ip,
        userAgent: req.get('user-agent'),
    });

    res.status(404).json({
        error: {
            message: 'Rota não encontrada',
            code: 'NOT_FOUND',
            path: req.path,
        },
    });
}

/**
 * Wrapper para funções assíncronas em rotas
 * Captura erros e passa para o error handler
 */
export function asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Tratador de erros não capturados
 */
export function setupGlobalErrorHandlers(): void {
    // Erros não capturados em Promises
    process.on('unhandledRejection', (reason: Error, promise: Promise<any>) => {
        logger.error('Unhandled Promise Rejection', reason, 'UnhandledRejection', {
            promise,
        });

        // Em produção, pode querer encerrar o processo
        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        }
    });

    // Exceções não capturadas
    process.on('uncaughtException', (error: Error) => {
        logger.error('Uncaught Exception', error, 'UncaughtException');

        // Sempre encerra o processo em exceções não capturadas
        process.exit(1);
    });

    // Sinal de término (Ctrl+C, etc)
    process.on('SIGTERM', () => {
        logger.info('SIGTERM recebido, encerrando servidor gracefully...', 'Shutdown');
        process.exit(0);
    });

    process.on('SIGINT', () => {
        logger.info('SIGINT recebido, encerrando servidor gracefully...', 'Shutdown');
        process.exit(0);
    });
}
