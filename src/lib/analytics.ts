import PostHog from 'posthog-react-native';

let client: PostHog | null = null;

export function getPostHog(): PostHog | null {
  return client;
}

export function initPostHog(instance: PostHog) {
  client = instance;
}

// Screen tracking
export function trackScreen(name: string, properties?: Record<string, any>) {
  client?.screen(name, properties);
}

// Key events
export function trackEvent(event: string, properties?: Record<string, any>) {
  client?.capture(event, properties);
}

// Identify user after sign-in
export function identifyUser(userId: string, traits?: Record<string, any>) {
  client?.identify(userId, traits);
}

// Clear on sign-out
export function resetAnalytics() {
  client?.reset();
}
