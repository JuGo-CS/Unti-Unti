# Unti-Unti

A cozy, step-by-step habit & goal tracker built with React Native (Expo), and Supabase. Track your progress, build better habits, and watch your growth unfold—one gentle step at a time.

---

## App Overview

Unti-Unti is a mobile application designed to help users cultivate positive habits and achieve personal goals through a warm, encouraging interface. Built with React Native and Expo, it combines intuitive habit tracking with a soothing aesthetic inspired by nature and mindfulness practices. The app focuses on making progress feel achievable and enjoyable, turning daily actions into meaningful steps toward long-term aspirations.

---

### App Screens

|    Home Screen     |   Calendar Queue   |
| :----------------: | :----------------: |
| <photo-1_homepage> | <photo-2_calendar> |

| Wins & Treasures | Profile & Settings |
| :--------------: | :----------------: |
|  <photo-3_wins>  | <photo-4_profile>  |

|   Add Task Modal    |    Dynamic Header    |
| :-----------------: | :------------------: |
| <photo-5_add_modal> | <photo-6_night_mode> |

## Tech Stack

| Category             | Technology                                                            |
| -------------------- | --------------------------------------------------------------------- |
| **Framework**        | React Native (Expo Router v3)                                         |
| **Styling**          | NativeWind v4 / Tailwind CSS (Fredoka font theme, cozy color palette) |
| **Backend & Auth**   | Supabase (Authentication & PostgreSQL Database)                       |
| **State Management** | React Context & Local State                                           |
| **Database**         | PostgreSQL (via Supabase)                                             |

---

## Authentication System

Unti-Unti implements a secure authentication system using Supabase Auth with the following features:

### Core Authentication Flows

- **Email & Password Sign Up**: Users create accounts with email validation and secure password storage
- **Email & Password Sign In**: Secure login with session management via JWT tokens
- _**Password Recovery**: To be implemented_
    - OTP-based recovery flow (6-digit code sent to email)
    - User enters OTP in app to verify identity
    - Upon verification, user can set new password
    - Automatic sign-out after password reset for security
- **Session Management**:
    - Server-side sessions managed by Supabase
    - Client stores session refresh token securely
    - Automatic token refresh when needed
    - Session persistence across app restarts
    - Sign-out clears all session data

### Profile Management

- **Display Name Updates**: Changes synchronized between Supabase Auth `user_metadata` and custom `profiles` table
- **Password Updates**: Secure password change requiring current password verification
- **Real-time Synchronization**: Profile updates reflected immediately across auth and database layers

### Example Authentication Operations

```typescript
// Sign up
const { data, error } = await supabase.auth.signUp({
	email: 'user@example.com',
	password: 'secure-password123',
	options: {
		data: { display_name: 'User Name' },
	},
});

// Sign in
const { data, error } = await supabase.auth.signInWithPassword({
	email: 'user@example.com',
	password: 'secure-password123',
});

// Password reset request (sends OTP)
const { error } = await supabase.auth.resetPasswordForEmail('user@example.com');

// OTP verification
const { error } = await supabase.auth.verifyOtp({
	email: 'user@example.com',
	token: '123456',
	type: 'recovery',
});

// Password update (after OTP verification)
const { error } = await supabase.auth.updateUser({
	password: 'new-secure-password',
});

// Sign out
await supabase.auth.signOut();
```

---

## Database Schema

While Supabase manages the auth system automatically, Unti-Unti extends functionality with a custom `profiles` table:

```sql
-- profiles table (extends auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text,
  display_name text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enforce case-insensitive username uniqueness.
create unique index profiles_username_lower_unique
  on public.profiles (lower(btrim(username)))
  where username is not null and btrim(username) <> '';

-- Enable real-time subscriptions
alter publication supabase_realtime add table profiles;
```

The deployed Supabase database has a case-insensitive unique index on `profiles.username`. Account creation and profile username changes check availability with the deployed `is_username_available` RPC; the unique index remains the final safeguard against simultaneous duplicate updates. Account creation stores a normalized username in Auth metadata, and the database profile-creation trigger must copy it into `public.profiles.username`.

### Collaborative List Actions

Collaborative-list actions require deployed Supabase RPCs for username invitations, creator-only member listing, and creator-only member removal, plus task row-level security policies that let list owners and members manage individual tasks. List members also need permission to delete only their own `list_members` row to leave a list; deleting the collaborative list itself remains creator-only. These database definitions are managed in Supabase and are not stored in this repository. The already-deployed username unique index is required for case-insensitive username lookup.

Collaborative-list changes appear immediately and can be undone from the Home toast. Destructive changes are finalized in Supabase when the Undo toast expires or is replaced; keep the app open during this window.

## Local Task Deadline Reminders

