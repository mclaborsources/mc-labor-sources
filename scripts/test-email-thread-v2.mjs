import assert from 'node:assert/strict';
import { messageIds, messageIdVariants, threadMessageIds } from '../supabase/functions/_shared/email-thread-v2.ts';

assert.deepEqual(messageIds('<reply@example.com>'), ['<reply@example.com>']);
assert.deepEqual(
  messageIds('<original@example.com> <reminder@example.com> <original@example.com>'),
  ['<original@example.com>', '<reminder@example.com>'],
);
assert.deepEqual(
  threadMessageIds('<reminder@example.com>', '<original@example.com> <reminder@example.com>'),
  ['<reminder@example.com>', '<original@example.com>'],
);
assert.deepEqual(messageIdVariants('<original@example.com>'), ['<original@example.com>', 'original@example.com']);
assert.deepEqual(threadMessageIds(null, null), []);

console.log('Email Reply Sync V2 thread-header matching passed.');
