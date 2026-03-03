import { create } from "zustand";
import dayjs from "dayjs";
import type { AppSettings } from "@shared/models";

type AppState = {
  selectedDate: string;
  monthYear: number;
  month: number;
  settings: AppSettings | null;
  setSelectedDate: (date: string) => void;
  setMonth: (year: number, month: number) => void;
  setSettings: (settings: AppSettings) => void;
};

export const useAppStore = create<AppState>((set) => ({
  selectedDate: dayjs().format("YYYY-MM-DD"),
  monthYear: dayjs().year(),
  month: dayjs().month() + 1,
  settings: null,
  setSelectedDate: (selectedDate) => set({ selectedDate }),
  setMonth: (monthYear, month) => set({ monthYear, month }),
  setSettings: (settings) => set({ settings })
}));
