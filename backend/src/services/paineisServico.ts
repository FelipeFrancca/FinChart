import { Dashboard, DashboardRole, DashboardMember, MemberStatus } from '@prisma/client';
import { prisma } from '../database/conexao';
import { NotFoundError, ForbiddenError } from '../utils/AppError';
import emailServico from './emailServico';
import { logger } from '../utils/logger';
import { getNotificationPreferences } from './notificationPreferencesServico';

// Verificar permissão
export async function checkPermission(userId: string, dashboardId: string, requiredRole: DashboardRole[] = ['OWNER', 'EDITOR', 'VIEWER']) {
  const member = await prisma.dashboardMember.findUnique({
    where: {
      dashboardId_userId: { userId, dashboardId }
    }
  });

  // Se for dono, acesso total
  const dashboard = await prisma.dashboard.findUnique({ where: { id: dashboardId } });
  if (dashboard?.ownerId === userId) return 'OWNER';

  if (!member) {
    throw new ForbiddenError('Acesso negado ao dashboard');
  }

  // Verifica status do membro
  if (member.status !== 'APPROVED') {
    throw new ForbiddenError('Sua solicitação de acesso ainda está pendente de aprovação.');
  }

  if (!requiredRole.includes(member.role)) {
    throw new ForbiddenError('Permissão insuficiente');
  }

  return member.role;
}

export async function addMember(ownerId: string, dashboardId: string, email: string, role: DashboardRole) {
  // Verificar se quem adiciona é Owner
  await checkPermission(ownerId, dashboardId, ['OWNER']);

  const userToAdd = await prisma.user.findUnique({ where: { email } });
  if (!userToAdd) throw new NotFoundError('Usuário não encontrado');

  // Buscar informações do dashboard e do owner para o email
  const dashboard = await prisma.dashboard.findUnique({
    where: { id: dashboardId },
    include: { owner: { select: { name: true, email: true } } }
  });

  const member = await prisma.dashboardMember.create({
    data: {
      userId: userToAdd.id,
      dashboardId,
      role,
      status: 'APPROVED' // Direct add is always approved
    }
  });

  // Enviar email de notificação de forma assíncrona (não bloqueia a resposta)
  if (dashboard && role !== 'OWNER') {
    // Verificar preferências do usuário destinatário
    getNotificationPreferences(userToAdd.id).then((preferences) => {
      if (preferences.emailEnabled && preferences.emailDashboardInvites) {
        emailServico.enviarNotificacaoCompartilhamento({
          email: userToAdd.email,
          nomeDestinatario: userToAdd.name || 'Usuário',
          nomeRemetente: dashboard.owner.name || 'Um usuário',
          dashboardTitle: dashboard.title,
          dashboardId: dashboard.id,
          role: role as 'VIEWER' | 'EDITOR',
        }).catch((error) => {
          logger.error('Erro ao enviar email de notificação de compartilhamento:', error);
        });
      } else {
        logger.info(`Email de compartilhamento não enviado para ${userToAdd.email} - notificações desabilitadas`);
      }
    }).catch((error) => {
      logger.error('Erro ao verificar preferências de notificação:', error);
    });
  }

  return member;
}

export async function removeMember(requesterId: string, dashboardId: string, userIdToRemove: string) {
  await checkPermission(requesterId, dashboardId, ['OWNER']);

  return prisma.dashboardMember.delete({
    where: {
      dashboardId_userId: { userId: userIdToRemove, dashboardId }
    }
  });
}

export async function updateMemberRole(requesterId: string, dashboardId: string, userId: string, role: DashboardRole) {
  await checkPermission(requesterId, dashboardId, ['OWNER']);

  // Cannot change to OWNER role
  if (role === 'OWNER') {
    throw new ForbiddenError('Não é possível alterar para proprietário');
  }

  return prisma.dashboardMember.update({
    where: {
      dashboardId_userId: { userId, dashboardId }
    },
    data: { role },
    include: { user: { select: { id: true, name: true, email: true, avatar: true } } }
  });
}

