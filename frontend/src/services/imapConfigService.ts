import api from './api';

export interface ImapConfigData {
  id: string;
  userId: string;
  host: string;
  port: number;
  emailUser: string;
  emailPass?: string; // Optional for submission
  encryptedPassword?: string; // Returned from backend
  isActive: boolean;
  dashboards?: { id: string; title: string }[];
}

export const imapConfigService = {
  // Pega todas as configurações cadastradas pelo usuário logado
  getUserConfigs: async (): Promise<ImapConfigData[]> => {
    const { data } = await api.get(`/imap-config`);
    return data.data;
  },

  // Cria uma nova configuração IMAP
  createConfig: async (configData: Partial<ImapConfigData>): Promise<ImapConfigData> => {
    const { data } = await api.post(`/imap-config`, configData);
    return data.data;
  },

  // Atualiza uma configuração existente
  updateConfig: async (id: string, configData: Partial<ImapConfigData>): Promise<ImapConfigData> => {
    const { data } = await api.put(`/imap-config/${id}`, configData);
    return data.data;
  },

  // Deleta uma configuração
  deleteConfig: async (id: string): Promise<void> => {
    await api.delete(`/imap-config/${id}`);
  },

  // Testa a conexão com as credenciais informadas
  testConnection: async (data: { host: string; port: number; emailUser: string; emailPass: string } | { configId: string }): Promise<{ success: boolean; message?: string; error?: string }> => {
    const { data: result } = await api.post(`/imap-config/test`, data);
    return result;
  },
};
