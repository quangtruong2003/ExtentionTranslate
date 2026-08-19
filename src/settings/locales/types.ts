export interface SettingsCopy {
  // Navigation (titles + descriptions for the five sections)
  navOverviewTitle: string;
  navOverviewDescription: string;
  navPopupTitle: string;
  navPopupDescription: string;
  navOpenRouterTitle: string;
  navOpenRouterDescription: string;
  navVocabularyTitle: string;
  navVocabularyDescription: string;
  navAboutTitle: string;
  navAboutDescription: string;

  // Sidebar
  sidebarNavLabel: string;
  sidebarSubtitle: string;
  sidebarVersionPrefix: string; // rendered as `${prefix} ${version}`

  // App shell / save bar
  breadcrumbRoot: string;
  loading: string;
  saveBarDirty: string;
  saveBarSaving: string;
  saveBarError: string;
  discard: string;
  save: string;
  saving: string;
  savedToast: string;
  saveFailedToast: string;
  contactError: string;
  unacknowledgedError: string;
  sendError: string;

  // Overview
  overviewHeading: string;
  overviewIntro: string;
  statTriggerMode: string;
  statDisplayLanguage: string;
  statAutoAsk: string;
  statAutoAskOnValue: string;
  statAutoAskOffValue: string;
  statAutoAskOnBadge: string;
  statAutoAskOffBadge: string;
  statOpenRouterKey: string;
  statOpenRouterKeyConfigured: string;
  statOpenRouterKeyMissing: string;
  statOpenRouterKeyReadyBadge: string;
  statOpenRouterKeySetupBadge: string;
  quickLinksTitle: string;
  quickLinksDescription: string;

  // Popup & Dictionary section
  popupHeading: string;
  selectionCardTitle: string;
  selectionCardDescription: string;
  triggerIconLabel: string;
  triggerIconDescription: string;
  triggerPopupLabel: string;
  triggerPopupDescription: string;
  triggerOffLabel: string;
  triggerOffDescription: string;
  themeCardTitle: string;
  themeCardDescription: string;
  themeAutoLabel: string;
  themeAutoDescription: string;
  themeLightLabel: string;
  themeLightDescription: string;
  themeDarkLabel: string;
  themeDarkDescription: string;
  languageTitle: string;
  languageDescription: string;
  languagePlaceholder: string;
  aiCardTitle: string;
  aiCardDescription: string;
  autoAskTitle: string;
  autoAskDescription: string;
  contextTitle: string;
  contextDescription: string;
  previewTitle: string;
  previewDescription: string;

  // OpenRouter section
  openrouterHeading: string;
  connectionCardTitle: string;
  connectionCardDescriptionLead: string; // followed by the openrouter.ai/keys link
  openRouterKeyLabel: string;
  openRouterKeyPlaceholder: string;
  showKeyAria: string;
  hideKeyAria: string;
  clearKey: string;
  checkKey: string;
  checkingKey: string;
  keyCheckOk: string; // contains {count}
  keyCheckFailed: string;
  keyCheckError: string;
  openRouterKeyNote: string;
  modelLabel: string;
  modelHint: string;
  behaviorCardTitle: string;
  behaviorCardDescription: string;
  thinkingTitle: string;
  thinkingDescription: string;
  reasoningEffortTitle: string;
  reasoningEffortDescription: string;
  reasoningBudgetLabel: string;
  reasoningBudgetPlaceholder: string;
  reasoningBudgetHint: string;
  maxTokensLabel: string;
  maxTokensHint: string;
  systemPromptLabel: string;
  resetSystemPrompt: string;
  systemPromptHint: string;

  // Vocabulary section
  vocabularySearchPlaceholder: string;
  vocabularyFavoritesFilter: string;
  vocabularyCountSuffix: string;
  vocabularyExportCsv: string;
  vocabularyExportAnki: string;
  vocabularyClearAll: string;
  vocabularyClearedToast: string;
  vocabularyEmptyAll: string;
  vocabularyEmptyFiltered: string;
  vocabularyFavoriteAddAria: string;
  vocabularyFavoriteRemoveAria: string;
  vocabularyRemoveAriaPrefix: string;

  // About section
  aboutTitle: string;
  aboutVersionPrefix: string; // rendered as `${prefix} ${version}.`
  aboutSourcesLead: string; // followed by the two source links
  aboutSourcesConjunction: string; // joins the two source links
  aboutSourcesTail: string; // preceded by the links, e.g. "(CC BY-SA 4.0) ..."
  aboutPrivacy: string;
  aboutBrowserSupport: string;
  aboutDocsLink: string;

  // TOEIC Quiz section
  navToeicTitle: string;
  navToeicDescription: string;
  toeicHeading: string;
  toeicEnableTitle: string;
  toeicEnableDescription: string;
  toeicIntervalTitle: string;
  toeicIntervalDescription: string;
  toeicIntervalSuffix: string;
  toeicCountTitle: string;
  toeicCountDescription: string;
  toeicCountSuffix: string;
  toeicTimeNote: string;
}
