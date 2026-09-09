import assert from 'node:assert/strict';
import { test } from 'node:test';
import { popupPosition } from '../apps/admin-web/src/components/ui/popup-position.ts';

test('small popup opens beside its trigger', () => {
  assert.deepEqual(popupPosition({ left: 100, right: 180, top: 100, bottom: 130 }, 400, 300, 1600, 1000), { left: 192, top: 130 });
});
test('right and bottom edges flip and clamp the popup into view', () => {
  assert.deepEqual(popupPosition({ left: 1480, right: 1560, top: 900, bottom: 930 }, 400, 300, 1600, 1000), { left: 1068, top: 684 });
});
test('wide notification stays in view when neither side fits', () => {
  assert.deepEqual(popupPosition({ left: 600, right: 680, top: 100, bottom: 130 }, 896, 400, 1440, 1000), { left: 528, top: 130 });
});
test('large dialogs and missing triggers use centered layout', () => {
  const anchor = { left: 100, right: 180, top: 100, bottom: 130 };
  assert.equal(popupPosition(anchor, 1200, 300, 1600, 1000), null);
  assert.equal(popupPosition(anchor, 400, 750, 1600, 1000), null);
  assert.equal(popupPosition(anchor, 358, 300, 390, 844), null);
  assert.equal(popupPosition(null, 400, 300, 1600, 1000), null);
});
