import { saveSession, type GoogleSession } from "../repositories/googleSessionRepository";
import { createSession } from "./appSessionApi";

/**
 * Google Identity Services, loaded on demand.
 *
 * The ID token flow, not the redirect flow: Google hands the signed token
 * straight to the page, the Netlify functions verify it, and there is no
 * callback URL to register or code to exchange. That is also why the OAuth
 * client needs authorised JavaScript origins but no redirect URIs.
 *
 * The token Google hands over is not the session. It is posted to /session,
 * which verifies it and sets the cookie the app actually runs on, and is then
 * dropped. Google is involved at this one moment and not again for months.
 */

const GSI_SRC = "https://accounts.google.com/gsi/client";

type CredentialResponse = { credential?: string };

type GoogleIdApi = {
  initialize(config: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    use_fedcm_for_prompt?: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
  prompt(): void;
  disableAutoSelect(): void;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } };
  }
}

export function googleClientId(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
}

let scriptPromise: Promise<GoogleIdApi> | null = null;

function loadGsi(): Promise<GoogleIdApi> {
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<GoogleIdApi>((resolve, reject) => {
    const existing = window.google?.accounts?.id;
    if (existing) return resolve(existing);

    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => {
      const api = window.google?.accounts?.id;
      if (api) resolve(api);
      else reject(new Error("Google Identity Services loaded but exposed no API"));
    };
    script.onerror = () => reject(new Error("Could not load Google Identity Services"));
    document.head.appendChild(script);
  }).catch((e) => {
    // Let a later attempt retry instead of caching the failure forever.
    scriptPromise = null;
    throw e;
  });

  return scriptPromise;
}

/**
 * Renders Google's sign-in button and resolves the session once the athlete
 * has signed in.
 *
 * `auto_select` stays on, but it is no longer load-bearing: it used to be what
 * made an hourly re-login survivable, and now it only smooths over the sign-in
 * that happens when a session has genuinely run out.
 */
export async function mountGoogleSignIn(
  target: HTMLElement,
  onSession: (session: GoogleSession) => void,
  onError: (message: string) => void
): Promise<void> {
  const clientId = googleClientId();
  if (!clientId) {
    onError("VITE_GOOGLE_CLIENT_ID is not set");
    return;
  }

  let api: GoogleIdApi;
  try {
    api = await loadGsi();
  } catch (e) {
    onError(e instanceof Error ? e.message : String(e));
    return;
  }

  api.initialize({
    client_id: clientId,
    auto_select: true,
    cancel_on_tap_outside: false,
    use_fedcm_for_prompt: true,
    callback: (response) => {
      const credential = response.credential;
      if (!credential) {
        onError("Google returned no credential");
        return;
      }

      void createSession(credential)
        .then(async (session) => {
          await saveSession(session);
          onSession(session);
        })
        .catch((e: unknown) => {
          onError(e instanceof Error ? e.message : String(e));
        });
    },
  });

  api.renderButton(target, {
    type: "standard",
    theme: "outline",
    size: "large",
    text: "signin_with",
    shape: "pill",
    width: 280,
  });

  // One Tap on top of the button: with auto_select this signs a returning
  // athlete straight back in when the previous token has expired.
  api.prompt();
}

/** Stops Google from silently signing the athlete back in after a sign-out. */
export async function disableAutoSelect(): Promise<void> {
  try {
    const api = await loadGsi();
    api.disableAutoSelect();
  } catch {
    /* signing out locally is what matters; this is only a courtesy to Google */
  }
}
