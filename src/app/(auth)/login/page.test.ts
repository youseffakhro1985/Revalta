import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("login form", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("./login-form.tsx", import.meta.url), "utf8");

  it("renders next, notices and errors from the server search params", () => {
    expect(page).not.toContain("\"use client\"");
    expect(page).toContain("searchParams");
    expect(page).toContain("await searchParams");
    expect(page).toContain("safeInternalPath(params.next, \"\")");
    expect(page).toContain("params.registered === \"1\"");
    expect(page).toContain("params.reset === \"1\"");
    expect(page).toContain("params.verified === \"1\"");
    expect(page).toContain("params.resent === \"1\"");
    expect(page).toContain("params.reason");
    expect(page).not.toContain("useSearchParams");
    expect(page).not.toContain("Suspense");
  });

  it("submits named email and password fields from the form DOM", () => {
    expect(form).toContain("new FormData(e.currentTarget)");
    expect(form).toContain('name="email"');
    expect(form).toContain('name="password"');
    expect(form).toContain("submittedEmail");
    expect(form).toContain("submittedPassword");
    expect(form).toContain('id="login-form"');
    expect(form).toContain('method="post"');
    expect(form).toContain('action="/api/auth/login"');
    expect(form).toContain("data-ready");
    expect(form).toContain('defaultValue=""');
    expect(form).toContain("disabled={loading}");
    expect(form).not.toContain("disabled={!hydrated || loading}");
    expect(form).toContain('name="next"');
    expect(form).toContain("value={props.nextPath}");
    expect(form).toContain("safeInternalPath(props.nextPath, fallback)");
    expect(form).not.toContain("URLSearchParams(window.location.search)");
    expect(form).not.toContain("value={email}");
    expect(form).not.toContain("value={password}");
    expect(form).toContain("Ange både e-post och lösenord.");
    expect(form).toContain("Ange en giltig e-postadress.");
    expect(form).toContain("isValidEmail");
    expect(form).toContain("Lösenordet är återställt. Logga in med det nya lösenordet.");
    expect(form).toContain("E-postadressen är verifierad. Du kan nu logga in.");
    expect(form).toContain('id="resend-verification-form"');
    expect(form).toContain('action="/api/auth/email-verification/resend"');
    expect(form).toContain("Om kontot behöver verifieras skickar vi en ny verifieringslänk.");
    expect(form).not.toContain("••••");
    expect(form).not.toContain("useSearchParams");
  });
});

describe("login form first HTML focus", () => {
  it("keeps the login form in the first HTML and focuses the email after load", () => {
    const form = readFileSync(new URL("./login-form.tsx", import.meta.url), "utf8");
    expect(form).toContain('id="login-form"');
    expect(form).toContain('id="login-email"');
    expect(form).toContain("scroll-mt-36");
    expect(form).toContain('window.location.hash !== "#login-form"');
    expect(form).toContain("scrollIntoView");
    expect(form).toContain('document.getElementById("login-email")?.focus()');
    expect(form).toContain("autoFocus");
    expect(form).toContain("disabled={loading}");
    expect((form.match(/autoFocus/g) || []).length).toBe(1);
    expect(form).toContain('id="resend-verification-form"');
  });

  it("does not add a dashboard sticky for public login", () => {
    const sticky = readFileSync(new URL("../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(sticky).not.toContain("#login-form");
    expect(sticky).not.toContain("#login-email");
    expect(sticky).not.toContain("/dashboard/boendeportal");
  });
});
