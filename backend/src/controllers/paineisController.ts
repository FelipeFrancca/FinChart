import { Request, Response } from 'express';
import * as paineisServico from '../services/paineisServico';
import { AuthRequest } from '../middleware/auth';
import { DashboardRole } from '@prisma/client';

export const adicionarMembro = async (req: AuthRequest, res: Response) => {
    const { email, role } = req.body;
    const membro = await paineisServico.addMember(req.user!.userId, req.params.id, email, role as DashboardRole);
    res.status(201).json({ success: true, data: membro });
};

export const removerMembro = async (req: AuthRequest, res: Response) => {
    await paineisServico.removeMember(req.user!.userId, req.params.id, req.params.userId);
    res.status(204).send();
};

export const listarMembros = async (req: AuthRequest, res: Response) => {
    const membros = await paineisServico.listMembers(req.user!.userId, req.params.id);
    res.json({ success: true, data: membros });
};

export const atualizarMembro = async (req: AuthRequest, res: Response) => {
    const { role } = req.body;
    const membro = await paineisServico.updateMemberRole(
        req.user!.userId,
        req.params.id,
        req.params.userId,
        role as DashboardRole
    );
    res.json({ success: true, data: membro });
};

export const aprovarMembro = async (req: AuthRequest, res: Response) => {
    const membro = await paineisServico.approveMember(
        req.user!.userId,
        req.params.id,
        req.params.userId
    );
    res.json({ success: true, data: membro });
};

export const listarDashboards = async (req: AuthRequest, res: Response) => {
    const dashboards = await paineisServico.listDashboards(req.user!.userId);
    res.json({ success: true, data: dashboards });
};

export const criarDashboard = async (req: AuthRequest, res: Response) => {
    const { title, description } = req.body;
    const dashboard = await paineisServico.createDashboard(req.user!.userId, title, description);
    res.status(201).json({ success: true, data: dashboard });
};

export const atualizarDashboard = async (req: AuthRequest, res: Response) => {
    const { title, description, imapConfigurationIds } = req.body;
    const dashboard = await paineisServico.updateDashboard(req.user!.userId, req.params.id, { title, description, imapConfigurationIds });
    res.json({ success: true, data: dashboard });
};

export const excluirDashboard = async (req: AuthRequest, res: Response) => {
    await paineisServico.deleteDashboard(req.user!.userId, req.params.id);
    res.status(204).send();
};


export const criarConvite = async (req: AuthRequest, res: Response) => {
    const { role, expiresAt, isOneTime } = req.body;
    const invite = await paineisServico.createInvite(
        req.user!.userId,
        req.params.id,
        {
            role: role as DashboardRole,
            expiresAt: expiresAt ? new Date(expiresAt) : undefined,
            isOneTime
        }
    );
    res.status(201).json({ success: true, data: invite });
};

export const aceitarConvite = async (req: AuthRequest, res: Response) => {
    const { code } = req.body;
    const dashboard = await paineisServico.acceptInvite(req.user!.userId, code);
    res.json({ success: true, data: dashboard });
};

export const obterPreviewConvite = async (req: AuthRequest, res: Response) => {
    const preview = await paineisServico.getSharedPreview(req.params.code);
    res.json({ success: true, data: preview });
};
