# Focus Widget Architecture

## Overview

The Focus Widget is a **read-only Android home screen widget** that displays the user's current "Hero Task" (focus task) and remaining task count. It does **not** perform mutations directly—all writes go through the main React Native app.

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ANDROID WIDGET PROCESS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. Android requests widget render                                          │
│  2. `focusWidgetTaskHandler` (widget-task-handler.tsx) executes             │
│  3. Reads snapshot from **AsyncStorage** (local, on-device)                 │
│  4. Renders `FocusWidget` with snapshot data:                               │
│     - focusTaskTitle, focusTaskId                                           │
│     - focusTaskDescription, deadline, deadlineTime                          │
│     - remainingTaskCount                                                    │
│  5. Entire widget has `clickAction="OPEN_APP"` — tap opens main app         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │ Periodic sync / App triggers sync
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      MAIN APP PROCESS (React Native)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  `synchronizeFocusWidget(userId)` in `focus-widget-sync.ts`                 │
│                                                                             │
│  1. Calls `fetchPendingTaskQueue()` → queries **Supabase**                  │
│     - Filters: `status='pending'`, user's personal list                     │
│     - Orders: focus task (`is_focus=true`) first, then by position/created  │
│                                                                             │
│  2. Determines hero task:                                                   │
│     ```typescript                                                           │
│     const focusTask = tasks.find(t => t.isFocus) ?? tasks[0] ?? null;       │
│     ```                                                                     │
│                                                                             │
│  3. Builds snapshot:                                                        │
│     ```typescript                                                           │
│     {                                                                       │
│       schemaVersion: 1,                                                     │
│       userId,                                                               │
│       focusTaskId: focusTask?.id ?? null,                                   │
│       focusTaskTitle: focusTask?.title ?? null,                             │
│       focusTaskDescription: focusTask?.description ?? null,                 │
│       focusTaskDeadline: focusTask?.deadline ?? null,                       │
│       focusTaskDeadlineTime: focusTask?.deadlineTime ?? null,               │
│       remainingTaskCount: focusTask ? tasks.length - 1 : 0,                 │
│     }                                                                       │
│     ```                                                                     │
│                                                                             │
│  4. Validates via `isFocusWidgetSnapshot()` → writes to **AsyncStorage**    │
│  5. Calls `requestWidgetUpdate()` → triggers widget re-render               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## When Does Sync Happen?

The widget **never** fetches from Supabase directly. Sync is triggered by the **main app**:

| Trigger | Location |
|---------|----------|
| App comes to foreground | `RootNavigator` → `AppState` change listener |
| Task created/updated/completed | `subscribeToTaskChanges` → `synchronizeFocusWidget` |
| User logs in / account switches | `setFocusWidgetAccount()` |
| Manual pull-to-refresh in app | Home screen refresh |
| Task deadline changes | `subscribeToTaskDeadlineChanges` |

---

## Widget "Done" Button — Current Behavior

**The widget cannot mark tasks as complete.**

```tsx
// focus-widget.tsx
<FlexWidget clickAction="OPEN_APP" ...>
  {/* Entire widget is a single tap target — opens main app */}
</FlexWidget>
```

| Action | Supported? | Notes |
|--------|------------|-------|
| View hero task | ✅ | From AsyncStorage snapshot |
| View remaining count | ✅ | From snapshot |
| Tap to open app | ✅ | `clickAction="OPEN_APP"` |
| Mark task complete | ❌ | Not implemented |
| Switch hero task | ❌ | Not implemented |

---

## "Done" on Widget (Future Enhancement)

Need to implement **widget actions** via `react-native-android-widget`:

```tsx
// widget-task-handler.tsx
case 'WIDGET_CLICK': {
  const action = props.widgetExtras?.action;
  if (action === 'COMPLETE_TASK') {
    // Option A: Direct Supabase call (needs auth token in widget process)
    // Option B: Local optimistic queue + background sync
    // Option C: Broadcast intent to app (app processes when opened)
  }
  break;
}
```

### Architectural Options for Widget Writes

| Approach | Pros | Cons |
|----------|------|------|
| **A: Direct Supabase from widget** | Immediate sync | Widget process has no Supabase client; needs secure auth token storage |
| **B: Local queue + app processes on open** | Works offline; simpler | Delayed sync until app opens |
| **C: Broadcast intent to app** | App handles auth/Supabase | App must be running or wake up via `BroadcastReceiver` |

---

## Sync Guarantees

- **Eventually consistent** — snapshot may be stale if app hasn't synced recently
- **Read-only widget** — no offline writes from widget process
- **App is source of truth** — all mutations go through app → Supabase → AsyncStorage → Widget

---

## File Reference

| File | Responsibility |
|------|----------------|
| `src/features/focus-widget/focus-widget.tsx` | Widget UI (React Native for Android Widget) |
| `src/features/focus-widget/widget-task-handler.tsx` | Widget entry point (`WIDGET_ADDED`, `WIDGET_UPDATE`, `WIDGET_CLICK`) |
| `src/features/focus-widget/focus-widget-sync.ts` | Main-app sync logic (`synchronizeFocusWidget`) |
| `src/features/focus-widget/focus-widget-snapshot.ts` | AsyncStorage read/write + validation |
| `src/features/tasks/tasks.api.ts` | `fetchPendingTaskQueue()` — Supabase query |
| `src/app/_layout.tsx` | AppState listener triggers sync on foreground |

---

## Summary Sequence

```
┌─────────┐     AsyncStorage      ┌─────────────┐     Supabase        ┌─────────┐
│ Widget  │ ◄──────────────────── │   Main App  │ ──────────────────► │ Database│
│ Process │   (snapshot only)     │ (Read/Write)│  (source of truth)  │         │
└────┬────┘                       └──────┬──────┘                     └────┬────┘
     │                                    │                                │
     │  1. Render → read snapshot         │                                │
     │  2. Display hero task              │                                │
     │                                    │  3. User marks done in app     │
     │                                    │  4. completeTask() ──────────► │
     │                                    │  5. subscribeToTaskChanges()   │
     │                                    │  6. synchronizeFocusWidget()   │
     │                                    │  7. fetchPendingTaskQueue() ──►│
     │                                    │  8. Build snapshot             │
     │                                    │  9. Write AsyncStorage         │
     │                                    │ 10. requestWidgetUpdate()      │
     │◄────────────── re-render ──────────┘                                │
     │                                                                     │
     │  [OPEN_APP] ──────────────────────────────────────────────────────► │
     │                                                                     │
```