// Aprovar membro
export async function approveMember(ownerId: string, dashboardId: string, memberId: string) {
  await checkPermission(ownerId, dashboardId, ['OWNER']);

  const member = await prisma.dashboardMember.update({
    where: {
      dashboardId_userId: { userId: memberId, dashboardId }
    },
    data: { status: 'APPROVED' },
    include: { user: true, dashboard: true }
  });

  // Notificar o membro aprovado (opcional, reutilizando lógica de email)
  try {
    const preferences = await getNotificationPreferences(memberId);
    if (preferences.emailEnabled && preferences.emailDashboardInvites) {
      await emailServico.enviarNotificacaoCompartilhamento({
        email: member.user.email,
        nomeDestinatario: member.user.name || 'Usuário',
        nomeRemetente: 'Administrador do Dashboard',
        dashboardTitle: member.dashboard.title,
        dashboardId: member.dashboard.id,
        role: member.role as 'VIEWER' | 'EDITOR'
      });
    }
  } catch (error) {
    logger.error('Erro ao enviar notificação de aprovação:', error);
  }

  return member;
}

export async function listMembers(userId: string, dashboardId: string) {
  await checkPermission(userId, dashboardId);

  const [members, dashboard] = await Promise.all([
    prisma.dashboardMember.findMany({
      where: { dashboardId },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } }
    }),
    prisma.dashboard.findUnique({
      where: { id: dashboardId },
      select: { ownerId: true }
    })
  ]);

  return {
    members,
    ownerId: dashboard?.ownerId || null
  };
}

