import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { imapConfigService, ImapConfigData } from '../services/imapConfigService';
import { dashboardService } from '../services/api';

// Hooks para as configurações do usuário
export const useUserImapConfigs = () => {
  return useQuery({
    queryKey: ['imapConfigs'],
    queryFn: () => imapConfigService.getUserConfigs(),
  });
};

export const useCreateImapConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<ImapConfigData>) => imapConfigService.createConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imapConfigs'] });
    },
  });
};

export const useUpdateImapConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ImapConfigData> }) => 
      imapConfigService.updateConfig(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imapConfigs'] });
    },
  });
};

export const useDeleteImapConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => imapConfigService.deleteConfig(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imapConfigs'] });
    },
  });
};

// Hook para vincular chaves a um dashboard (usa o updateDashboard existente)
export const useLinkImapToDashboard = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dashboardId, imapConfigurationIds }: { dashboardId: string; imapConfigurationIds: string[] }) => 
      dashboardService.update(dashboardId, { imapConfigurationIds }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', variables.dashboardId] });
      queryClient.invalidateQueries({ queryKey: ['imapConfigs'] });
    },
  });
};