Unti-Unti schedules one local reminder at noon on the day before each distinct upcoming deadline among the user's pending personal tasks. Reminders are reconciled at sign-in/app launch, when the app returns to the foreground, and after a task is created, edited, completed, reopened, deleted, or restored. Android notification permission is requested only when an eligible reminder needs scheduling. Notification permission denial leaves task behavior unchanged.

Scheduled notifications are managed by the operating system and do not require a background task. Android restores scheduled notifications after a device restart. Scheduling is capped to leave room under platform pending-notification limits. Android may defer delivery while the device is idle; the app does not request exact-alarm permission. Android's explicit Force stop can prevent delivery until the app is launched again. A device timezone change is applied when the app next opens or returns to the foreground. If the timezone changes while the app is closed, an already-scheduled notification may fire at the old local-time equivalent before the app can resynchronize.

Notifications cannot check Supabase while Unti-Unti is closed. If a task is completed or deleted on another device after a reminder was scheduled, that reminder may still appear until this device next synchronizes.

## Android Focus Widget

The read-only Android home-screen widget shows the current personal Home task, its description or deadline when available, and how many other pending personal tasks remain. The count excludes the displayed focus task. Its layout adapts to the widget's size, and tapping it opens Unti-Unti; it does not complete tasks.

The widget uses a local snapshot refreshed when the app launches, returns to the foreground, or receives a successful task-change event. A failed fetch keeps the last valid snapshot for the same account. Signing out or switching accounts clears the prior account's snapshot. The widget does not poll in the background and can remain stale when tasks change elsewhere until the app synchronizes again.

The native widget requires an Android development or EAS build; Expo Go and an OTA update to an older binary are not sufficient. For an installable preview build, run `npx eas-cli@latest build --profile preview --platform android`.

---

## Key Features Implemented

### Authentication

- **Email & Password Sign Up**: Secure account creation with validation
- **Email & Password Sign In**: Seamless login experience with session persistence
- **Password Recovery**: _To be implemented_
- **Profile Management**:
    - Update display name (synced across Supabase Auth `user_metadata` and `profiles` table)
    - Secure password update functionality
    - Real-time synchronization between client and server

### 🎨 Cozy Design System

- **Typography**: Custom Fredoka font throughout for friendly, approachable feel
- **Color Theme**:
    - `bg-cozyBg` - Warm, inviting background
    - `text-deepBrown` - Rich, readable text
    - `bg-focusHero` - Vibrant accent for primary actions
- **Spacing & Rhythm**: Consistent, comfortable layout based on 4px grid
- **Interactive Feedback**: Subtle press animations and loading states

### 📱 Core Functionality

- Habit creation with customizable frequency (daily, weekly, etc.)
- Progress tracking with visual streaks and completion rates
- Goal setting with milestone tracking
- Gentle reminders and notifications (Expo Notifications)
- Data persistence via Supabase (online-first with optimistic updates)
- Offline capability with automatic sync on reconnect

---

## 🛠️ Local Setup & Getting Started

Follow these steps to get Unti-Unti running on your local machine:

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [Expo CLI](https://docs.expo.dev/get-started/installation/) (`npm install -g expo-cli`)
- A [Supabase](https://supabase.io/) project (free tier available)

### 2. Installation

```bash
# Clone the repository
git clone https://github.com/your-username/unti-unti.git
cd unti-unti

# Install dependencies
npm install
# or
yarn install
```

### 3. Environment Setup

Create a `.env` file in the root directory with your Supabase credentials:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

> 🔑 **Finding your Supabase keys**:
>
> 1. Go to your [Supabase dashboard](https://supabase.com/dashboard)
> 2. Select your project
> 3. Navigate to **Settings → API**
> 4. Copy the **Project URL** and **anon public** key

### 4. Database Setup (Supabase)

### 5. Running the App

### 6. Common Development Commands

```bash
# Run tests (if configured)
npm test

# Lint code
npm run lint

# Format code
npm run format

# Clear Expo cache (if needed)
npx expo start -c
```

---

## 📱 Supported Platforms

- **iOS**: 13.0+
- **Android**: 6.0+ (API 23+)

---

## 🤝 Contributing

We welcome contributions to make Unti-Unti even better! Please:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and submission process.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Expo](https://expo.dev/) for the incredible development platform
- [Supabase](https://supabase.io/) for the open-source Firebase alternative
- [NativeWind](https://www.nativewind.dev/) for Tailwind CSS in React Native
- [Fredoka Font](https://fonts.google.com/specimen/Fredoka) for the cheerful typography
- All contributors and users who help make Unti-Unti better

---

> **Note**: This app is developed as part of CMSC 128 at University of the Philippines Visayas.  
> Built with care by Kenneth Modejar

---

_Last updated: September 2026_  
_Version: 1.0.0_