// Listar todos os dashboards do usuário (próprios e como membro)
export async function listDashboards(userId: string) {
  // Buscar dashboards onde o usuário é dono
  const ownedDashboards = await prisma.dashboard.findMany({
    where: { ownerId: userId },
    include: {
      owner: { select: { id: true, name: true, email: true, avatar: true } },
      members: {
        include: { user: { select: { id: true, name: true, email: true, avatar: true } } }
      },
      imapConfigurations: { select: { id: true, emailUser: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Buscar dashboards onde o usuário é membro
  const memberDashboards = await prisma.dashboardMember.findMany({
    where: {
      userId,
      status: 'APPROVED'
    },
    include: {
      dashboard: {
        include: {
          owner: { select: { id: true, name: true, email: true, avatar: true } },
          members: {
            include: { user: { select: { id: true, name: true, email: true, avatar: true } } }
          },
          imapConfigurations: { select: { id: true, emailUser: true } }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Combinar e formatar os resultados
  const owned = ownedDashboards.map(d => ({ ...d, role: 'OWNER' as DashboardRole, isOwner: true }));
  const member = memberDashboards.map(m => ({ ...m.dashboard, role: m.role, isOwner: false }));

  return [...owned, ...member];
}

// Criar novo dashboard
export async function createDashboard(userId: string, title: string, description?: string) {
  return prisma.dashboard.create({
    data: {
      title,
      description,
      ownerId: userId
    },
    include: {
      owner: { select: { id: true, name: true, email: true, avatar: true } },
      members: true
    }
  });
}

// Atualizar dashboard
export async function updateDashboard(userId: string, dashboardId: string, updates: { title?: string; description?: string; imapConfigurationIds?: string[] }) {
  await checkPermission(userId, dashboardId, ['OWNER']);

  const { imapConfigurationIds, ...scalarUpdates } = updates;

  return prisma.dashboard.update({
    where: { id: dashboardId },
    data: {
      ...scalarUpdates,
      ...(imapConfigurationIds !== undefined && {
        imapConfigurations: {
          set: imapConfigurationIds.map(id => ({ id })),
        },
      }),
    },
    include: {
      owner: { select: { id: true, name: true, email: true, avatar: true } },
      members: true,
      imapConfigurations: { select: { id: true, emailUser: true } },
    }
  });
}

// Deletar dashboard
export async function deleteDashboard(userId: string, dashboardId: string) {
  await checkPermission(userId, dashboardId, ['OWNER']);

  // Delete all related data in order
  // Delete all related data in order
  await prisma.$transaction(async (tx) => {
    // Delete transactions
    await tx.transaction.deleteMany({ where: { dashboardId } });

    // Accounts vinculadas AO DASHBOARD (opcional, já que account tem dashboardId nullable)
    console.log('Deletando contas vinculadas...');
    await tx.account.deleteMany({ where: { dashboardId } });

    // Recurring transactions
    await tx.recurringTransaction.deleteMany({ where: { dashboardId } });

    // Alerts
    await tx.alert.deleteMany({ where: { dashboardId } });

    // Delete invites
    await tx.dashboardInvite.deleteMany({ where: { dashboardId } });

    // Delete members
    await tx.dashboardMember.deleteMany({ where: { dashboardId } });

    // Finally delete the dashboard itself
    await tx.dashboard.delete({ where: { id: dashboardId } });
  });

  return { success: true };
}

// Criar convite
export async function createInvite(userId: string, dashboardId: string, opts: { role?: DashboardRole, expiresAt?: Date, isOneTime?: boolean }) {
  await checkPermission(userId, dashboardId, ['OWNER', 'EDITOR']);

  const code = Math.random().toString(36).substring(2, 10).toUpperCase();

  return prisma.dashboardInvite.create({
    data: {
      dashboardId,
      code,
      role: opts.role || 'VIEWER',
      expiresAt: opts.expiresAt,
      isOneTime: opts.isOneTime || false,
      createdById: userId
    }
  });
}

// Aceitar convite
export async function acceptInvite(userId: string, code: string) {
  const invite = await prisma.dashboardInvite.findUnique({
    where: { code },
    include: { dashboard: { include: { owner: true } } }
  });

  if (!invite) throw new NotFoundError('Convite não encontrado');
  if (invite.expiresAt && invite.expiresAt < new Date()) throw new ForbiddenError('Convite expirado');
  if (invite.isOneTime && invite.usedById) throw new ForbiddenError('Convite já utilizado');

  // Verificar se já é membro
  const existingMember = await prisma.dashboardMember.findUnique({
    where: {
      dashboardId_userId: {
        userId,
        dashboardId: invite.dashboardId
      }
    }
  });

  if (existingMember) throw new ForbiddenError('Você já é membro deste dashboard');

  // Adicionar membro como PENDING
  const member = await prisma.dashboardMember.create({
    data: {
      userId,
      dashboardId: invite.dashboardId,
      role: invite.role,
      status: 'PENDING'
    }
  });

  // Marcar convite como usado se for one-time
  if (invite.isOneTime) {
    await prisma.dashboardInvite.update({
      where: { id: invite.id },
      data: { usedById: userId }
    });
  }

  // Notificar o dono do dashboard sobre a solicitação pendente
  logger.info(`Usuário ${userId} solicitou acesso ao dashboard ${invite.dashboardId} via convite (PENDING)`);

  return invite.dashboard;
}

// Obter preview do convite
export async function getSharedPreview(code: string) {
  const invite = await prisma.dashboardInvite.findUnique({
    where: { code },
    include: {
      dashboard: {
        include: {
          owner: { select: { id: true, name: true, avatar: true } }
        }
      },
      createdBy: { select: { id: true, name: true, avatar: true } }
    }
  });

  if (!invite) throw new NotFoundError('Convite não encontrado');
  if (invite.expiresAt && invite.expiresAt < new Date()) throw new ForbiddenError('Convite expirado');
  if (invite.isOneTime && invite.usedById) throw new ForbiddenError('Convite já utilizado');

  return {
    dashboard: {
      title: invite.dashboard.title,
      description: invite.dashboard.description,
    },
    role: invite.role,
    inviter: {
      name: invite.createdBy?.name || invite.dashboard.owner.name,
      avatar: invite.createdBy?.avatar || invite.dashboard.owner.avatar,
    },
    expiresAt: invite.expiresAt,
  };
}
