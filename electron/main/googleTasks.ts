import dayjs from "dayjs";
import { google } from "googleapis";
import { getGoogleClient } from "./googleAuth";

type GoogleTaskItem = {
  id: string;
  taskListId: string;
  taskListTitle: string;
  title: string;
  notes: string | null;
  due: string | null;
  status: "needsAction" | "completed";
  completedAt: string | null;
};

function createTasksApi() {
  const client = getGoogleClient();
  if (!client) return null;
  return google.tasks({ version: "v1", auth: client });
}

function normalizeTaskStatus(status: string | null | undefined): "needsAction" | "completed" {
  return status === "completed" ? "completed" : "needsAction";
}

export async function listGoogleTasksByDate(dateIso: string): Promise<GoogleTaskItem[]> {
  const api = createTasksApi();
  if (!api) return [];

  if (!dayjs(dateIso).isValid()) {
    return [];
  }

  const taskListsResp = await api.tasklists.list({ maxResults: 100 });
  const taskLists = taskListsResp.data.items ?? [];
  const result: GoogleTaskItem[] = [];

  for (const taskList of taskLists) {
    if (!taskList.id) continue;

    let pageToken: string | undefined;
    do {
      const tasksResp = await api.tasks.list({
        tasklist: taskList.id,
        maxResults: 100,
        showCompleted: true,
        showDeleted: false,
        showHidden: true,
        pageToken
      });

      for (const task of tasksResp.data.items ?? []) {
        if (!task.id) continue;
        const due = task.due ?? null;
        if (!due) continue;
        const dueDate = due.slice(0, 10);
        if (dueDate !== dateIso) continue;
        result.push({
          id: task.id,
          taskListId: taskList.id,
          taskListTitle: taskList.title ?? "할 일",
          title: task.title?.trim() || "(제목 없음)",
          notes: task.notes ?? null,
          due,
          status: normalizeTaskStatus(task.status),
          completedAt: task.completed ?? null
        });
      }

      pageToken = tasksResp.data.nextPageToken ?? undefined;
    } while (pageToken);
  }

  return result.sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "needsAction" ? -1 : 1;
    }
    const dueA = a.due ? dayjs(a.due).valueOf() : Number.MAX_SAFE_INTEGER;
    const dueB = b.due ? dayjs(b.due).valueOf() : Number.MAX_SAFE_INTEGER;
    if (dueA !== dueB) return dueA - dueB;
    return a.title.localeCompare(b.title, "ko");
  });
}

export async function listTodayGoogleTasks(): Promise<GoogleTaskItem[]> {
  return listGoogleTasksByDate(dayjs().format("YYYY-MM-DD"));
}

export async function completeGoogleTask(taskListId: string, taskId: string, completed = true): Promise<{ ok: true } | { ok: false; error: string }> {
  const api = createTasksApi();
  if (!api) {
    return { ok: false, error: "Google is not connected." };
  }
  try {
    await api.tasks.patch({
      tasklist: taskListId,
      task: taskId,
      requestBody: completed
        ? {
            status: "completed",
            completed: new Date().toISOString()
          }
        : {
            status: "needsAction"
          }
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function createGoogleTask(input: { title: string; dateIso: string; taskListId?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const api = createTasksApi();
  if (!api) {
    return { ok: false, error: "Google is not connected." };
  }
  const date = dayjs(input.dateIso);
  if (!date.isValid()) {
    return { ok: false, error: "Invalid date." };
  }
  try {
    let taskListId = input.taskListId;
    if (!taskListId) {
      const taskListsResp = await api.tasklists.list({ maxResults: 1 });
      taskListId = taskListsResp.data.items?.[0]?.id ?? undefined;
    }
    if (!taskListId) {
      return { ok: false, error: "No task list is available." };
    }
    await api.tasks.insert({
      tasklist: taskListId,
      requestBody: {
        title: input.title.trim(),
        // Keep calendar date stable for date-only task filtering.
        due: `${date.format("YYYY-MM-DD")}T00:00:00.000Z`,
        status: "needsAction"
      }
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteGoogleTask(taskListId: string, taskId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const api = createTasksApi();
  if (!api) {
    return { ok: false, error: "Google is not connected." };
  }
  try {
    await api.tasks.delete({ tasklist: taskListId, task: taskId });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
