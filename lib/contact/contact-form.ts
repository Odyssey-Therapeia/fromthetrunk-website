/**
 * Pure, framework-free logic for the Connect With Us contact wizard.
 *
 * Kept separate from the React component so the step validation and the
 * submit-payload shape are unit-testable and so the payload contract with
 * `/api/v2/contact/submit` stays explicit and unchanged.
 */

// Field limits — mirror api/hono/schemas/contact.ts (server remains authoritative).
export const CONTACT_NAME_MIN = 2;
export const CONTACT_NAME_MAX = 80;
export const CONTACT_MESSAGE_MIN = 10;
export const CONTACT_MESSAGE_MAX = 2000;
export const CONTACT_PHONE_MAX = 32;
export const CONTACT_TOPIC_MAX = 80;

export const CONTACT_WIZARD_STEPS = 6;

export type ContactTopicOption = {
  /** Value sent to the backend `topic` field (concise, human-readable). */
  value: string;
  /** Label shown in the UI. */
  label: string;
};

export const CONTACT_TOPIC_OPTIONS: ContactTopicOption[] = [
  { value: "Buying a saree", label: "I want to buy a saree" },
  { value: "Selling / sharing a saree", label: "I want to sell or share a saree" },
  { value: "Order help", label: "I need help with an order" },
  { value: "Styling / fabric guidance", label: "I want styling or fabric guidance" },
  { value: "Partnership / press", label: "Partnership / press" },
  { value: "Something else", label: "Something else" },
];

export type ContactWizardState = {
  topic: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  /** Honeypot — must stay empty for real humans. */
  website: string;
};

export const emptyContactWizardState = (
  defaultTopic = "",
): ContactWizardState => ({
  topic: defaultTopic,
  name: "",
  email: "",
  phone: "",
  message: "",
  website: "",
});

/** Conservative, dependency-free email check for client-side gating only. */
export const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/**
 * Client-side phone formatting: keep only characters the backend regex allows
 * (`^[+\d\s().-]*$`) and cap length. Never blocks an empty value.
 */
export const sanitizePhone = (value: string): string =>
  value.replace(/[^+\d\s().-]/g, "").slice(0, CONTACT_PHONE_MAX);

const nameValid = (s: ContactWizardState) => {
  const n = s.name.trim();
  return n.length >= CONTACT_NAME_MIN && n.length <= CONTACT_NAME_MAX;
};

const messageValid = (s: ContactWizardState) => {
  const m = s.message.trim();
  return m.length >= CONTACT_MESSAGE_MIN && m.length <= CONTACT_MESSAGE_MAX;
};

/** Phone is optional; if present it must fit the length + allowed charset. */
const phoneValid = (s: ContactWizardState) => {
  const p = s.phone.trim();
  return p.length === 0 || (p.length <= CONTACT_PHONE_MAX && /^[+\d\s().-]*$/.test(p));
};

const allRequiredValid = (s: ContactWizardState) =>
  Boolean(s.topic) && nameValid(s) && isValidEmail(s.email) && messageValid(s) && phoneValid(s);

/**
 * Is the given step (0-based) complete enough to advance / submit?
 *   0 topic, 1 name, 2 email, 3 phone (optional), 4 message, 5 review.
 */
export const isContactStepValid = (
  step: number,
  state: ContactWizardState,
): boolean => {
  switch (step) {
    case 0:
      return Boolean(state.topic);
    case 1:
      return nameValid(state);
    case 2:
      return isValidEmail(state.email);
    case 3:
      return phoneValid(state); // optional → true when empty
    case 4:
      return messageValid(state);
    case 5:
      return allRequiredValid(state);
    default:
      return false;
  }
};

export type ContactSubmitPayload = {
  name: string;
  email: string;
  message: string;
  phone?: string;
  topic?: string;
  pagePath: string;
  website: string;
  startedAt?: number;
  clientSubmissionId?: string;
};

/**
 * Build the exact payload the existing backend already accepts. Trims text,
 * omits optional empties, and always includes the honeypot + startedAt + pagePath.
 */
export const buildContactSubmitPayload = (
  state: ContactWizardState,
  ctx: { pagePath: string; startedAt?: number; clientSubmissionId?: string },
): ContactSubmitPayload => {
  const phone = state.phone.trim();
  const topic = state.topic.trim();
  return {
    name: state.name.trim(),
    email: state.email.trim(),
    message: state.message.trim(),
    ...(phone ? { phone } : {}),
    ...(topic ? { topic } : {}),
    pagePath: ctx.pagePath,
    website: state.website, // honeypot — sent as-is (empty for humans)
    ...(ctx.startedAt ? { startedAt: ctx.startedAt } : {}),
    ...(ctx.clientSubmissionId ? { clientSubmissionId: ctx.clientSubmissionId } : {}),
  };
};
