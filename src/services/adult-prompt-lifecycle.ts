import { claimAdultPrompt, releaseAdultPrompt } from "./home-entry-prompt-orchestrator";

type Phase = "idle" | "scheduled" | "presenting" | "open" | "closing" | "disposed";
export type AdultPromptPresentation = {
  id: number;
  session: string;
  isCurrent: () => boolean;
  onChange: (index: number) => void;
  onDismiss: () => void;
  onError: (error: unknown) => void;
  complete: (action: () => void) => void;
};
let nextPresentationId = 0;
type Driver = {
  schedule: (callback: () => void) => number;
  cancel: (frame: number) => void;
  present: (presentation: AdultPromptPresentation) => void;
  dismiss: () => void;
  onError: (error: unknown) => void;
};

export class AdultPromptLifecycle {
  private phase: Phase = "idle";
  private wanted = false;
  private session = "";
  private presentedSession = "";
  private settled = false;
  private frame = 0;
  private owner = Symbol("adult-prompt");
  private presentationId = 0;

  constructor(private driver: Driver) {}

  update(visible: boolean, session: string) {
    if (this.phase === "disposed") return;
    const changed = this.session !== session;
    const becameVisible = visible && (!this.wanted || changed);
    this.wanted = visible;
    this.session = session;
    if (changed || !visible) this.close();
    if (becameVisible && this.phase === "idle") this.start();
  }

  private start() {
    if (!claimAdultPrompt(this.owner)) return;
    this.phase = "scheduled";
    this.settled = false;
    this.presentedSession = this.session;
    const id = ++nextPresentationId;
    this.presentationId = id;
    const isCurrent = () => this.presentationId === id && this.phase !== "disposed";
    this.frame = this.driver.schedule(() => {
      if (this.phase !== "scheduled") return;
      this.phase = "presenting";
      try {
        this.driver.present({
          id,
          session: this.presentedSession,
          isCurrent,
          onChange: (index) => { if (isCurrent() && index >= 0) this.opened(); },
          onDismiss: () => { if (isCurrent()) this.dismissed(); },
          onError: (error) => { if (isCurrent()) this.fail(error); },
          complete: (action) => { if (isCurrent()) this.complete(action); },
        });
      } catch (error) {
        this.fail(error);
      }
    });
  }

  private close() {
    if (this.phase === "scheduled") {
      this.driver.cancel(this.frame);
      this.phase = "idle";
      releaseAdultPrompt(this.owner);
    } else if (this.phase === "open") {
      this.phase = "closing";
      try {
        this.driver.dismiss();
      } catch (error) {
        this.fail(error);
      }
    }
    // Gorhom present() schedules its own frame. Wait for onChange before
    // dismissing so that a queued present cannot resurrect a dismissed portal.
  }

  opened() {
    if (this.phase !== "presenting") return;
    this.phase = "open";
    if (!this.wanted || this.presentedSession !== this.session || this.settled) this.close();
  }

  dismissed() {
    if (this.phase === "idle" || this.phase === "disposed" || this.phase === "scheduled") return;
    const reopen = this.wanted && this.phase === "closing" && !this.settled;
    this.phase = "idle";
    releaseAdultPrompt(this.owner);
    if (reopen) this.start();
  }

  complete(action: () => void) {
    if (this.phase !== "open" || !this.wanted || this.settled || this.session !== this.presentedSession) return;
    this.settled = true;
    try {
      action();
    } catch (error) {
      this.driver.onError(error);
    } finally {
      this.close();
    }
  }

  dispose() {
    if (this.phase === "scheduled") this.driver.cancel(this.frame);
    const needsDismiss = this.phase === "open" || this.phase === "presenting";
    this.phase = "disposed";
    if (needsDismiss) {
      try { this.driver.dismiss(); } catch (error) { this.driver.onError(error); }
    }
    releaseAdultPrompt(this.owner);
  }

  private fail(error: unknown) {
    this.phase = "idle";
    releaseAdultPrompt(this.owner);
    this.driver.onError(error);
  }
}
