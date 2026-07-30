export type RefreshTargetKey = "home" | "following" | "profile";

export type RefreshTargetCallback = () => void | Promise<void>;

type RefreshTargetRegistration = {
  callback: RefreshTargetCallback;
};

export class RefreshTargetRegistry<Key extends string = RefreshTargetKey> {
  private readonly registrations = new Map<Key, RefreshTargetRegistration>();

  register(key: Key, callback: RefreshTargetCallback): () => void {
    const registration = { callback };
    this.registrations.set(key, registration);

    return () => {
      if (this.registrations.get(key) === registration) {
        this.registrations.delete(key);
      }
    };
  }

  async invoke(key: Key): Promise<void> {
    const registration = this.registrations.get(key);
    if (!registration) return;
    await registration.callback();
  }
}
