# Unti-Unti

> **Unti-Unti** — Cebuano for *"step by step"* or *"little by little"*. A cozy, step-by-step habit & goal tracker built with React Native (Expo), Supabase, and NativeWind. Track your progress, build better habits, and watch your growth unfold—one gentle step at a time.

---

## App Identity & Purpose

**Unti-Unti** is a personal productivity mobile application designed around the philosophy that meaningful progress happens through small, consistent steps. The name comes from the Cebuano word meaning "step by step" or "little by little" — reflecting the app's core belief that sustainable habits and goals are built incrementally, not through grand gestures.

### Core Philosophy
- **Low pressure, high warmth**: No streaks to break, no harsh penalties. Just gentle encouragement.
- **Hero Task focus**: One primary focus at a time (the "Hero Task"), with other tasks queued behind it.
- **Wins over streaks**: The "Wins" screen celebrates completed work as treasures, grouped by date.
- **Collaborative by design**: Shared lists let you coordinate with others without losing personal focus.
- **Offline-first optimism**: Optimistic UI updates with undo toasts — changes feel instant, sync happens in background.

---

## App Screens & Flows

| Screen | Description | Screenshot Placeholder |
|--------|-------------|------------------------|
| **Home (Hero + Queue)** | Hero Task display, stacked "Other Tasks" preview, daily habits carousel, collaborative lists, add task modal | `![Home Screen](assets/screenshots/home.png)` |
| **Wins / Treasures** | Completed tasks logbook grouped by date, mosaic placeholder, calendar navigation, edit/delete with undo | `![Wins/Treasures](assets/screenshots/wins.png)` |
| **Calendar Queue (Lists)** | Date-filtered task view, sortable (manual/priority/deadline/category/createdAt), filterable, edit/delete/complete with undo | `![Calendar Queue](assets/screenshots/calendar.png)` |
| **Profile & Settings** | Display name, username (availability check), password change, sign out | `![Profile Settings](assets/screenshots/profile.png)` |
| **Add Task Modal** | Multi-step: choose Task vs Collaborative List → form with title, description, category, deadline, priority | `![Add Task Modal](assets/screenshots/add-modal.png)` |
| **Focus Widget (Android)** | Home screen widget showing Hero Task, description/deadline, remaining count; tap opens app | `![Focus Widget](assets/screenshots/widget.png)` |
| **Night Mode / Theming** | Cozy warm palette works in both light/dark; Fredoka font throughout | `![Night Mode](assets/screenshots/night-mode.png)` |

---

## Tech Stack

| Category | Technology | Details |
|----------|------------|---------|
| **Framework** | React Native (Expo Router v3) | File-based routing, tabs layout, typed routes |
| **Styling** | NativeWind v4 / Tailwind CSS | Custom cozy color palette, Fredoka font family |
| **Backend & Auth** | Supabase | Email/password auth, PostgreSQL database, Realtime, RPCs |
| **State Management** | React Context + Local State | AuthContext for session, data-events pub/sub for cross-screen sync |
| **Database** | PostgreSQL (via Supabase) | Row-level security, triggers, RPCs for collaborative features |
| **Local Storage** | AsyncStorage | Widget snapshots, sort preferences, auth persistence |
| **Widgets** | react-native-android-widget | Read-only Android home screen widget |
| **Gestures** | react-native-gesture-handler + Reanimated 3 | Drag-to-reorder in edit mode, press-and-hold |
| **Icons** | Ionicons (@expo/vector-icons) | Consistent iconography across app |
| **Fonts** | @expo-google-fonts/fredoka | 4 weights: Regular, Medium, SemiBold, Bold |
| **Haptics** | expo-haptics | Light/medium/heavy impact, success/warning notifications |
| **Notifications** | expo-notifications | Local deadline reminders (noon day before) |
| **Calendar Picker** | Custom modal (WinsCalendarModal) | Date selection for deadlines and Wins navigation |
| **Error Boundaries** | Class component ErrorBoundary | Graceful error recovery with "Try Again" |

---

## 🔐 Authentication System

### Core Flows
- **Email & Password Sign Up** — Secure account creation with validation, stores normalized username in `user_metadata`
- **Email & Password Sign In** — JWT-based sessions with automatic refresh
- **Session Management** — Persisted via AsyncStorage, auto-refresh, sign-out clears all data
- **Profile Management** — Display name & username updates synchronized between Supabase Auth `user_metadata` and `profiles` table
- **Password Change** — Requires current password verification
- **Username Availability** — Checked via `is_username_available` RPC (case-insensitive unique index on `profiles.username`)

