// The integrations page's record lists, one per view (?view=); shared by the server page and the client desk.
export const INTEGRATION_VIEWS = ['digilocker-documents', 'access-devices', 'lti-tools', 'scorm-packages', 'api-tokens'] as const;
export type IntegrationView = (typeof INTEGRATION_VIEWS)[number];
