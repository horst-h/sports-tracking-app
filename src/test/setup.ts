const EXPECTED_TZ = "Europe/Berlin";

const actual = Intl.DateTimeFormat().resolvedOptions().timeZone;

if (actual !== EXPECTED_TZ) {
  throw new Error(
    `Tests must run in ${EXPECTED_TZ}, but the resolved timezone is "${actual}".\n` +
      `The metrics pipeline uses local-time Date construction, so golden master\n` +
      `values shift with the timezone. Run tests via "npm test" (which sets TZ).`
  );
}