### Auth Context
```typescript
// src/context/AuthContext.tsx
// Provides: session, user, isLoading
// Listens to onAuthStateChange for real-time sync
```

### Example Operations
```typescript
// Sign up
await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'secure-password123',
  options: { data: { display_name: 'User Name', username: 'username' } },
});

// Sign in
await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'secure-password123',
});

// Update profile (display name / username)
await supabase.auth.updateUser({ data: { display_name: 'New Name' } });
await supabase.from('profiles').update({ display_name: 'New Name' }).eq('id', userId);

// Change password
await supabase.auth.updateUser({ password: 'new-secure-password' });

// Sign out
await supabase.auth.signOut();
```

---

## 🗄️ Database Schema

### Core Tables (managed via Supabase migrations)

```sql
-- profiles: extends auth.users
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text,
  display_name text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Case-insensitive unique username
create unique index profiles_username_lower_unique
  on public.profiles (lower(btrim(username)))
  where username is not null and btrim(username) <> '';

-- lists: personal + collaborative
create table public.lists (
  list_id uuid default gen_random_uuid() primary key,
  owner_id uuid references auth.users on delete cascade not null,
  title text not null,
  description text,
  is_collaborative boolean default false not null,
  created_at timestamp with time zone default now() not null
);

-- list_members: collaborative list membership
create table public.list_members (
  id uuid default gen_random_uuid() primary key,
  list_id uuid references public.lists on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  added_at timestamp with time zone default now() not null,
  unique (list_id, user_id)
);

-- tasks: unified table for personal + collaborative tasks
create table public.tasks (
  task_id uuid default gen_random_uuid() primary key,
  list_id uuid references public.lists on delete cascade,
  cat_id uuid references public.categories on delete set null,
  title text not null,
  description text,
  status text default 'pending' check (status in ('pending', 'completed')),
  is_focus boolean default false,
  priority text default 'medium' check (priority in ('high', 'medium', 'low')),
  deadline timestamptz,
  position integer,
  completed_date date,
  completed_time time,
  created_at timestamp with time zone default now() not null,
  user_id uuid references auth.users on delete cascade not null
);

-- categories: user-defined task categories
create table public.categories (
  cat_id uuid default gen_random_uuid() primary key,
  cat_name text not null,
  emoji_holder text,
  user_id uuid references auth.users on delete cascade not null,
  created_at timestamp with time zone default now() not null
);

-- habits: daily habit definitions
create table public.habits (
  habit_id uuid default gen_random_uuid() primary key,
  cat_id uuid references public.categories on delete set null,
  title text not null,
  date_created date not null,
  time_created time not null,
  created_at timestamp with time zone default now() not null,
  user_id uuid references auth.users on delete cascade not null
);

-- habit_logs: completion records (one per habit per day)
create table public.habit_logs (
  habit_id uuid references public.habits on delete cascade not null,
  completed_date date not null,
  completed_time time not null,
  primary key (habit_id, completed_date)
);

-- treasures (completed tasks) are NOT a separate table — they live in `tasks` with status='completed'
```

### Key RPCs (deployed in Supabase, not in repo)
- `is_username_available(username)` — check username availability
- `add_collaborator_by_username(list_id, username)` — invite by username
- `get_collaborative_list_members(list_ids)` — creator-only member listing
- `remove_collaborative_list_member(list_id, user_id)` — creator-only removal

### Row-Level Security
- **tasks**: Users see tasks where `user_id = auth.uid()` OR `list_id` in their collaborative lists
- **lists**: Owners see all their lists; members see collaborative lists they belong to
- **list_members**: Members can delete only their own row (to leave); owners can remove others

---

## 🔄 User Flows

### 1. Onboarding & Auth
```
Launch → Font load + Splash hide → AuthContext loads session
  ├─ No session → (auth)/sign-in → Sign Up / Sign In → Home
  └─ Session valid → Home (RootNavigator guards routes)
```

### 2. Home Screen (Hero Task Flow)
```
Home (index.tsx)
  ├─ fetchPendingTaskQueue() → Supabase (status=pending, personal list)
  ├─ Hero Task = first task with is_focus=true, else first task
  ├─ Other Tasks = remaining queue (collapsible stacked preview)
  ├─ Daily Habits = fetchTodayHabits() (excludes today's completions)
  ├─ Collaborative Lists = fetchCollaborativeLists() (expandable cards)
  ├─ Add Task → AddModal (choose Task vs Collaborative List)
  ├─ Complete Hero → completeTask() → promote next → emitTaskDataChanged()
  ├─ Reorder (edit mode) → persistTaskPositions() → emitTaskDataChanged()
  ├─ Set Hero → setHeroTask() → emitTaskDataChanged()
  └─ Widget Sync → synchronizeFocusWidget() (on foreground, task changes)
```

