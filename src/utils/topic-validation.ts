export const TOPIC_MIN_LENGTH = 2;
export const TOPIC_MAX_LENGTH = 35;
const TOPIC_REGEX = /^[a-z0-9]+$/;

export type TopicValidationResult = {
  isValid: boolean;
  error: string | null;
};

export function validateTopic(topic: string): TopicValidationResult {
  const trimmed = topic.trim();

  if (trimmed.length === 0) {
    return { isValid: false, error: null };
  }

  if (trimmed.length < TOPIC_MIN_LENGTH) {
    return {
      isValid: false,
      error: `Topic must be at least ${TOPIC_MIN_LENGTH} characters`,
    };
  }

  if (trimmed.length > TOPIC_MAX_LENGTH) {
    return {
      isValid: false,
      error: `Topic must be at most ${TOPIC_MAX_LENGTH} characters`,
    };
  }

  if (trimmed !== trimmed.toLowerCase()) {
    return {
      isValid: false,
      error: "Topic must be lowercase",
    };
  }

  if (!TOPIC_REGEX.test(trimmed)) {
    return {
      isValid: false,
      error: "Topic can only contain lowercase letters and numbers",
    };
  }

  return { isValid: true, error: null };
}

export function sanitizeTopicName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, TOPIC_MAX_LENGTH);
}
