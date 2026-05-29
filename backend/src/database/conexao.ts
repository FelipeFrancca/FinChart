/**
 * Database connection singleton using Prisma
 * Prevents multiple Prisma Client instances
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { getDatabaseUrl } from '../config/database';

declare global {
    var __prisma: PrismaClient | undefined;
}

class DatabaseConnection {
    private static instance: PrismaClient;

    private constructor() { }

    static getInstance(): PrismaClient {
        if (!this.instance) {
            logger.info('Creating new Prisma Client instance', 'Database');

            this.instance = global.__prisma || new PrismaClient({
                log: process.env.NODE_ENV === 'development'
                    ? [
                        { emit: 'event', level: 'query' },
                        { emit: 'event', level: 'error' },
                        { emit: 'event', level: 'warn' },
                    ]
                    : [{ emit: 'event', level: 'error' }],
                // Previne conexão automática durante import - lazy connection
                    datasourceUrl: getDatabaseUrl() ?? undefined,
            });

            // Log queries in development
            if (process.env.NODE_ENV === 'development') {
                this.instance.$on('query' as never, (e: any) => {
                    logger.debug(`Query: ${e.query}`, 'Prisma', {
                        duration: `${e.duration}ms`,
                        params: e.params,
                    });
                });
            }

            // Log errors
            this.instance.$on('error' as never, (e: any) => {
                logger.error('Prisma error', e, 'Prisma');
            });

            // Log warnings
            this.instance.$on('warn' as never, (e: any) => {
                logger.warn('Prisma warning', 'Prisma', { message: e.message });
            });

            // Store in global for hot reload (development)
            if (process.env.NODE_ENV !== 'production') {
                global.__prisma = this.instance;
            }
        }

        return this.instance;
    }

    static async connect(): Promise<void> {
        const client = this.getInstance();
        try {
            await client.$connect();
            logger.info('Database connected successfully', 'Database');
        } catch (error) {
            logger.error('Failed to connect to database', error as Error, 'Database');
            throw error;
        }
    }

    static async disconnect(): Promise<void> {
        if (this.instance) {
            await this.instance.$disconnect();
            logger.info('Database disconnected', 'Database');
        }
    }

    static async healthCheck(): Promise<boolean> {
        try {
            const client = this.getInstance();
            await client.$queryRaw`SELECT 1`;
            return true;
        } catch (error) {
            logger.error('Database health check failed', error as Error, 'Database');
            return false;
        }
    }
}

// Export singleton instance
export const prisma = DatabaseConnection.getInstance();

// Export class for advanced usage
export { DatabaseConnection };

// Graceful shutdown
process.on('beforeExit', async () => {
    await DatabaseConnection.disconnect();
});

process.on('SIGINT', async () => {
    await DatabaseConnection.disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await DatabaseConnection.disconnect();
    process.exit(0);
});