### 3. Wins / Treasures Flow
```
Wins (wins.tsx)
  ├─ fetchTreasureGroups() → completed tasks grouped by completed_date
  ├─ Mosaic tab (placeholder for future habit completion mosaic)
  ├─ Calendar icon → WinsCalendarModal → jump to date in logbook
  ├─ Tap treasure → TreasureLogCard reveals Edit/Delete actions
  ├─ Edit → EditTreasureModal → updateTreasure() → optimistic update → toast with undo
  ├─ Delete → DeleteTreasureModal → deleteTreasure() → toast with undo (restoreTreasure)
  └─ Real-time sync via subscribeToTaskChanges + subscribeToOptimisticTaskUpdates
```

### 4. Calendar Queue (Lists) Flow
```
Calendar (calendar.tsx)
  ├─ fetchPendingTaskQueue() → global ordered queue
  ├─ filterTasksByDate(selectedDate) → tasks with no deadline OR deadline >= date
  ├─ SortControl → sortCalendarTasks (manual/priority/deadline/category/createdAt)
  ├─ FilterControl → filterTasks (category/priority/deadline/createdAt)
  ├─ CalendarTaskCard:
  │   ├─ Normal: tap top → complete, tap bottom → expand details
  │   └─ Edit mode: tap → reveal Edit/Delete (TaskActions)
  ├─ Complete → completeTask() → queue advances → emitTaskDataChanged()
  ├─ Edit → EditTaskModal → updateTask() → optimistic update → toast with undo
  └─ Delete → toast with undo (restoreTask)
```

### 5. Profile Flow
```
Profile (profile.tsx)
  ├─ Display name → updateProfile() → syncs auth + profiles table
  ├─ Username → check is_username_available RPC → updateProfile() → syncs
  ├─ Password → updateUser({ password }) → requires current password
  └─ Sign Out → supabase.auth.signOut() → clears widget snapshot + notifications
```

### 6. Add Task / Collaborative List Flow
```
AddModal (add-modal.tsx)
  ├─ Step 1: Choose "Task" or "Collaborative List"
  ├─ Task Form:
  │   ├─ Title (required, ≤100 chars)
  │   ├─ Description (optional, ≤500 chars)
  │   ├─ Category (chips, from fetchCategories)
  │   ├─ Deadline (WinsCalendarModal picker, optional)
  │   └─ Priority (High/Medium/Low chips)
  └─ Collaborative List Form:
      ├─ List Name (required, ≤100 chars)
      └─ Description (optional, ≤500 chars)
```

### 7. Android Focus Widget Flow
```
Widget Process (read-only)
  ├─ Android requests render → widget-task-handler.tsx
  ├─ Reads snapshot from AsyncStorage (local, on-device)
  ├─ Renders FocusWidget with: focus task (title, description, deadline),
  │  "+N left" pill, and the next task in the queue
  └─ Entire widget: clickAction="OPEN_APP" → opens main app

Main App Process (writes snapshot)
  ├─ synchronizeFocusWidget(userId) in focus-widget-sync.ts
  ├─ fetchPendingTaskQueue() → Supabase
  ├─ Hero = task with is_focus=true else first task
  ├─ Build snapshot:
  │   {
  │     schemaVersion: 2,
  │     userId,
  │     focusTaskId,
  │     focusTaskTitle,
  │     focusTaskDescription,
  │     focusTaskDeadline,
  │     focusTaskDeadlineTime,
  │     remainingTaskCount: Math.max(0, tasks.length - 1),
  │     tasks: [hero, ...rest of the pending queue]
  │   }
  ├─ Validate via isFocusWidgetSnapshot() → write AsyncStorage
  └─ requestWidgetUpdate() → triggers widget re-render

Sync Triggers:
  • App foreground (AppState change)
  • Task created/updated/completed (subscribeToTaskChanges)
  • User login/account switch (setFocusWidgetAccount)
  • Pull-to-refresh on Home
  • Deadline changes (subscribeToTaskDeadlineChanges)
```

### 8. Local Deadline Notifications
```
Scheduling: one reminder at noon on day before each distinct upcoming deadline
Reconciliation: sign-in, app foreground, task create/edit/complete/reopen/delete/restore
Permission: Android requested only when eligible reminder needs scheduling
Storage: OS-managed (survives restart); capped to respect platform limits
Caveats: Cannot check Supabase while closed; timezone changes applied on next sync
```

---

## 🎨 Cozy Design System

