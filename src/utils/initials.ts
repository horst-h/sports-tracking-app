/**
 * The initials shown in place of a profile picture.
 *
 * The header used to hard-code "HH", which was right for exactly one account
 * and silently wrong for any other. It matters more than a placeholder usually
 * would: the picture is a remote URL on an app built to work offline, so the
 * initials are what most people see most of the time.
 *
 * The name is asked first and the email only after it, because an address is a
 * routing detail that often has nothing to do with what someone is called.
 */

/** Splitting on code points, so a name starting outside the BMP keeps its first
 *  character rather than half of a surrogate pair. */
function firstCharacter(word: string): string {
  return [...word][0] ?? "";
}

function fromParts(parts: string[]): string | null {
  if (parts.length === 0) return null;
  if (parts.length === 1) return firstCharacter(parts[0]);
  return firstCharacter(parts[0]) + firstCharacter(parts[parts.length - 1]);
}

/**
 * Two letters where there are two names, one where there is one, and the
 * fallback when there is nothing to go on at all.
 *
 * Middle names are skipped rather than crammed in: first and last is what an
 * avatar has room for.
 */
export function initialsFrom(name?: string, email?: string, fallback = "?"): string {
  const nameParts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const fromName = fromParts(nameParts);
  if (fromName) return fromName.toUpperCase();

  // "horst.haag@…" carries the same two initials as often as not, and beats a
  // question mark when the profile came back without a name.
  const local = (email ?? "").trim().split("@")[0] ?? "";
  const fromEmail = fromParts(local.split(/[._\-+]/).filter(Boolean));
  if (fromEmail) return fromEmail.toUpperCase();

  return fallback;
}
