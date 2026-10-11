// Stable checkpoint IDs. Keep these literals when wording changes.
// Add new IDs deliberately; never regenerate identifiers for published steps.
export const woolyTaskStepIds: Readonly<Record<string, readonly string[]>> = {
  "welcome-start": [
    "choose-get-started-with-google",
    "select-your-google-account-the-app-opens"
  ],
  "login-account": [
    "open-sign-in-with-google",
    "select-the-account-associated-with-your-team"
  ],
  "create-account-choice": [
    "on-choose-your-team-select-create-a"
  ],
  "login-troubleshoot": [
    "review-the-displayed-error-and-retry-once"
  ],
  "public-features": [
    "choose-get-started-with-google-to-enter"
  ],
  "team-join": [
    "choose-join-a-team",
    "enter-the-team-code",
    "check-the-matched-team-preview",
    "choose-the-role-that-matches-how-you",
    "choose-request-to-join-team-and-wait"
  ],
  "team-code-invalid": [
    "correct-team-code",
    "wait-for-the-team-preview-a-matching"
  ],
  "team-role-select": [
    "open-choose-your-role",
    "select-your-ministry-role-your-selected-role"
  ],
  "team-request": [
    "check-the-matched-team-and-selected-role",
    "choose-request-to-join-team",
    "wait-for-the-pending-request-page-to",
    "read-request-details-while-waiting-for-the"
  ],
  "team-pending": [
    "open-request-details-on-the-pending-page"
  ],
  "team-create-name": [
    "enter-a-ministry-team-name",
    "enter-the-location",
    "choose-continue",
    "check-that-the-invitations-step-opens-with"
  ],
  "team-create-review": [
    "choose-continue-to-reach-review-create-workspace"
  ],
  "team-create-submit": [
    "choose-continue-through-team-details-and-invite",
    "check-ministry-team-name-and-location",
    "check-the-displayed-service-details-and-your",
    "choose-create-team",
    "confirm-the-new-team-dashboard-opens"
  ],
  "home-next-service": [
    "read-the-next-service-card-at-the"
  ],
  "home-confirm-availability": [
    "choose-confirm-availability-on-the-service-card"
  ],
  "home-open-setlist": [
    "choose-open-setlist-on-the-next-service"
  ],
  "home-message-team": [
    "choose-message-team-on-the-dashboard-messages"
  ],
  "home-no-service": [
    "choose-timeline-in-the-navigation-the-event"
  ],
  "home-navigation-setlists": [
    "choose-setlists-from-the-navigation-the-setlists"
  ],
  "home-navigation-timeline": [
    "choose-timeline-from-the-navigation-the-event"
  ],
  "home-welcome-new-team": [
    "open-setlists-or-timeline-from-the-navigation"
  ],
  "home-analytics-link": [
    "choose-analytics-from-the-navigation-the-analytics"
  ],
  "setlist-search": [
    "enter-a-name-in-search-setlists-matching"
  ],
  "setlist-view-all": [
    "choose-all-in-the-setlist-view-tabs"
  ],
  "setlist-view-standalone": [
    "choose-standalone-in-the-setlist-view-tabs"
  ],
  "setlist-view-upcoming": [
    "choose-upcoming-in-the-setlist-view-tabs"
  ],
  "setlist-view-past": [
    "choose-past-in-the-setlist-view-tabs"
  ],
  "setlist-filter-leader": [
    "open-filters",
    "choose-a-leader-the-list-narrows-to"
  ],
  "setlist-filter-type": [
    "open-filters",
    "select-a-service-type-matching-event-linked"
  ],
  "setlist-create": [
    "choose-new-setlist",
    "enter-setlist-name-and-optional-notes",
    "search-song-library-for-a-song",
    "drag-the-song-into-song-order-and",
    "choose-create-setlist-and-read-the-result"
  ],
  "setlist-name": [
    "enter-setlist-name-for-example-sunday-morning",
    "choose-create-setlist-when-the-name-and",
    "read-the-result-message-if-saving-fails"
  ],
  "setlist-notes": [
    "enter-preparation-notes-in-notes",
    "choose-create-setlist-when-the-name-and",
    "read-the-result-message-if-saving-fails"
  ],
  "setlist-add-songs": [
    "search-song-library-for-the-intended-song",
    "drag-its-card-into-song-order",
    "choose-create-setlist-after-reviewing-the-name",
    "read-the-result-and-check-that-the"
  ],
  "setlist-reorder": [
    "drag-a-selected-songs-handle-to-its",
    "choose-create-setlist-to-save-this-new",
    "read-the-result-message-if-saving-fails"
  ],
  "setlist-remove-song": [
    "choose-the-remove-icon-beside-the-incorrect",
    "choose-create-setlist-to-save-the-remaining",
    "read-the-result-message-if-saving-fails"
  ],
  "setlist-save-new": [
    "choose-create-setlist-after-reviewing-the-form"
  ],
  "setlist-edit": [
    "choose-edit-setlist-on-the-current-plan",
    "update-the-name-notes-or-selected-song",
    "choose-save-changes",
    "read-the-result-before-leaving"
  ],
  "setlist-linked-event": [
    "choose-the-existing-standalone-plan-in-the",
    "choose-save-changes",
    "read-the-result-and-verify-the-linked"
  ],
  "setlist-templates": [
    "choose-templates-in-the-setlists-navigation-saved"
  ],
  "setlist-template-delete": [
    "read-the-name-on-the-intended-template",
    "choose-that-cards-delete-template-control",
    "wait-for-the-page-to-refresh-and"
  ],
  "setlist-add-song-route": [
    "choose-add-song",
    "search-the-library-and-drag-desired-songs",
    "set-each-songs-key-and-category",
    "choose-save-to-setlist-and-verify-the"
  ],
  "song-search": [
    "enter-a-title-artist-or-tag-in"
  ],
  "song-favorites": [
    "choose-filter",
    "select-favorites-only-songs-marked-as-favorites"
  ],
  "song-all": [
    "choose-filter",
    "select-all-songs-the-library-returns-to"
  ],
  "song-sort-az": [
    "open-filter",
    "choose-a-z-song-cards-appear-in"
  ],
  "song-sort-played": [
    "open-filter",
    "choose-most-played-the-list-is-ordered"
  ],
  "song-open-chart": [
    "choose-a-song-card-from-the-library"
  ],
  "song-add": [
    "choose-add-song",
    "enter-the-title-and-artist-source-in",
    "enter-the-known-key-and-bpm-leave",
    "enter-lyrics-and-chords-in-the-chart",
    "choose-create-song",
    "read-the-result-and-any-pending-review"
  ],
  "song-title-artist": [
    "enter-the-song-title-and-artist-source",
    "choose-create-song-after-reviewing-the-music",
    "read-the-result-message-if-saving-fails"
  ],
  "song-default-key": [
    "choose-the-known-default-key-for-this",
    "choose-create-song-after-reviewing-the-chart",
    "read-the-result-message-if-saving-fails"
  ],
  "song-bpm": [
    "enter-the-confirmed-tempo-in-bpm-for",
    "choose-create-song-after-reviewing-the-chart",
    "read-the-result-message-if-saving-fails"
  ],
  "song-tags": [
    "enter-useful-team-tags-in-tags",
    "choose-create-song-after-reviewing-the-chart",
    "read-the-result-message-if-saving-fails"
  ],
  "song-chart-entry": [
    "enter-the-lyrics-and-chords-keeping-the",
    "choose-create-song-after-checking-title-and",
    "read-the-result-message-if-saving-fails"
  ],
  "song-create-submit": [
    "choose-create-song-after-reviewing-the-form"
  ],
  "song-edit": [
    "choose-edit-song-on-this-songs-chart",
    "update-the-intended-fields-in-song-details",
    "choose-save-song",
    "read-the-result-message-before-leaving"
  ],
  "song-transpose": [
    "select-the-desired-key-in-the-song"
  ],
  "song-capo": [
    "choose-a-capo-value-in-the-song"
  ],
  "song-favorite-toggle": [
    "choose-the-songs-star-control-the-star"
  ],
  "song-delete": [
    "choose-delete-song",
    "check-the-delete-song-dialog-and-verify",
    "choose-cancel-to-keep-it-or-yes",
    "check-the-result-after-the-dialog-closes"
  ],
  "song-trash": [
    "choose-restore-beside-the-correct-song-the"
  ],
  "song-delete-permanent": [
    "open-song-trash",
    "verify-the-title-and-deletion-countdown-for",
    "choose-delete-permanently",
    "confirm-in-the-browser-prompt-only-if"
  ],
  "song-empty-library": [
    "clear-search",
    "choose-all-songs-in-filter-the-full"
  ],
  "event-search": [
    "enter-an-event-name-in-search-events"
  ],
  "event-upcoming": [
    "choose-upcoming-in-the-event-view-controls"
  ],
  "event-past": [
    "choose-past-in-the-event-view-controls"
  ],
  "event-calendar": [
    "choose-calendar-view",
    "move-to-the-month-you-need-events"
  ],
  "event-detail": [
    "open-the-event-card-you-want-to"
  ],
  "event-availability": [
    "confirm-the-open-event-is-the-service",
    "under-attendance-choose-im-available-maybe-or",
    "read-the-displayed-response-to-verify-it"
  ],
  "event-availability-summary": [
    "read-the-my-availability-upcoming-summary-on"
  ],
  "event-create": [
    "choose-new-event",
    "enter-the-event-title-type-date-and",
    "complete-the-schedule-and-team-assignments",
    "choose-create-event-or-request-event-as",
    "read-the-result-status"
  ],
  "event-title-type": [
    "enter-a-descriptive-title-and-choose-event",
    "choose-create-event-or-request-event-as",
    "read-the-result-message-if-saving-fails"
  ],
  "event-date-location": [
    "set-date-and-location-verify-the-calendar",
    "choose-create-event-or-request-event-after",
    "read-the-result-message-if-saving-fails"
  ],
  "event-assignments": [
    "select-the-serving-members-in-team-assignments",
    "choose-create-event-or-request-event-after",
    "read-the-result-message-if-saving-fails"
  ],
  "event-notes": [
    "enter-preparation-instructions-in-the-event-notes",
    "choose-create-event-or-request-event-after",
    "read-the-result-message-if-saving-fails"
  ],
  "event-create-submit": [
    "choose-the-forms-create-event-or-request"
  ],
  "event-request-review": [
    "choose-approve-or-reject-on-the-correct"
  ],
  "event-edit": [
    "choose-edit-event-on-the-current-event",
    "update-the-intended-schedule-or-assignment-fields",
    "choose-save-changes",
    "read-the-result-and-verify-the-updated"
  ],
  "event-save": [
    "choose-save-changes-on-the-event-form"
  ],
  "event-linked-setlist": [
    "choose-open-setlist-detail-on-the-event"
  ],
  "event-delete": [
    "choose-delete-event",
    "review-the-dialog-attendance-and-team-assignments",
    "choose-cancel-to-keep-the-event-or",
    "wait-for-the-event-detail-page-to"
  ],
  "message-find": [
    "enter-a-name-in-search-conversations-matching"
  ],
  "message-mobile-sidebar": [
    "choose-toggle-message-sidebar-the-conversation-list"
  ],
  "message-check-recipient": [
    "check-the-active-conversation-heading-the-heading"
  ],
  "message-reply": [
    "choose-reply-on-the-message-you-want"
  ],
  "message-compose": [
    "check-the-current-conversation-heading-to-confirm",
    "enter-your-text-in-the-message-field",
    "choose-send-message",
    "verify-the-new-message-appears-read-an"
  ],
  "message-attachment": [
    "choose-the-attachment-control",
    "select-the-intended-file-the-selected-attachment"
  ],
  "message-attachment-types": [
    "choose-files-documents-or-photos-videos-from"
  ],
  "message-emoji": [
    "choose-open-emoji-menu-beside-the-message"
  ],
  "message-send-like": [
    "choose-send-like-while-the-message-draft"
  ],
  "message-reaction": [
    "choose-react-on-the-target-message-the"
  ],
  "message-shared-files": [
    "open-shared-files-in-the-conversation-details"
  ],
  "message-send-problem": [
    "check-the-conversation-heading-and-the-message"
  ],
  "message-search-no-results": [
    "clear-the-search-field-the-conversation-list"
  ],
  "profile-name": [
    "enter-your-name-in-full-name",
    "choose-save-changes",
    "read-the-result-message-and-check-the"
  ],
  "profile-birthday": [
    "set-birthday",
    "choose-save-changes",
    "read-the-result-message-to-verify-the"
  ],
  "profile-anniversary": [
    "set-team-anniversary",
    "choose-save-changes",
    "read-the-result-message-to-verify-the"
  ],
  "profile-ministry": [
    "choose-the-applicable-ministry-involvement-option",
    "if-band-member-is-selected-choose-the",
    "choose-save-changes",
    "read-the-result-message-and-check-the"
  ],
  "member-search": [
    "enter-a-member-name-in-search-members"
  ],
  "member-role-filter": [
    "open-role-filter",
    "choose-a-role-only-members-matching-the"
  ],
  "member-profile": [
    "choose-the-intended-members-row-in-active",
    "review-their-details-in-the-member-drawer",
    "choose-full-profile-only-if-you-need"
  ],
  "member-team-code": [
    "copy-the-current-team-code-the-recipient"
  ],
  "member-regenerate-code": [
    "open-team-management",
    "choose-regenerate-team-code",
    "read-the-result-status-and-check-the",
    "share-the-new-code-with-people-who"
  ],
  "member-join-requests": [
    "open-the-join-requests-section-pending-requests"
  ],
  "member-approve": [
    "choose-approve-on-the-correct-request-the"
  ],
  "member-reject": [
    "choose-reject-on-the-intended-request-the"
  ],
  "member-invite-email": [
    "choose-invite-member",
    "enter-the-teammates-email",
    "choose-the-intended-role",
    "enter-an-optional-message-if-useful",
    "review-the-address-and-role-before-sending"
  ],
  "member-invite-send": [
    "check-the-email-address-and-selected-role",
    "choose-send-invite",
    "read-the-result-message-to-confirm-it"
  ],
  "member-role-change": [
    "choose-the-correct-members-row-in-active",
    "check-their-identity-in-the-member-drawer",
    "use-the-control-labelled-appoint-leadership-role",
    "read-the-result-status-to-confirm-the"
  ],
  "member-requests-search": [
    "search-by-the-persons-name-in-search"
  ],
  "member-remove": [
    "find-the-intended-member-in-active-team",
    "check-the-name-beside-their-remove-control",
    "choose-remove-for-that-member",
    "confirm-in-the-browser-prompt-and-read"
  ],
  "analytics-overview": [
    "open-analytics",
    "read-the-summary-cards-each-card-shows"
  ],
  "analytics-rotation": [
    "open-songs-in-rotation-on-analytics-the"
  ],
  "analytics-attendance": [
    "open-attendance-by-gathering-on-analytics-attendance"
  ],
  "analytics-channels": [
    "open-most-active-channels-on-analytics-the"
  ],
  "notice-read": [
    "read-the-title-and-message-in-the"
  ],
  "notice-ack": [
    "choose-the-announcements-acknowledgement-control-the-control"
  ],
  "notice-create-open": [
    "choose-add-announcement",
    "check-that-the-announcement-composer-opens-keep"
  ],
  "notice-title-message": [
    "choose-add-announcement",
    "enter-the-announcement-title",
    "enter-the-message",
    "choose-category-and-priority-and-review-the"
  ],
  "notice-audience": [
    "choose-add-announcement",
    "choose-tag-in-the-composer",
    "select-all-team-team-role-or-person",
    "check-the-audience-shown-before-posting"
  ],
  "notice-linked-event": [
    "choose-add-announcement",
    "open-linked-event-in-the-composer",
    "select-the-relevant-scheduled-event",
    "check-that-the-selected-event-is-shown"
  ],
  "notice-post": [
    "choose-add-announcement",
    "review-title-message-category-and-priority",
    "check-recipients-and-any-linked-event",
    "choose-post-announcement-and-read-the-status"
  ],
  "reminder-feed": [
    "open-a-reminder-in-the-feed-the"
  ],
  "reminder-create-open": [
    "choose-add-reminder",
    "check-that-the-reminder-form-opens-and"
  ],
  "reminder-schedule": [
    "choose-add-reminder",
    "set-schedule-date",
    "choose-tag-and-select-the-intended-audience",
    "review-the-date-and-audience-before-sending"
  ],
  "reminder-repeat": [
    "choose-add-reminder",
    "set-repeat-to-the-intended-interval",
    "set-occurrences-to-the-intended-count",
    "check-the-recurrence-and-recipients-before-sending"
  ],
  "reminder-send": [
    "choose-add-reminder",
    "review-title-and-message",
    "check-the-intended-audience-and-schedule",
    "choose-send-reminder-and-read-the-result"
  ],
  "dance-search": [
    "enter-a-title-song-or-artist-in"
  ],
  "dance-steps": [
    "open-dance-tambourine-steps-on-the-chart"
  ],
  "dance-video": [
    "open-the-video-reference-link-on-the"
  ],
  "dance-formation": [
    "open-the-formation-section-on-the-dance"
  ],
  "dance-outfit": [
    "open-outfit-props-on-the-chart-saved"
  ],
  "dance-create": [
    "choose-add-dance-chart",
    "enter-a-chart-title-and-identify-the",
    "add-choreography-by-song-section-and-optional",
    "choose-save-dance-chart-and-read-the"
  ],
  "dance-detail-fields": [
    "enter-steps-by-song-section-and-optional",
    "choose-save-dance-chart-after-checking-title",
    "read-the-result-message-if-saving-fails"
  ],
  "dance-save": [
    "choose-the-forms-save-action-the-result"
  ],
  "dance-edit": [
    "choose-edit-chart-on-the-chart-currently",
    "update-the-choreography-and-references",
    "choose-save-changes",
    "read-the-result-message"
  ],
  "settings-team-controls": [
    "choose-team-controls-in-settings-tabs-the"
  ],
  "settings-ministry-defaults": [
    "choose-ministry-defaults-in-settings-tabs-the"
  ],
  "settings-review-workflow": [
    "choose-review-workflow-in-settings-tabs-the"
  ],
  "settings-permissions": [
    "choose-permissions-in-settings-tabs-the-permission"
  ],
  "settings-integrations": [
    "choose-integrations-in-settings-tabs-the-integrations"
  ],
  "settings-save": [
    "choose-that-sections-save-control-when-one"
  ],
  "practice-choose-song": [
    "choose-a-song-in-setlist-queue-the"
  ],
  "practice-key": [
    "select-the-required-key-in-practice-controls"
  ],
  "practice-capo": [
    "choose-a-capo-value-in-practice-controls"
  ],
  "practice-chart-size": [
    "adjust-chart-size-in-practice-controls-the"
  ],
  "practice-auto-scroll": [
    "choose-auto-scroll-to-toggle-movement-the"
  ],
  "practice-scroll-speed": [
    "adjust-scroll-speed-in-practice-controls-movement"
  ],
  "practice-metronome": [
    "choose-metronome-settings-in-practice-controls-the"
  ],
  "practice-loop": [
    "select-the-section-and-activate-its-loop"
  ],
  "practice-stage-link": [
    "choose-stage-on-the-current-setlist-stage"
  ],
  "practice-empty": [
    "return-to-the-setlist",
    "choose-add-song-if-permitted-songs-appear"
  ],
  "stage-setup": [
    "review-the-stage-controls-before-playing-the"
  ],
  "stage-navigation": [
    "choose-next-song-in-stage-controls-the"
  ],
  "projector-purpose": [
    "open-projector-from-the-current-setlist-and"
  ],
  "projector-check": [
    "change-a-rehearsal-slide-from-the-presenter"
  ],
  "confidence-purpose": [
    "open-confidence-output-for-the-current-setlist"
  ],
  "confidence-check": [
    "change-a-rehearsal-slide-from-the-connected"
  ],
  "remote-pair-pin": [
    "enter-the-six-digit-pairing-code",
    "choose-connect-to-presenter-the-page-confirms"
  ],
  "remote-pair-qr": [
    "choose-scan-qr-code-and-scan-the"
  ],
  "remote-expired-code": [
    "generate-a-new-code-on-the-windows"
  ],
  "remote-connected-session": [
    "read-the-connected-session-details-before-using"
  ],
  "remote-navigation": [
    "choose-the-intended-song-or-section-in"
  ],
  "remote-camera-limit": [
    "choose-the-pin-form",
    "enter-a-fresh-six-digit-code-the"
  ],
  "wooly-open": [
    "choose-the-wooly-launcher-the-help-panel"
  ],
  "wooly-tutorials": [
    "choose-tutorials-in-the-wooly-panel-available"
  ],
  "wooly-next": [
    "choose-next-in-the-wooly-tutorial-the"
  ],
  "wooly-skip": [
    "choose-skip-in-the-tutorial-controls-the"
  ],
  "wooly-chat": [
    "choose-chat",
    "enter-your-question-wooly-returns-a-prepared"
  ],
  "wooly-ambiguous": [
    "choose-the-closest-matching-result-in-woolys"
  ],
  "wooly-show-me": [
    "choose-show-me-on-the-prepared-answer"
  ],
  "wooly-report": [
    "choose-quick-report-in-woolys-help-panel"
  ],
  "wooly-support-question": [
    "choose-my-questions",
    "submit-the-question-form-a-confirmation-says"
  ],
  "wooly-support-reply": [
    "choose-the-support-question-in-my-questions"
  ],
  "wooly-support-retry": [
    "retry-send-after-checking-the-displayed-error"
  ],
  "template-picker-open": [
    "choose-use-template",
    "check-that-choose-a-template-opens-and"
  ],
  "template-picker-select": [
    "choose-use-template",
    "review-the-template-names-and-descriptions-in",
    "select-the-intended-template-card",
    "check-the-new-setlist-form-for-the"
  ],
  "template-picker-close": [
    "choose-use-template",
    "choose-close-template-picker-in-the-dialog",
    "check-that-the-dialog-closes-and-the"
  ],
  "setlist-band-notes": [
    "find-the-intended-song-in-song-order",
    "choose-add-notes-or-edit-notes-for",
    "enter-the-note-in-the-band-notes",
    "choose-save-notes-after-the-dialog-closes"
  ],
  "setlist-song-order": [
    "confirm-the-current-setlist-and-intended-song",
    "drag-its-handle-to-the-intended-numbered",
    "reopen-the-plan-after-the-action-settles"
  ],
  "setlist-template-create": [
    "choose-save-as-template",
    "check-that-the-template-form-opens-and"
  ],
  "setlist-template-save-details": [
    "choose-save-as-template",
    "enter-a-recognizable-template-name",
    "enter-a-description-if-that-optional-field",
    "review-the-details-before-submission"
  ],
  "setlist-template-save-submit": [
    "choose-save-as-template",
    "review-the-template-name-and-optional-details",
    "choose-save-template",
    "read-the-result-message"
  ],
  "practice-arrangement-section": [
    "choose-the-labeled-section-button-beside-the"
  ],
  "practice-arrangement-loop": [
    "choose-the-intended-section-button-beside-the"
  ],
  "practice-edit-arrangement": [
    "choose-edit-arrangement-beside-the-intended-song",
    "check-that-the-arrangement-dialog-opens-for",
    "review-or-change-its-section-order",
    "choose-save-arrangement-and-read-the-save"
  ]
};
