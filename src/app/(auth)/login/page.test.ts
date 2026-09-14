import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("login form", () => {
  it("submits named email and password fields from the form DOM", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("new FormData(e.currentTarget)");
    expect(source).toContain('name="email"');
    expect(source).toContain('name="password"');
    expect(source).toContain("submittedEmail");
    expect(source).toContain("submittedPassword");
    expect(source).toContain('id="login-form"');
    expect(source).toContain('method="post"');
    expect(source).toContain('action="/api/auth/login"');
    expect(source).toContain("data-ready");
    expect(source).toContain('defaultValue=""');
    expect(source).toContain('disabled={!hydrated || loading}');
    expect(source).toContain('name="next"');
    expect(source).not.toContain("value={email}");
    expect(source).not.toContain("value={password}");
    expect(source).toContain("Ange både e-post och lösenord.");
    expect(source).toContain("Ange en giltig e-postadress.");
    expect(source).toContain("isValidEmail");
    expect(source).toContain('get("reset") === "1"');
    expect(source).toContain("Lösenordet är återställt. Logga in med det nya lösenordet.");
<<<<<<< HEAD
    expect(source).toContain('get("verified") === "1"');
    expect(source).toContain("E-postadressen är verifierad. Du kan nu logga in.");
=======
    expect(source).toContain('id="resend-verification-form"');
    expect(source).toContain('action="/api/auth/email-verification/resend"');
    expect(source).toContain('get("resent") === "1"');
    expect(source).toContain("Om kontot behöver verifieras skickar vi en ny verifieringslänk.");
>>>>>>> 165c91c (feat(auth): accept native form posts on verification resend)
    expect(source).not.toContain("••••");
  });
});