### Color Palette (Tailwind custom colors)
| Token | Hex | Usage |
|-------|-----|-------|
| `cozyBg` | `#FDFBF7` | Main background |
| `deepBrown` | `#2C221E` | Primary text, headers |
| `mutedBrown` | `#7D6E6B` | Secondary text, placeholders |
| `focusHero` | `#6B8E70` | Primary actions, hero accent |
| `bgCardBg` | `#F3EFE9` | Card backgrounds |
| `taskStack` | `#E8C5B5` | Task card backgrounds |
| `habitCard` | `#E2EBE2` | Habit card backgrounds |
| `habitBackground` | `#F4EAE1` | Habit section background |
| `tabBarBg` | `#FAF6EE` | Tab bar background |
| `fabPinkBg` | `#E8C5B5` | Floating add button |
| Priority: `highPriority` `#F4C5B5`, `mediumPriority` `#F3E1B9`, `lowPriority` `#C3E2DD` |
| Metadata: `deadlineBadge` `#D6E2E9`, `timeBadge` `#E1D5E7`, `categoryBadge` `#D4E5F7`, `listsBrown` `#E5E2DB` |

### Typography
- **Font Family**: Fredoka (Google Fonts) — 4 weights loaded via `@expo-google-fonts/fredoka`
- **Tailwind Classes**: `font-fredoka`, `font-fredoka-medium`, `font-fredoka-semibold`, `font-fredoka-bold`

### Spacing & Rhythm
- 4px base grid (Tailwind spacing scale)
- Consistent rounded corners: `rounded-xl` (12px), `rounded-2xl` (16px), `rounded-3xl` (24px)
- Shadows: subtle elevation for cards and modals

---

## 📂 Project Structure

```
src/
├── app/
│   ├── (auth)/           # Sign in / Sign up screens
│   ├── (tabs)/           # Main tab navigation
│   │   ├── index.tsx     # Home (Hero + Queue + Habits + Collab Lists)
│   │   ├── wins.tsx      # Wins/Treasures logbook
│   │   ├── calendar.tsx  # Calendar Queue (Lists)
│   │   └── profile.tsx   # Profile & Settings
│   └── _layout.tsx       # Root layout, auth guard, widget sync, notifications
├── components/
│   ├── index_components/ # Home screen components
│   │   ├── hero-card.tsx
│   │   ├── other-tasks.tsx (with DraggableTaskList for edit mode)
│   │   ├── daily-habits.tsx + habit-card.tsx
│   │   ├── collaborative-lists.tsx + collaborative-list-card.tsx
│   │   └── task-item.tsx
│   ├── wins_components/  # Wins screen components
│   │   ├── treasure-date-section.tsx
│   │   ├── treasure-log-card.tsx
│   │   ├── edit-treasure-modal.tsx
│   │   ├── delete-treasure-modal.tsx
│   │   ├── wins-calendar-modal.tsx
│   │   └── wins-tabs.tsx
│   ├── calendar_components/
│   │   ├── calendar-task-card.tsx
│   │   └── sort-control.tsx
│   ├── profile_components/ (empty - profile is self-contained)
│   ├── ui/
│   │   ├── toast.tsx (with undo action)
│   │   ├── task-actions.tsx (Edit/Delete buttons)
│   │   ├── confirm-modal.tsx
│   │   └── offline-banner.tsx
│   ├── add-modal.tsx     # Multi-step task/list creation
│   └── error-boundary.tsx
├── context/
│   └── AuthContext.tsx   # Session management
├── features/
│   ├── focus-widget/     # Android widget (read-only)
│   │   ├── focus-widget.tsx (UI)
│   │   ├── widget-task-handler.tsx (entry point)
│   │   ├── focus-widget-sync.ts (main app → widget)
│   │   └── focus-widget-snapshot.ts (AsyncStorage + validation)
│   ├── tasks/
│   │   ├── tasks.api.ts (CRUD + queue logic + hero promotion)
│   │   ├── tasks.types.ts (HomeTask, HomeSortCriteria, TaskSnapshot)
│   │   └── calendar.ts (Calendar filtering/sorting)
│   ├── treasures/
│   │   ├── treasures.api.ts (completed tasks grouped by date)
│   │   └── treasures.types.ts (TreasureLog, TreasureGroup, Category)
│   ├── lists/
│   │   └── lists.api.ts (collaborative lists + tasks + members)
│   └── habits/
│       ├── habits.api.ts (daily habits + completion logs)
│       └── habits.types.ts (HabitData)
├── lib/
│   ├── supabase.ts       # Supabase client (AsyncStorage auth persistence)
│   ├── data-events.ts    # Pub/sub for cross-screen sync + optimistic updates
│   ├── home-sort.ts      # Persisted sort preference (AsyncStorage)
│   └── notifications/
│       ├── task-deadline-notifications.ts
│       └── task-deadline-dates.ts
├── dp_operations/
│   ├── home/tasks.ts     # Alternative task operations (duplicate of tasks.api?)
│   └── profile/profile.ts
├── hooks/
│   ├── use-theme.ts
│   └── use-color-scheme.ts
├── utils/
│   ├── category-icon.ts  # Ionicons glyph mapping from category emoji
│   └── haptics.ts        # triggerHaptic (light/medium/heavy/success/warning)
├── constants/
│   └── theme.ts          # Colors, Fonts, Spacing (legacy, mostly unused)
└── global.css            # @tailwind imports
```

