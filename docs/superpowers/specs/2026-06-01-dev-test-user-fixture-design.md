# Dev Test User Fixture Design

## Goal

Provide a reliable local account that future agents can use for feature testing without re-registering or replaying the first-run tutorial.

## Design

Local development should seed a real registered user named `devtester` with password `test1234`. The account uses the same auth and save files as normal users, so logging in exercises real authentication, game state loading, creature collection logic, and progression gates.

The fixture save starts in the hub with prologue and tutorial complete, Starting Meadow cleared, Wild Plains unlocked, and ten valid owned creatures with one spendable copy each. If a feature worktree has no local runtime files yet, starting the dev server creates the account in that worktree automatically. A manual `npm run seed:dev-user` command repairs or recreates the fixture when needed.

## Safety

The seeder is local-only. It must not run in production, on Railway, or during tests unless called directly. Seeded files remain gitignored runtime files.

## Future-Agent Contract

`docs/playtest-guide.md` must document `devtester` as the default account for local playtesting. Agents should use it before creating throwaway users, except when explicitly testing registration, onboarding, or tutorial behavior.

## Verification

Unit coverage should prove the seeder creates the user, writes a playable save, is idempotent, and refuses automatic startup seeding outside local development.
