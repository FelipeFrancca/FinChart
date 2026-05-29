import { execSync, spawn } from 'child_process';
import { lookup } from 'dns/promises';
import net from 'net';
import { getDatabaseUrl, parseDatabaseTarget } from './config/database';

const resolvedDatabaseUrl = getDatabaseUrl();
if (resolvedDatabaseUrl && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = resolvedDatabaseUrl;
}

async function isHostResolvable(host: string): Promise<boolean> {
    try {
        await lookup(host);
        return true;
    } catch {
        return false;
    }
}

async function isTcpReachable(host: string, port: number, timeoutMs: number = 2500): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let settled = false;

        const finish = (result: boolean) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(result);
        };

        socket.setTimeout(timeoutMs);
        socket.once('connect', () => finish(true));
        socket.once('timeout', () => finish(false));
        socket.once('error', () => finish(false));
        socket.connect(port, host);
    });
}

async function bootstrap() {
    console.log('\n🚀 INICIANDO BOOTSTRAP DO SISTEMA FINANCEIRO...\n');

    try {
        const databaseUrl = getDatabaseUrl();
        const prismaEnv = {
            ...process.env,
            ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
        };

        // 1. Gerar Prisma Client (apenas se necessário)
        console.log('📦 [1/3] Gerando Prisma Client...');
        try {
            execSync('npx prisma generate', { stdio: 'inherit', env: prismaEnv });
        } catch (error) {
            console.warn('⚠️  Aviso: Prisma Client já pode estar gerado');
        }

        // 2. Verificar e Aplicar Migrations & Seeds
        console.log('\n🗄️  [2/3] Verificando Banco de Dados...');
        // Por padrao, a API nao deve iniciar sem banco disponivel.
        const shouldContinueWithoutDb = process.env.BOOTSTRAP_ALLOW_DB_FAILURE === 'true';
        const verboseBootstrapErrors = process.env.BOOTSTRAP_VERBOSE_ERRORS === 'true';
        const databaseTarget = parseDatabaseTarget(databaseUrl ?? '');
        const isDockerHostname = databaseTarget?.host === 'postgres_db';
        const isPgAdminHostname = (databaseTarget?.host ?? '').toLowerCase().includes('pgadmin');

        try {
            if (!databaseTarget) {
                throw new Error('Configuração de banco inválida ou ausente. Não foi possível extrair host/porta do banco.');
            }

            console.log(`   ℹ️  Destino: ${databaseTarget.protocol}://${databaseTarget.host}:${databaseTarget.port}/${databaseTarget.database}`);

            console.log('   🔎 Testando resolução de host...');
            const hostResolvable = await isHostResolvable(databaseTarget.host);
            if (!hostResolvable) {
                throw new Error(`Host do banco não resolvido: ${databaseTarget.host}`);
            }
            console.log('   ✅ Host resolvido com sucesso');

            console.log('   🔌 Testando conexão TCP...');
            const tcpReachable = await isTcpReachable(databaseTarget.host, databaseTarget.port);
            if (!tcpReachable) {
                throw new Error(`Sem conexão TCP com ${databaseTarget.host}:${databaseTarget.port}`);
            }
            console.log('   ✅ Porta do banco acessível');

            // Aplica migrations pendentes (tanto em dev quanto prod)
            console.log('   🔄 Aplicando migrations...');
            execSync('npx prisma migrate deploy', { stdio: 'inherit', env: prismaEnv });
            console.log('   ✅ Migrations aplicadas com sucesso');

            // Verifica se precisa rodar seeds (apenas se não houver usuários)
            // Importação dinâmica para garantir que o client já foi gerado
            const { PrismaClient } = require('@prisma/client');
            const prisma = new PrismaClient({
                datasourceUrl: databaseUrl
            });
            
            const userCount = await prisma.user.count();
            if (userCount === 0) {
                console.log('   🌱 Banco vazio detectado. Rodando seeds...');
                execSync('npx prisma db seed', { stdio: 'inherit', env: prismaEnv });
                console.log('   ✅ Seeds executados com sucesso');
            } else {
                console.log('   ℹ️  Banco já populado. Pulando seeds.');
            }
            
            await prisma.$disconnect();

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`   ❌ Falha na preparação do banco: ${message}`);

            if (verboseBootstrapErrors && error) {
                console.error('   🧪 Detalhes técnicos:');
                console.error(error);
            }

            if (isDockerHostname) {
                console.warn('   💡 Dica: sua configuração de banco usa o host "postgres_db" (rede Docker).');
                console.warn('      - Se estiver rodando local sem Docker, use "localhost" em DB_HOST ou DATABASE_URL.');
                console.warn('      - Se estiver com Docker, suba o banco antes do backend.');
                console.warn('      - Se o banco for remoto de produção, use o hostname/IP público da instância.');
            }

            if (isPgAdminHostname) {
                console.warn('   💡 Dica: o host informado parece ser do pgAdmin (interface web), não do PostgreSQL.');
                console.warn('      - Use o host/IP do servidor do banco (porta 5432), não a URL do painel pgAdmin.');
            }

            if (!shouldContinueWithoutDb) {
                throw error;
            }

            console.warn('   ⚠️  Continuando sem validar migrations por BOOTSTRAP_ALLOW_DB_FAILURE=true.');
        }

        // 3. Iniciar Servidor
        console.log('\n⚡ [3/3] Iniciando API em modo Watch...\n');

        // Inicia o servidor com hot reload
        const server = spawn('bun', ['--watch', 'src/index.ts'], {
            stdio: 'inherit',
            shell: true,
            env: { ...process.env }
        });

        // Mantém o processo principal vivo
        process.on('SIGINT', () => {
            console.log('\n\n🛑 Encerrando servidor...');
            server.kill('SIGINT');
            process.exit(0);
        });

        process.on('SIGTERM', () => {
            console.log('\n\n🛑 Encerrando servidor...');
            server.kill('SIGTERM');
            process.exit(0);
        });

        server.on('close', (code) => {
            console.log(`\n📴 Servidor encerrado com código ${code}`);
            process.exit(code ?? 0);
        });

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('\n❌ ERRO FATAL NA INICIALIZAÇÃO:');
        console.error(`   ${message}`);
        process.exit(1);
    }
}

bootstrap();
