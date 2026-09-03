# Notification history deployment

Deploy `delete-notification` and the updated `send-push-notification` together
with the admin-web and mobile changes. No database migration is required.

The delete endpoint authenticates the caller, checks their active profile, and
includes ownership in the delete filter. It never accepts a recipient ID from
the request. Only that notification is removed, not the originating job order,
timesheet, safety bulletin, or conversation.

Worker push history is persisted before device delivery is attempted. An
explicit existing notification ID is reused only when recipient and content
match. New pushes carry the history ID so taps open the full saved message.
Older pushes that were never stored cannot be reconstructed by this change.

Local tests: `node --test scripts/test-notification-history.mjs`.
These tests use mocked database and Expo requests; before release, smoke-test
real delivery, read status, deletion, and device tap handling with test accounts.
