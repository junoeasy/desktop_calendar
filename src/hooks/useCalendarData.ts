import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/lib/store";

export function useSettings() {
  const setSettings = useAppStore((s) => s.setSettings);
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const settings = await window.desktopCalApi.settings.get();
      setSettings(settings);
      return settings;
    }
  });
}

export function useMonthEvents() {
  const year = useAppStore((s) => s.monthYear);
  const month = useAppStore((s) => s.month);
  return useQuery({
    queryKey: ["month-events", year, month],
    queryFn: () => window.desktopCalApi.events.month({ year, month }),
    refetchInterval: 15000,
    refetchOnWindowFocus: true
  });
}

export function useDayEvents() {
  const selectedDate = useAppStore((s) => s.selectedDate);
  return useQuery({
    queryKey: ["day-events", selectedDate],
    queryFn: () => window.desktopCalApi.events.day(selectedDate),
    refetchInterval: 15000,
    refetchOnWindowFocus: true
  });
}

export function useSyncNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => window.desktopCalApi.sync.now({ forceFull: true }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["month-events"] });
      void queryClient.invalidateQueries({ queryKey: ["day-events"] });
    }
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => window.desktopCalApi.events.create(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["month-events"] });
      void queryClient.invalidateQueries({ queryKey: ["day-events"] });
    }
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => window.desktopCalApi.events.update(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["month-events"] });
      void queryClient.invalidateQueries({ queryKey: ["day-events"] });
    }
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => window.desktopCalApi.events.delete({ eventId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["month-events"] });
      void queryClient.invalidateQueries({ queryKey: ["day-events"] });
    }
  });
}
