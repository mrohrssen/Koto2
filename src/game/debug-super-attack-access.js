const DEBUG_SUPER_ATTACK_USERNAMES = new Set(['michia', 'Michia']);

export function canUseDebugSuperAttack(user) {
  return DEBUG_SUPER_ATTACK_USERNAMES.has(user?.username);
}

export function getDebugSuperAttackForUser(settings = {}, user = null) {
  if (!canUseDebugSuperAttack(user)) return false;

  const byUsername = settings.debugSuperAttackByUsername;
  if (byUsername && Object.hasOwn(byUsername, user.username)) {
    return !!byUsername[user.username];
  }

  return !!settings.debugSuperAttack;
}

export function setDebugSuperAttackForUser(settings, user, enabled) {
  if (!canUseDebugSuperAttack(user)) return false;

  if (!settings.debugSuperAttackByUsername || Array.isArray(settings.debugSuperAttackByUsername)) {
    settings.debugSuperAttackByUsername = {};
  }

  settings.debugSuperAttackByUsername[user.username] = !!enabled;
  return true;
}
