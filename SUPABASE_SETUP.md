# Supabase setup for shared combat lobbies

Online lobbies are optional. Until configured, campaigns and encounters continue to work from this device's local storage.

## Create and connect the Supabase project

Do these steps in the Supabase dashboard:

1. Create a Supabase account at [supabase.com](https://supabase.com), then create a project. Save the database password somewhere secure; the app does not need it.
2. In **Authentication → Sign In / Providers**, enable **Anonymous Sign-Ins**. This lets each installation receive its own authenticated device identity without asking players for email.
3. Open **SQL Editor → New query**. Open `supabase/migrations/20261016000000_online_combat_lobbies.sql` in VS Code, copy its full contents into the query, and run it. The migration creates the lobby schema, access policies, server-side functions, character-claim uniqueness rule, and Realtime publication entries.
4. In the Supabase project settings, copy the **Project URL** and the **publishable key**. These are safe for client apps when used with the migration's Row Level Security policies. **Never use or put the service-role/secret key in the app.**

Then do these steps in VS Code:

1. From the project root, create the local environment file:

   ```powershell
   Copy-Item .env.example .env.local
   ```

2. Open `.env.local` and replace the placeholders:

   ```dotenv
   EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_project_key
   ```

   Use the exact URL and publishable key from your Supabase project. Do not paste a service-role or secret key here. `.env.local` is ignored by Git.
3. If this is a fresh checkout or the app reports `Unable to resolve module react-native-url-polyfill/auto`, install the project dependencies from the root:

   ```powershell
   npm install
   ```

4. Stop the running Expo server and restart it from the project root with a cleared Metro cache so it reloads dependencies and environment:

   ```powershell
   npx expo start -c
   ```

## Test with two devices

1. Open the same app build/dev server on the DM's device and the player's device. Each app installation gets its own anonymous identity.
2. On the DM device, open a campaign, prepare or open an encounter, then choose **Open Shared Online Lobby** in the pre-combat screen. Share the displayed 12-character code with the players.
3. On the other device, choose **Join Online Lobby** from the campaigns screen, enter that code and a display name, then tap **Join Lobby**.
4. Both screens should show the participant list and roster update live. A player can claim an available character; other players will see it as unavailable. Claims are also protected against collisions by a database unique constraint.
5. The DM can close the lobby. Closed lobbies cannot accept new members or character claims.

## What is and is not shared

- Existing campaigns, campaign covers, characters, encounter editing, initiative, and combat state remain in local device storage and are not migrated or overwritten.
- Opening a lobby copies the encounter name, active party character names/classes/races/preset portrait IDs, and private enemy data into Supabase. Players receive only the lobby, participant list, and sanitized character roster. Enemy names, images, HP, and other enemy details are held in a private table and are returned only to the owning DM through a permission-checked server function.
- This milestone shares lobby membership and character claims in real time; it does not synchronize initiative rolls, HP changes, encounter edits, or the running combat tracker between devices. Those features remain local-only.
- Anonymous identity is saved on that installation. Clearing app data or reinstalling can lose access to its identity and any lobby membership; account linking or sign-in recovery is not part of this milestone.
- Live cross-device verification cannot complete until the project is created, the migration is applied, and both devices connect with the project URL and publishable key.
