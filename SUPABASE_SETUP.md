# Supabase setup for shared combat lobbies

Online lobbies are optional. Until configured, campaigns and encounters continue to work from this device's local storage.

## Create and connect the Supabase project

Do these steps in the Supabase dashboard:

1. Create a Supabase account at [supabase.com](https://supabase.com), then create a project. Save the database password somewhere secure; the app does not need it.
2. In **Authentication → Sign In / Providers**, enable **Anonymous Sign-Ins**. This lets each installation receive its own authenticated device identity without asking players for email.
3. Open **SQL Editor → New query**. Open `supabase/migrations/20261016000000_online_combat_lobbies.sql` in VS Code, copy its full contents into the query, and run it. This creates the lobby schema, access policies, server-side functions, character-claim uniqueness rule, and Realtime publication entries.
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

## Enable synchronized initiative

If the original lobby migration has already been applied, do not rerun or edit it. In **Supabase → SQL Editor → New query**, run the complete contents of the new migration `supabase/migrations/20261016010000_shared_initiative.sql`. It adds authoritative initiative bonuses and results, DM-only participant records, server-validated roll/reset functions, and row-level filtering for player initiative reads. It also makes private participant changes emit a safe lobby metadata update so clients can refresh their permitted snapshot without receiving private participant records.

Lobbies created before this migration do not contain the new initiative bonus and participant records. To use synchronized initiative, create a new lobby from the encounter after applying the migration. Your campaign and encounter remain on-device and are not changed.

## Start a shared combat

After applying the initiative migration, run `supabase/migrations/20261016020000_start_shared_combat.sql` in a new Supabase SQL Editor query. The DM can then start combat from the shared lobby. It activates only participants due in round 1; hidden participants remain hidden, and later reinforcements remain scheduled. Players receive only active, visible, arrived combatants after the transition. Player clients cannot select the raw initiative-results table; safe metadata changes trigger a snapshot refresh, and the server returns only party results before combat plus sanitized visible combatants after start. A player who cannot submit initiative should check for an in-app message asking for migration `20261016010000_shared_initiative.sql` and run it if missing.

After applying `20261016020000_start_shared_combat.sql`, also run `supabase/migrations/20261016030000_fix_visible_combatant_aggregation.sql` in a new SQL Editor query. It fixes the nested-aggregate error in `get_visible_combat_lobby_participants` using an equivalent two-stage aggregation. Apply it even if the error has not appeared yet; do not edit or rerun migrations already applied.

To enable players to leave a lobby they joined with a code, run `supabase/migrations/20261016040000_player_leave_lobby.sql` in a new SQL Editor query. The leave action removes only that player's membership and this device's saved lobby pointer; it does not close the DM's lobby or end combat.

If player initiative submission reports `missing FROM-clause entry for table "m"`, run `supabase/migrations/20261016050000_fix_player_initiative_member_alias.sql` in a new SQL Editor query. This corrects the member-row alias in the server-side initiative function; do not edit or rerun the previously applied initiative migration.

To let the DM enter a party member's raw d20 roll when the player cannot use their device, run `supabase/migrations/20261016123000_dm_party_manual_initiative.sql` in a new Supabase SQL Editor query. This adds a DM-owner-only function that uses the saved party bonus, validates a raw roll from 1 through 20, and refuses to overwrite an existing result.

If a DM-entered party result is not reflected in combat initiative or Start Combat reports that initiative is incomplete, run `supabase/migrations/20261016130000_fix_dm_party_roll_combat_start.sql` in a new Supabase SQL Editor query. It repairs actor records for existing party results, records new DM-entered rolls consistently, and ensures outstanding initiative rolls do not block the DM from starting combat.

The encounter's selected combat background is also copied to the shared lobby. The DM can choose one of the built-in PNG backgrounds while preparing or editing the encounter; after combat starts, players see that background behind the combat view. Choosing **Default** keeps the existing navy background. The selection is stored on the lobby by a DM-only database function.

To schedule encounter reinforcements, run `supabase/migrations/20261016140000_combat_reinforcements.sql` in a new SQL Editor query. The Prepare Combat screen adds a Reinforcements tab where enemy groups can be scheduled for a specific round or set to **When Decided** with an optional DM-only trigger note. During online combat, the DM can advance to the next round (which activates due round-based enemies) or manually activate a When Decided group. Scheduled creatures remain hidden from players until they are activated.

To sync character Armor Class into online lobbies and the shared combat tracker, run `supabase/migrations/20261016150000_character_armor_class.sql` in a new SQL Editor query. It stores each party character's AC in the lobby snapshot; older lobby records use AC 10. Create a new online lobby after applying the migration to copy the latest campaign AC values.

To show and retain enemy and ally Armor Class in the online combat tracker, run `supabase/migrations/20261016160000_online_combat_armor_class.sql` after the character AC migration. New online lobbies copy the encounter's saved AC values; existing combatant rows use AC 10.

## Test with two devices

1. Open the same app build/dev server on the DM's device and the player's device. Each app installation gets its own anonymous identity.
2. On the DM device, open a campaign, prepare an encounter, then tap **Open Online Lobby**. The encounter is saved and its shared online lobby opens directly with the join code. Saved ready encounters also open their shared online lobby directly from the encounter list. Share the displayed 12-character code with the players.
3. On the other device, choose **Join Online Lobby** from the campaigns screen, enter that code and a display name, then tap **Join Lobby**.
4. Both screens should show the participant list and roster update live. A player can claim an available character; other players will see it as unavailable. Claims are also protected against collisions by a database unique constraint.
5. On the player device, claim a character. Confirm its name, portrait, and saved initiative bonus appear. Choose **Enter My Roll**, submit `14` with a `+3` bonus, and confirm the result reads `14 + 3 = 17 · Ready` on both devices. If initiative fails with a missing `m` table alias, apply `20261016050000_fix_player_initiative_member_alias.sql` and retry. Also try blank, decimal, `0`, and `21`; the app should disable invalid values and the backend rejects invalid direct requests.
6. If a player cannot use their device, apply `20261016123000_dm_party_manual_initiative.sql`. From the DM lobby, choose **Enter Roll for Player** on that character and enter the raw d20 result. Confirm the saved bonus is added and both devices show the calculation; an existing result cannot be replaced without a DM reset.
7. Apply `20261016130000_fix_dm_party_roll_combat_start.sql`. Confirm a DM-entered party result remains visible as a saved initiative result and increments the readiness count. Then try starting with other initiative rolls outstanding; the DM should be able to start and those participants remain without results.
8. Apply `20261016140000_combat_reinforcements.sql`. In Prepare Combat, set one group to **Round 3** and another to **When Decided** with a trigger note. Open the lobby, start combat, and verify neither scheduled group is visible to players. Advance through Round 2 and confirm neither appears; advance to Round 3 and confirm the round-based group becomes visible. Then use **Activate Now** on the DM-triggered group and confirm it appears on both devices.
9. On the DM device, roll one enemy, choose multiple participants and use **Roll Selected**, then use **Roll Unrolled**. Confirm existing results are unchanged, players are not included, horde mode produces one shared result, and the player device receives only party results before combat starts.
10. Use **Start Combat** on the DM device. Confirm both devices show combat started, players see active visible enemies and NPCs immediately, and hidden or later-arriving participants remain absent from player results and visible combatants. The DM still sees all participants and their statuses.
   Confirm the chosen PNG background appears for players after combat starts, including after reloading. **Default** should show the navy background.
10. Confirm a player cannot submit again, change their claimed character after readiness, submit for another character, or change the saved bonus. The DM can use **Reset** to permit another player submission before combat starts. Only the DM can roll, reset, or start combat.
11. Reload both devices and confirm character claims and saved results remain. Player clients must not receive hidden/future/defeated/inactive records through direct table reads or Realtime subscriptions.
12. The DM can close the lobby. Closed lobbies cannot accept new members or character claims.
13. On the player device, choose **Leave Lobby** and confirm. Verify the device returns to the join form, the player disappears from the DM's list, and the DM's lobby remains open. Join again with the code and confirm it does not automatically reopen the previous lobby after leaving.

## What is and is not shared

- Existing campaigns, campaign covers, characters, encounter editing, and local combat state remain in local device storage and are not migrated or overwritten.
- Opening a lobby copies the encounter name, active party character names/classes/races/preset portrait IDs, and private enemy data into Supabase. Players receive only the lobby, participant list, and sanitized character roster. Enemy names, images, HP, and other enemy details are held in a private table and are returned only to the owning DM through a permission-checked server function.
- Shared lobby initiative rolls and the combat-start transition are persisted in Supabase and synchronized in real time. Encounter preparation and initiative submission are online-lobby flows; campaign/encounter definitions remain stored locally. HP changes, turn advancement, defeat/revival controls, and reinforcement activation are not included.
- Combat start activates only waiting participants due by round 1. Reinforcement arrival transitions, reveal/hide controls, and defeat/inactive controls still need the next implementation step and corresponding live visibility tests.
- Anonymous identity is saved on that installation. Clearing app data or reinstalling can lose access to its identity and any lobby membership; account linking or sign-in recovery is not part of this milestone.
- Live Supabase checks (including two-device Realtime, concurrent duplicate submissions, and direct-table/RLS attempts) cannot complete until the project is created, migrations are applied in order, and both devices connect with the project URL and publishable key.
