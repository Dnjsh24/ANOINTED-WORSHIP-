-- Add feature-task checkpoints without changing versions, rows, own-account RLS
-- or terminal-progress protection. Remote application needs separate authorization.
begin;
alter table public.wooly_tutorial_progress drop constraint wooly_tutorial_valid_step;
alter table public.wooly_tutorial_progress add constraint wooly_tutorial_valid_step check (
  (tour_id = 'page-welcome' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-login' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-teams' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-join' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-create' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-pending' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-home' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-setlists' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-setlist-new' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-setlist-edit' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-setlist-templates' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-setlist-detail' and next_step in ('step-1', 'step-2', 'step-3', 'step-4'))
  or
  (tour_id = 'page-setlist-add-song' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-practice' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-stage' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-projector' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-confidence' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-songs' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-song-new' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-song-edit' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-song-detail' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-song-trash' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-events' and next_step in ('step-1', 'step-2', 'step-3', 'step-4'))
  or
  (tour_id = 'page-event-new' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-event-edit' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-event-detail' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-messages' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-profile' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-members' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-member-invite' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-member-requests' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-member-detail' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-analytics' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-announcements' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-reminders' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-dance' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-dance-detail' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-dance-edit' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-settings' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-sync' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-remote' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-remote-session' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'task-welcome-start' and next_step in ('intro', 'choose-get-started-with-google', 'select-your-google-account-the-app-opens'))
  or
  (tour_id = 'task-login-account' and next_step in ('intro', 'open-sign-in-with-google', 'select-the-account-associated-with-your-team'))
  or
  (tour_id = 'task-create-account-choice' and next_step in ('intro', 'on-choose-your-team-select-create-a'))
  or
  (tour_id = 'task-login-troubleshoot' and next_step in ('intro', 'review-the-displayed-error-and-retry-once'))
  or
  (tour_id = 'task-public-features' and next_step in ('intro', 'choose-get-started-with-google-to-enter'))
  or
  (tour_id = 'task-team-join' and next_step in ('intro', 'choose-join-a-team', 'enter-the-team-code', 'check-the-matched-team-preview', 'choose-the-role-that-matches-how-you', 'choose-request-to-join-team-and-wait'))
  or
  (tour_id = 'task-team-code-invalid' and next_step in ('intro', 'correct-team-code', 'wait-for-the-team-preview-a-matching'))
  or
  (tour_id = 'task-team-role-select' and next_step in ('intro', 'open-choose-your-role', 'select-your-ministry-role-your-selected-role'))
  or
  (tour_id = 'task-team-request' and next_step in ('intro', 'check-the-matched-team-and-selected-role', 'choose-request-to-join-team', 'wait-for-the-pending-request-page-to', 'read-request-details-while-waiting-for-the'))
  or
  (tour_id = 'task-team-pending' and next_step in ('intro', 'open-request-details-on-the-pending-page'))
  or
  (tour_id = 'task-team-create-name' and next_step in ('intro', 'enter-a-ministry-team-name', 'enter-the-location', 'choose-continue', 'check-that-the-invitations-step-opens-with'))
  or
  (tour_id = 'task-team-create-review' and next_step in ('intro', 'choose-continue-to-reach-review-create-workspace'))
  or
  (tour_id = 'task-team-create-submit' and next_step in ('intro', 'choose-continue-through-team-details-and-invite', 'check-ministry-team-name-and-location', 'check-the-displayed-service-details-and-your', 'choose-create-team', 'confirm-the-new-team-dashboard-opens'))
  or
  (tour_id = 'task-home-next-service' and next_step in ('intro', 'read-the-next-service-card-at-the'))
  or
  (tour_id = 'task-home-confirm-availability' and next_step in ('intro', 'choose-confirm-availability-on-the-service-card'))
  or
  (tour_id = 'task-home-open-setlist' and next_step in ('intro', 'choose-open-setlist-on-the-next-service'))
  or
  (tour_id = 'task-home-message-team' and next_step in ('intro', 'choose-message-team-on-the-dashboard-messages'))
  or
  (tour_id = 'task-home-no-service' and next_step in ('intro', 'choose-timeline-in-the-navigation-the-event'))
  or
  (tour_id = 'task-home-navigation-setlists' and next_step in ('intro', 'choose-setlists-from-the-navigation-the-setlists'))
  or
  (tour_id = 'task-home-navigation-timeline' and next_step in ('intro', 'choose-timeline-from-the-navigation-the-event'))
  or
  (tour_id = 'task-home-welcome-new-team' and next_step in ('intro', 'open-setlists-or-timeline-from-the-navigation'))
  or
  (tour_id = 'task-home-analytics-link' and next_step in ('intro', 'choose-analytics-from-the-navigation-the-analytics'))
  or
  (tour_id = 'task-setlist-search' and next_step in ('intro', 'enter-a-name-in-search-setlists-matching'))
  or
  (tour_id = 'task-setlist-view-all' and next_step in ('intro', 'choose-all-in-the-setlist-view-tabs'))
  or
  (tour_id = 'task-setlist-view-standalone' and next_step in ('intro', 'choose-standalone-in-the-setlist-view-tabs'))
  or
  (tour_id = 'task-setlist-view-upcoming' and next_step in ('intro', 'choose-upcoming-in-the-setlist-view-tabs'))
  or
  (tour_id = 'task-setlist-view-past' and next_step in ('intro', 'choose-past-in-the-setlist-view-tabs'))
  or
  (tour_id = 'task-setlist-filter-leader' and next_step in ('intro', 'open-filters', 'choose-a-leader-the-list-narrows-to'))
  or
  (tour_id = 'task-setlist-filter-type' and next_step in ('intro', 'open-filters', 'select-a-service-type-matching-event-linked'))
  or
  (tour_id = 'task-setlist-create' and next_step in ('intro', 'choose-new-setlist', 'enter-setlist-name-and-optional-notes', 'search-song-library-for-a-song', 'drag-the-song-into-song-order-and', 'choose-create-setlist-and-read-the-result'))
  or
  (tour_id = 'task-setlist-name' and next_step in ('intro', 'enter-setlist-name-for-example-sunday-morning', 'choose-create-setlist-when-the-name-and', 'read-the-result-message-if-saving-fails'))
  or
  (tour_id = 'task-setlist-notes' and next_step in ('intro', 'enter-preparation-notes-in-notes', 'choose-create-setlist-when-the-name-and', 'read-the-result-message-if-saving-fails'))
  or
  (tour_id = 'task-setlist-add-songs' and next_step in ('intro', 'search-song-library-for-the-intended-song', 'drag-its-card-into-song-order', 'choose-create-setlist-after-reviewing-the-name', 'read-the-result-and-check-that-the'))
  or
  (tour_id = 'task-setlist-reorder' and next_step in ('intro', 'drag-a-selected-songs-handle-to-its', 'choose-create-setlist-to-save-this-new', 'read-the-result-message-if-saving-fails'))
  or
  (tour_id = 'task-setlist-remove-song' and next_step in ('intro', 'choose-the-remove-icon-beside-the-incorrect', 'choose-create-setlist-to-save-the-remaining', 'read-the-result-message-if-saving-fails'))
  or
  (tour_id = 'task-setlist-save-new' and next_step in ('intro', 'choose-create-setlist-after-reviewing-the-form'))
  or
  (tour_id = 'task-setlist-edit' and next_step in ('intro', 'choose-edit-setlist-on-the-current-plan', 'update-the-name-notes-or-selected-song', 'choose-save-changes', 'read-the-result-before-leaving'))
  or
  (tour_id = 'task-setlist-linked-event' and next_step in ('intro', 'choose-the-existing-standalone-plan-in-the', 'choose-save-changes', 'read-the-result-and-verify-the-linked'))
  or
  (tour_id = 'task-setlist-templates' and next_step in ('intro', 'choose-templates-in-the-setlists-navigation-saved'))
  or
  (tour_id = 'task-setlist-template-delete' and next_step in ('intro', 'read-the-name-on-the-intended-template', 'choose-that-cards-delete-template-control', 'wait-for-the-page-to-refresh-and'))
  or
  (tour_id = 'task-setlist-add-song-route' and next_step in ('intro', 'choose-add-song', 'search-the-library-and-drag-desired-songs', 'set-each-songs-key-and-category', 'choose-save-to-setlist-and-verify-the'))
  or
  (tour_id = 'task-song-search' and next_step in ('intro', 'enter-a-title-artist-or-tag-in'))
  or
  (tour_id = 'task-song-favorites' and next_step in ('intro', 'choose-filter', 'select-favorites-only-songs-marked-as-favorites'))
  or
  (tour_id = 'task-song-all' and next_step in ('intro', 'choose-filter', 'select-all-songs-the-library-returns-to'))
  or
  (tour_id = 'task-song-sort-az' and next_step in ('intro', 'open-filter', 'choose-a-z-song-cards-appear-in'))
  or
  (tour_id = 'task-song-sort-played' and next_step in ('intro', 'open-filter', 'choose-most-played-the-list-is-ordered'))
  or
  (tour_id = 'task-song-open-chart' and next_step in ('intro', 'choose-a-song-card-from-the-library'))
  or
  (tour_id = 'task-song-add' and next_step in ('intro', 'choose-add-song', 'enter-the-title-and-artist-source-in', 'enter-the-known-key-and-bpm-leave', 'enter-lyrics-and-chords-in-the-chart', 'choose-create-song', 'read-the-result-and-any-pending-review'))
  or
  (tour_id = 'task-song-title-artist' and next_step in ('intro', 'enter-the-song-title-and-artist-source', 'choose-create-song-after-reviewing-the-music', 'read-the-result-message-if-saving-fails'))
  or
  (tour_id = 'task-song-default-key' and next_step in ('intro', 'choose-the-known-default-key-for-this', 'choose-create-song-after-reviewing-the-chart', 'read-the-result-message-if-saving-fails'))
  or
  (tour_id = 'task-song-bpm' and next_step in ('intro', 'enter-the-confirmed-tempo-in-bpm-for', 'choose-create-song-after-reviewing-the-chart', 'read-the-result-message-if-saving-fails'))
  or
  (tour_id = 'task-song-tags' and next_step in ('intro', 'enter-useful-team-tags-in-tags', 'choose-create-song-after-reviewing-the-chart', 'read-the-result-message-if-saving-fails'))
  or
  (tour_id = 'task-song-chart-entry' and next_step in ('intro', 'enter-the-lyrics-and-chords-keeping-the', 'choose-create-song-after-checking-title-and', 'read-the-result-message-if-saving-fails'))
  or
  (tour_id = 'task-song-create-submit' and next_step in ('intro', 'choose-create-song-after-reviewing-the-form'))
  or
  (tour_id = 'task-song-edit' and next_step in ('intro', 'choose-edit-song-on-this-songs-chart', 'update-the-intended-fields-in-song-details', 'choose-save-song', 'read-the-result-message-before-leaving'))
  or
  (tour_id = 'task-song-transpose' and next_step in ('intro', 'select-the-desired-key-in-the-song'))
  or
  (tour_id = 'task-song-capo' and next_step in ('intro', 'choose-a-capo-value-in-the-song'))
  or
  (tour_id = 'task-song-favorite-toggle' and next_step in ('intro', 'choose-the-songs-star-control-the-star'))
  or
  (tour_id = 'task-song-delete' and next_step in ('intro', 'choose-delete-song', 'check-the-delete-song-dialog-and-verify', 'choose-cancel-to-keep-it-or-yes', 'check-the-result-after-the-dialog-closes'))
  or
  (tour_id = 'task-song-trash' and next_step in ('intro', 'choose-restore-beside-the-correct-song-the'))
  or
  (tour_id = 'task-song-delete-permanent' and next_step in ('intro', 'open-song-trash', 'verify-the-title-and-deletion-countdown-for', 'choose-delete-permanently', 'confirm-in-the-browser-prompt-only-if'))
  or
  (tour_id = 'task-song-empty-library' and next_step in ('intro', 'clear-search', 'choose-all-songs-in-filter-the-full'))
  or
  (tour_id = 'task-event-search' and next_step in ('intro', 'enter-an-event-name-in-search-events'))
  or
  (tour_id = 'task-event-upcoming' and next_step in ('intro', 'choose-upcoming-in-the-event-view-controls'))
  or
  (tour_id = 'task-event-past' and next_step in ('intro', 'choose-past-in-the-event-view-controls'))
  or
  (tour_id = 'task-event-calendar' and next_step in ('intro', 'choose-calendar-view', 'move-to-the-month-you-need-events'))
  or
  (tour_id = 'task-event-detail' and next_step in ('intro', 'open-the-event-card-you-want-to'))
  or
  (tour_id = 'task-event-availability' and next_step in ('intro', 'confirm-the-open-event-is-the-service', 'under-attendance-choose-im-available-maybe-or', 'read-the-displayed-response-to-verify-it'))
  or
  (tour_id = 'task-event-availability-summary' and next_step in ('intro', 'read-the-my-availability-upcoming-summary-on'))
  or
  (tour_id = 'task-event-create' and next_step in ('intro', 'choose-new-event', 'enter-the-event-title-type-date-and', 'complete-the-schedule-and-team-assignments', 'choose-create-event-or-request-event-as', 'read-the-result-status'))
  or
  (tour_id = 'task-event-title-type' and next_step in ('intro', 'enter-a-descriptive-title-and-choose-event', 'choose-create-event-or-request-event-as', 'read-the-result-message-if-saving-fails'))
  or
  (tour_id = 'task-event-date-location' and next_step in ('intro', 'set-date-and-location-verify-the-calendar', 'choose-create-event-or-request-event-after', 'read-the-result-message-if-saving-fails'))
  or
  (tour_id = 'task-event-assignments' and next_step in ('intro', 'select-the-serving-members-in-team-assignments', 'choose-create-event-or-request-event-after', 'read-the-result-message-if-saving-fails'))
  or
  (tour_id = 'task-event-notes' and next_step in ('intro', 'enter-preparation-instructions-in-the-event-notes', 'choose-create-event-or-request-event-after', 'read-the-result-message-if-saving-fails'))
  or
  (tour_id = 'task-event-create-submit' and next_step in ('intro', 'choose-the-forms-create-event-or-request'))
  or
  (tour_id = 'task-event-request-review' and next_step in ('intro', 'choose-approve-or-reject-on-the-correct'))
  or
  (tour_id = 'task-event-edit' and next_step in ('intro', 'choose-edit-event-on-the-current-event', 'update-the-intended-schedule-or-assignment-fields', 'choose-save-changes', 'read-the-result-and-verify-the-updated'))
  or
  (tour_id = 'task-event-save' and next_step in ('intro', 'choose-save-changes-on-the-event-form'))
  or
  (tour_id = 'task-event-linked-setlist' and next_step in ('intro', 'choose-open-setlist-detail-on-the-event'))
  or
  (tour_id = 'task-event-delete' and next_step in ('intro', 'choose-delete-event', 'review-the-dialog-attendance-and-team-assignments', 'choose-cancel-to-keep-the-event-or', 'wait-for-the-event-detail-page-to'))
  or
  (tour_id = 'task-message-find' and next_step in ('intro', 'enter-a-name-in-search-conversations-matching'))
  or
  (tour_id = 'task-message-mobile-sidebar' and next_step in ('intro', 'choose-toggle-message-sidebar-the-conversation-list'))
  or
  (tour_id = 'task-message-check-recipient' and next_step in ('intro', 'check-the-active-conversation-heading-the-heading'))
  or
  (tour_id = 'task-message-reply' and next_step in ('intro', 'choose-reply-on-the-message-you-want'))
  or
  (tour_id = 'task-message-compose' and next_step in ('intro', 'check-the-current-conversation-heading-to-confirm', 'enter-your-text-in-the-message-field', 'choose-send-message', 'verify-the-new-message-appears-read-an'))
  or
  (tour_id = 'task-message-attachment' and next_step in ('intro', 'choose-the-attachment-control', 'select-the-intended-file-the-selected-attachment'))
  or
  (tour_id = 'task-message-attachment-types' and next_step in ('intro', 'choose-files-documents-or-photos-videos-from'))
  or
  (tour_id = 'task-message-emoji' and next_step in ('intro', 'choose-open-emoji-menu-beside-the-message'))
  or
  (tour_id = 'task-message-send-like' and next_step in ('intro', 'choose-send-like-while-the-message-draft'))
  or
  (tour_id = 'task-message-reaction' and next_step in ('intro', 'choose-react-on-the-target-message-the'))
  or
  (tour_id = 'task-message-shared-files' and next_step in ('intro', 'open-shared-files-in-the-conversation-details'))
  or
  (tour_id = 'task-message-send-problem' and next_step in ('intro', 'check-the-conversation-heading-and-the-message'))
  or
  (tour_id = 'task-message-search-no-results' and next_step in ('intro', 'clear-the-search-field-the-conversation-list'))
  or
  (tour_id = 'task-profile-name' and next_step in ('intro', 'enter-your-name-in-full-name', 'choose-save-changes', 'read-the-result-message-and-check-the'))
  or
  (tour_id = 'task-profile-birthday' and next_step in ('intro', 'set-birthday', 'choose-save-changes', 'read-the-result-message-to-verify-the'))
  or
  (tour_id = 'task-profile-anniversary' and next_step in ('intro', 'set-team-anniversary', 'choose-save-changes', 'read-the-result-message-to-verify-the'))
  or
  (tour_id = 'task-profile-ministry' and next_step in ('intro', 'choose-the-applicable-ministry-involvement-option', 'if-band-member-is-selected-choose-the', 'choose-save-changes', 'read-the-result-message-and-check-the'))
  or
  (tour_id = 'task-member-search' and next_step in ('intro', 'enter-a-member-name-in-search-members'))
  or
  (tour_id = 'task-member-role-filter' and next_step in ('intro', 'open-role-filter', 'choose-a-role-only-members-matching-the'))
  or
  (tour_id = 'task-member-profile' and next_step in ('intro', 'choose-the-intended-members-row-in-active', 'review-their-details-in-the-member-drawer', 'choose-full-profile-only-if-you-need'))
  or
  (tour_id = 'task-member-team-code' and next_step in ('intro', 'copy-the-current-team-code-the-recipient'))
  or
  (tour_id = 'task-member-regenerate-code' and next_step in ('intro', 'open-team-management', 'choose-regenerate-team-code', 'read-the-result-status-and-check-the', 'share-the-new-code-with-people-who'))
  or
  (tour_id = 'task-member-join-requests' and next_step in ('intro', 'open-the-join-requests-section-pending-requests'))
  or
  (tour_id = 'task-member-approve' and next_step in ('intro', 'choose-approve-on-the-correct-request-the'))
  or
  (tour_id = 'task-member-reject' and next_step in ('intro', 'choose-reject-on-the-intended-request-the'))
  or
  (tour_id = 'task-member-invite-email' and next_step in ('intro', 'choose-invite-member', 'enter-the-teammates-email', 'choose-the-intended-role', 'enter-an-optional-message-if-useful', 'review-the-address-and-role-before-sending'))
  or
  (tour_id = 'task-member-invite-send' and next_step in ('intro', 'check-the-email-address-and-selected-role', 'choose-send-invite', 'read-the-result-message-to-confirm-it'))
  or
  (tour_id = 'task-member-role-change' and next_step in ('intro', 'choose-the-correct-members-row-in-active', 'check-their-identity-in-the-member-drawer', 'use-the-control-labelled-appoint-leadership-role', 'read-the-result-status-to-confirm-the'))
  or
  (tour_id = 'task-member-requests-search' and next_step in ('intro', 'search-by-the-persons-name-in-search'))
  or
  (tour_id = 'task-member-remove' and next_step in ('intro', 'find-the-intended-member-in-active-team', 'check-the-name-beside-their-remove-control', 'choose-remove-for-that-member', 'confirm-in-the-browser-prompt-and-read'))
  or
  (tour_id = 'task-analytics-overview' and next_step in ('intro', 'open-analytics', 'read-the-summary-cards-each-card-shows'))
  or
  (tour_id = 'task-analytics-rotation' and next_step in ('intro', 'open-songs-in-rotation-on-analytics-the'))
  or
  (tour_id = 'task-analytics-attendance' and next_step in ('intro', 'open-attendance-by-gathering-on-analytics-attendance'))
  or
  (tour_id = 'task-analytics-channels' and next_step in ('intro', 'open-most-active-channels-on-analytics-the'))
  or
  (tour_id = 'task-notice-read' and next_step in ('intro', 'read-the-title-and-message-in-the'))
  or
  (tour_id = 'task-notice-ack' and next_step in ('intro', 'choose-the-announcements-acknowledgement-control-the-control'))
  or
  (tour_id = 'task-notice-create-open' and next_step in ('intro', 'choose-add-announcement', 'check-that-the-announcement-composer-opens-keep'))
  or
  (tour_id = 'task-notice-title-message' and next_step in ('intro', 'choose-add-announcement', 'enter-the-announcement-title', 'enter-the-message', 'choose-category-and-priority-and-review-the'))
  or
  (tour_id = 'task-notice-audience' and next_step in ('intro', 'choose-add-announcement', 'choose-tag-in-the-composer', 'select-all-team-team-role-or-person', 'check-the-audience-shown-before-posting'))
  or
  (tour_id = 'task-notice-linked-event' and next_step in ('intro', 'choose-add-announcement', 'open-linked-event-in-the-composer', 'select-the-relevant-scheduled-event', 'check-that-the-selected-event-is-shown'))
  or
  (tour_id = 'task-notice-post' and next_step in ('intro', 'choose-add-announcement', 'review-title-message-category-and-priority', 'check-recipients-and-any-linked-event', 'choose-post-announcement-and-read-the-status'))
  or
  (tour_id = 'task-reminder-feed' and next_step in ('intro', 'open-a-reminder-in-the-feed-the'))
  or
  (tour_id = 'task-reminder-create-open' and next_step in ('intro', 'choose-add-reminder', 'check-that-the-reminder-form-opens-and'))
  or
  (tour_id = 'task-reminder-schedule' and next_step in ('intro', 'choose-add-reminder', 'set-schedule-date', 'choose-tag-and-select-the-intended-audience', 'review-the-date-and-audience-before-sending'))
  or
  (tour_id = 'task-reminder-repeat' and next_step in ('intro', 'choose-add-reminder', 'set-repeat-to-the-intended-interval', 'set-occurrences-to-the-intended-count', 'check-the-recurrence-and-recipients-before-sending'))
  or
  (tour_id = 'task-reminder-send' and next_step in ('intro', 'choose-add-reminder', 'review-title-and-message', 'check-the-intended-audience-and-schedule', 'choose-send-reminder-and-read-the-result'))
  or
  (tour_id = 'task-dance-search' and next_step in ('intro', 'enter-a-title-song-or-artist-in'))
  or
  (tour_id = 'task-dance-steps' and next_step in ('intro', 'open-dance-tambourine-steps-on-the-chart'))
  or
  (tour_id = 'task-dance-video' and next_step in ('intro', 'open-the-video-reference-link-on-the'))
  or
  (tour_id = 'task-dance-formation' and next_step in ('intro', 'open-the-formation-section-on-the-dance'))
  or
  (tour_id = 'task-dance-outfit' and next_step in ('intro', 'open-outfit-props-on-the-chart-saved'))
  or
  (tour_id = 'task-dance-create' and next_step in ('intro', 'choose-add-dance-chart', 'enter-a-chart-title-and-identify-the', 'add-choreography-by-song-section-and-optional', 'choose-save-dance-chart-and-read-the'))
  or
  (tour_id = 'task-dance-detail-fields' and next_step in ('intro', 'enter-steps-by-song-section-and-optional', 'choose-save-dance-chart-after-checking-title', 'read-the-result-message-if-saving-fails'))
  or
  (tour_id = 'task-dance-save' and next_step in ('intro', 'choose-the-forms-save-action-the-result'))
  or
  (tour_id = 'task-dance-edit' and next_step in ('intro', 'choose-edit-chart-on-the-chart-currently', 'update-the-choreography-and-references', 'choose-save-changes', 'read-the-result-message'))
  or
  (tour_id = 'task-settings-team-controls' and next_step in ('intro', 'choose-team-controls-in-settings-tabs-the'))
  or
  (tour_id = 'task-settings-ministry-defaults' and next_step in ('intro', 'choose-ministry-defaults-in-settings-tabs-the'))
  or
  (tour_id = 'task-settings-review-workflow' and next_step in ('intro', 'choose-review-workflow-in-settings-tabs-the'))
  or
  (tour_id = 'task-settings-permissions' and next_step in ('intro', 'choose-permissions-in-settings-tabs-the-permission'))
  or
  (tour_id = 'task-settings-integrations' and next_step in ('intro', 'choose-integrations-in-settings-tabs-the-integrations'))
  or
  (tour_id = 'task-settings-save' and next_step in ('intro', 'choose-that-sections-save-control-when-one'))
  or
  (tour_id = 'task-practice-choose-song' and next_step in ('intro', 'choose-a-song-in-setlist-queue-the'))
  or
  (tour_id = 'task-practice-key' and next_step in ('intro', 'select-the-required-key-in-practice-controls'))
  or
  (tour_id = 'task-practice-capo' and next_step in ('intro', 'choose-a-capo-value-in-practice-controls'))
  or
  (tour_id = 'task-practice-chart-size' and next_step in ('intro', 'adjust-chart-size-in-practice-controls-the'))
  or
  (tour_id = 'task-practice-auto-scroll' and next_step in ('intro', 'choose-auto-scroll-to-toggle-movement-the'))
  or
  (tour_id = 'task-practice-scroll-speed' and next_step in ('intro', 'adjust-scroll-speed-in-practice-controls-movement'))
  or
  (tour_id = 'task-practice-metronome' and next_step in ('intro', 'choose-metronome-settings-in-practice-controls-the'))
  or
  (tour_id = 'task-practice-loop' and next_step in ('intro', 'select-the-section-and-activate-its-loop'))
  or
  (tour_id = 'task-practice-stage-link' and next_step in ('intro', 'choose-stage-on-the-current-setlist-stage'))
  or
  (tour_id = 'task-practice-empty' and next_step in ('intro', 'return-to-the-setlist', 'choose-add-song-if-permitted-songs-appear'))
  or
  (tour_id = 'task-stage-setup' and next_step in ('intro', 'review-the-stage-controls-before-playing-the'))
  or
  (tour_id = 'task-stage-navigation' and next_step in ('intro', 'choose-next-song-in-stage-controls-the'))
  or
  (tour_id = 'task-projector-purpose' and next_step in ('intro', 'open-projector-from-the-current-setlist-and'))
  or
  (tour_id = 'task-projector-check' and next_step in ('intro', 'change-a-rehearsal-slide-from-the-presenter'))
  or
  (tour_id = 'task-confidence-purpose' and next_step in ('intro', 'open-confidence-output-for-the-current-setlist'))
  or
  (tour_id = 'task-confidence-check' and next_step in ('intro', 'change-a-rehearsal-slide-from-the-connected'))
  or
  (tour_id = 'task-remote-pair-pin' and next_step in ('intro', 'enter-the-six-digit-pairing-code', 'choose-connect-to-presenter-the-page-confirms'))
  or
  (tour_id = 'task-remote-pair-qr' and next_step in ('intro', 'choose-scan-qr-code-and-scan-the'))
  or
  (tour_id = 'task-remote-expired-code' and next_step in ('intro', 'generate-a-new-code-on-the-windows'))
  or
  (tour_id = 'task-remote-connected-session' and next_step in ('intro', 'read-the-connected-session-details-before-using'))
  or
  (tour_id = 'task-remote-navigation' and next_step in ('intro', 'choose-the-intended-song-or-section-in'))
  or
  (tour_id = 'task-remote-camera-limit' and next_step in ('intro', 'choose-the-pin-form', 'enter-a-fresh-six-digit-code-the'))
  or
  (tour_id = 'task-wooly-open' and next_step in ('intro', 'choose-the-wooly-launcher-the-help-panel'))
  or
  (tour_id = 'task-wooly-tutorials' and next_step in ('intro', 'choose-tutorials-in-the-wooly-panel-available'))
  or
  (tour_id = 'task-wooly-next' and next_step in ('intro', 'choose-next-in-the-wooly-tutorial-the'))
  or
  (tour_id = 'task-wooly-skip' and next_step in ('intro', 'choose-skip-in-the-tutorial-controls-the'))
  or
  (tour_id = 'task-wooly-chat' and next_step in ('intro', 'choose-chat', 'enter-your-question-wooly-returns-a-prepared'))
  or
  (tour_id = 'task-wooly-ambiguous' and next_step in ('intro', 'choose-the-closest-matching-result-in-woolys'))
  or
  (tour_id = 'task-wooly-show-me' and next_step in ('intro', 'choose-show-me-on-the-prepared-answer'))
  or
  (tour_id = 'task-wooly-report' and next_step in ('intro', 'choose-quick-report-in-woolys-help-panel'))
  or
  (tour_id = 'task-wooly-support-question' and next_step in ('intro', 'choose-my-questions', 'submit-the-question-form-a-confirmation-says'))
  or
  (tour_id = 'task-wooly-support-reply' and next_step in ('intro', 'choose-the-support-question-in-my-questions'))
  or
  (tour_id = 'task-wooly-support-retry' and next_step in ('intro', 'retry-send-after-checking-the-displayed-error'))
  or
  (tour_id = 'task-template-picker-open' and next_step in ('intro', 'choose-use-template', 'check-that-choose-a-template-opens-and'))
  or
  (tour_id = 'task-template-picker-select' and next_step in ('intro', 'choose-use-template', 'review-the-template-names-and-descriptions-in', 'select-the-intended-template-card', 'check-the-new-setlist-form-for-the'))
  or
  (tour_id = 'task-template-picker-close' and next_step in ('intro', 'choose-use-template', 'choose-close-template-picker-in-the-dialog', 'check-that-the-dialog-closes-and-the'))
  or
  (tour_id = 'task-setlist-band-notes' and next_step in ('intro', 'find-the-intended-song-in-song-order', 'choose-add-notes-or-edit-notes-for', 'enter-the-note-in-the-band-notes', 'choose-save-notes-after-the-dialog-closes'))
  or
  (tour_id = 'task-setlist-song-order' and next_step in ('intro', 'confirm-the-current-setlist-and-intended-song', 'drag-its-handle-to-the-intended-numbered', 'reopen-the-plan-after-the-action-settles'))
  or
  (tour_id = 'task-setlist-template-create' and next_step in ('intro', 'choose-save-as-template', 'check-that-the-template-form-opens-and'))
  or
  (tour_id = 'task-setlist-template-save-details' and next_step in ('intro', 'choose-save-as-template', 'enter-a-recognizable-template-name', 'enter-a-description-if-that-optional-field', 'review-the-details-before-submission'))
  or
  (tour_id = 'task-setlist-template-save-submit' and next_step in ('intro', 'choose-save-as-template', 'review-the-template-name-and-optional-details', 'choose-save-template', 'read-the-result-message'))
  or
  (tour_id = 'task-practice-arrangement-section' and next_step in ('intro', 'choose-the-labeled-section-button-beside-the'))
  or
  (tour_id = 'task-practice-arrangement-loop' and next_step in ('intro', 'choose-the-intended-section-button-beside-the'))
  or
  (tour_id = 'task-practice-edit-arrangement' and next_step in ('intro', 'choose-edit-arrangement-beside-the-intended-song', 'check-that-the-arrangement-dialog-opens-for', 'review-or-change-its-section-order', 'choose-save-arrangement-and-read-the-save'))
  or
  (tour_id = 'joining' and next_step in ('welcome', 'code', 'preview', 'role', 'request'))
  or
  (tour_id = 'creating' and next_step in ('details', 'invites', 'review'))
  or
  (tour_id = 'essentials' and next_step in ('welcome', 'home', 'setlists', 'timeline', 'messages', 'profile', 'finish'))
);
commit;