---

## 🔧 Key Implementation Details

### Optimistic UI with Undo
- **Pattern**: Immediate local update → emit optimistic event → background Supabase write → toast with undo
- **Undo**: Reverts local state, re-applies snapshot via `restoreTaskSnapshot()` or `restoreTreasure()`
- **Serialization**: `serializeTaskMutation()` queues writes to prevent race conditions
- **Mutation Guard**: `beginTaskMutation()` / `finishTaskMutation()` prevents overlapping edits

### Cross-Screen Sync (`lib/data-events.ts`)
- `subscribeToTaskChanges()` — refetch on any task mutation
- `subscribeToOptimisticTaskUpdates()` — apply optimistic update immediately
- `emitTaskDataChanged()` / `emitOptimisticTaskUpdate()` — fire events
- `subscribeToTaskDeadlineChanges()` — triggers notification resync

### Drag-to-Reorder (Edit Mode)
- `react-native-gesture-handler` + Reanimated 3
- Press-and-hold (200ms) → drag → reorder on drop
- `persistTaskPositions()` writes sequential `position` values to Supabase
- Hero Task excluded from position sequence (position = null)

### Keyboard Avoidance (Fixed)
- `KeyboardAvoidingView` with `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}`
- `keyboardVerticalOffset={Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0}`
- Applied in `AddModal` and `CollaborativeListCard` modals

### Widget Snapshot Validation
- `isFocusWidgetSnapshot()` validates all fields including new optional ones
- Defensive dimension handling in `FocusWidget` (defaults 300×200 if invalid)
- Outer container (flex:1, background) + inner wrapper (flex:1, justifyContent:'center') fixes stretching

---

## 🛠️ Local Setup & Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Expo CLI: `npm install -g expo-cli`
- Supabase project (free tier)

### Installation
```bash
git clone https://github.com/your-username/unti-unti.git
cd unti-unti
npm install
# or
yarn install
```

### Environment Setup
Create `.env` in root:
```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Database Setup
Run Supabase migrations (managed in Supabase dashboard, not in repo). Key tables: `profiles`, `lists`, `list_members`, `tasks`, `categories`, `habits`, `habit_logs`. RPCs: `is_username_available`, `add_collaborator_by_username`, `get_collaborative_list_members`, `remove_collaborative_list_member`.

### Running the App
```bash
# Development
npx expo start

# Clear cache
npx expo start -c

# Android widget requires EAS build (Expo Go doesn't include native module)
npx eas-cli@latest build --profile preview --platform android
```

### Common Commands
```bash
npm run lint        # Lint code
npm run format      # Format code
npm test            # Run tests (if configured)
```

---

## 📱 Supported Platforms

| Platform | Minimum Version | Notes |
|----------|-----------------|-------|
| **iOS** | 13.0+ | Full feature support |
| **Android** | 6.0+ (API 23+) | Widget requires dev/EAS build; Expo Go not supported for widget |

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/AmazingFeature`
3. Commit changes: `git commit -m 'Add some AmazingFeature'`
4. Push to branch: `git push origin feature/AmazingFeature`
5. Open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Expo](https://expo.dev/) — incredible development platform
- [Supabase](https://supabase.io/) — open-source Firebase alternative
- [NativeWind](https://www.nativewind.dev/) — Tailwind CSS in React Native
- [Fredoka Font](https://fonts.google.com/specimen/Fredoka) — cheerful typography
- [Ionicons](https://ionic.io/ionicons) — beautiful icons
- All contributors and users who help make Unti-Unti better

---

> **Note**: This app is developed as part of CMSC 128 [Software Engineering I] at University of the Philippines Visayas.  
> Built with care by Kenneth Modejar

---

_Last updated: November 17, 2026_  
_Version: 1.0.0_