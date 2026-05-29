type DatabaseTarget = {
    host: string;
    port: number;
    database: string;
    protocol: string;
};

function buildDatabaseUrlFromParts(): string | null {
    const host = process.env.DB_HOST?.trim();
    const user = process.env.DB_USER?.trim();
    const password = process.env.DB_PASSWORD ?? '';
    const database = process.env.DB_NAME?.trim();

    if (!host || !user || !database) {
        return null;
    }

    const port = Number(process.env.DB_PORT ?? '5432');
    const schema = process.env.DB_SCHEMA?.trim() || 'public';
    const encodedUser = encodeURIComponent(user);
    const encodedPassword = encodeURIComponent(password);

    return `postgresql://${encodedUser}:${encodedPassword}@${host}:${port}/${database}?schema=${encodeURIComponent(schema)}`;
}

export function getDatabaseUrl(): string | null {
    return process.env.DATABASE_URL?.trim() || buildDatabaseUrlFromParts();
}

export function parseDatabaseTarget(databaseUrl: string): DatabaseTarget | null {
    try {
        const parsed = new URL(databaseUrl);
        return {
            host: parsed.hostname,
            port: parsed.port ? Number(parsed.port) : 5432,
            database: parsed.pathname.replace(/^\//, '') || 'unknown',
            protocol: parsed.protocol.replace(':', ''),
        };
    } catch {
        return null;
    }
}