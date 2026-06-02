import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_NAV,
  TOOL_LINKS,
  canDeleteUser,
  filterUsers,
  getAllDashboardHrefs,
  normalizeBugReports,
} from '../../public/js/admin-dashboard-data.js';

describe('admin dashboard data helpers', () => {
  it('does not expose removed legacy surfaces', () => {
    const hrefs = getAllDashboardHrefs();
    const removed = [
      '/dev/mockups',
      '/regen-review.html',
      '/assets/sprites/items/review.html',
      '/creatures-gallery.html',
    ];

    for (const href of removed) {
      assert.equal(hrefs.includes(href), false, `${href} should not be linked`);
    }

    assert.equal(
      ADMIN_NAV.some((section) => /legacy/i.test(section.label)),
      false,
      'legacy navigation section should not exist',
    );
  });

  it('includes the actual simulator dashboards', () => {
    const simulatorHrefs = TOOL_LINKS.simulators.map((tool) => tool.href);

    assert.deepEqual(simulatorHrefs, [
      'http://localhost:3100/#profiles',
      'http://localhost:3100/#compare',
      'http://localhost:3100/#balance',
    ]);
  });

  it('normalizes bug reports newest first with device labels', () => {
    const reports = normalizeBugReports([
      {
        id: 'older',
        note: 'Old issue',
        timestamp: '2026-06-01T10:00:00.000Z',
        viewport: { width: 390, height: 844 },
        devicePixelRatio: 3,
        gameState: { phase: 'hub' },
      },
      {
        id: 'newer',
        note: 'New issue',
        timestamp: '2026-06-02T10:00:00.000Z',
        viewport: { width: 1024, height: 768 },
        devicePixelRatio: 2,
        gameState: { phase: 'combat' },
      },
    ]);

    assert.equal(reports[0].id, 'newer');
    assert.equal(reports[0].deviceLabel, '1024 x 768 @2x');
    assert.equal(reports[0].phaseLabel, 'combat');
    assert.equal(reports[1].deviceLabel, '390 x 844 @3x');
  });

  it('filters users by username or id', () => {
    const users = [
      { id: 'user-1', username: 'devtester' },
      { id: 'user-2', username: 'playtester' },
    ];

    assert.deepEqual(filterUsers(users, 'dev').map((user) => user.id), ['user-1']);
    assert.deepEqual(filterUsers(users, 'USER-2').map((user) => user.id), ['user-2']);
    assert.deepEqual(filterUsers(users, '').map((user) => user.id), ['user-1', 'user-2']);
  });

  it('requires exact username confirmation before deleting a user', () => {
    assert.equal(canDeleteUser({ username: 'devtester' }, 'devtester'), true);
    assert.equal(canDeleteUser({ username: 'devtester' }, 'DevTester'), false);
    assert.equal(canDeleteUser({ username: 'devtester' }, ' devtester '), false);
    assert.equal(canDeleteUser(null, 'devtester'), false);
  });
});
