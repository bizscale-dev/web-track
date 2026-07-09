"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type {
  WebsiteActivityLog,
  WebsiteCredential,
} from "@/type/website";

type WebsiteCredentialsManagerProps = {
  websiteId: number;
  initialCredentials: WebsiteCredential[];
  credentialsLoadError?: string | null;
  onActivityLogged: (log: WebsiteActivityLog) => void;
};

type CredentialForm = {
  login_url: string;
  username: string;
  password: string;
};

const EMPTY_FORM: CredentialForm = {
  login_url: "",
  username: "",
  password: "",
};

export default function WebsiteCredentialsManager({
  websiteId,
  initialCredentials,
  credentialsLoadError,
  onActivityLogged,
}: WebsiteCredentialsManagerProps) {
  const [credentials, setCredentials] = useState(initialCredentials);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isAdding, setIsAdding] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    credentialsLoadError || null
  );

  function updateForm(field: keyof CredentialForm, value: string) {
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  }

  async function logActivity(message: string) {
    const { data, error: logError } = await supabase
      .from("website_activity_logs")
      .insert({
        website_id: websiteId,
        event_type: "credential_added",
        message,
      })
      .select("*")
      .single<WebsiteActivityLog>();

    if (!logError && data) {
      onActivityLogged(data);
    }
  }

  async function addCredential(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.login_url.trim() && !form.username.trim() && !form.password.trim()) {
      setError("Add at least one credential value.");
      return;
    }

    setError(null);
    setIsAdding(true);

    const { data, error: insertError } = await supabase
      .from("website_credentials")
      .insert({
        website_id: websiteId,
        login_url: form.login_url.trim() || null,
        username: form.username.trim() || null,
        password: form.password.trim() || null,
      })
      .select("*")
      .single<WebsiteCredential>();

    setIsAdding(false);

    if (insertError || !data) {
      setError(insertError?.message ?? "Credential could not be added.");
      return;
    }

    setCredentials((currentCredentials) => [data, ...currentCredentials]);
    setForm(EMPTY_FORM);
    await logActivity("Website credential added");
  }

  async function copyValue(key: string, value: string | null) {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      setError("Copy failed. Your browser may be blocking clipboard access.");
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-xl font-bold">Website Credentials</h2>
        <p className="mt-1 text-sm text-gray-500">
          Store login URL, username, and password for this website.
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {error}
        </div>
      ) : null}

      <form
        onSubmit={addCredential}
        className="mb-5 grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 lg:grid-cols-[1.4fr_1fr_1fr_auto]"
      >
        <input
          className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm shadow-sm outline-none focus:border-gray-500"
          placeholder="Login URL"
          value={form.login_url}
          onChange={(event) => updateForm("login_url", event.target.value)}
        />
        <input
          className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm shadow-sm outline-none focus:border-gray-500"
          placeholder="Username"
          value={form.username}
          onChange={(event) => updateForm("username", event.target.value)}
        />
        <input
          className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm shadow-sm outline-none focus:border-gray-500"
          placeholder="Password"
          value={form.password}
          onChange={(event) => updateForm("password", event.target.value)}
        />
        <button
          type="submit"
          className="h-10 rounded-md bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400"
          disabled={isAdding}
        >
          {isAdding ? "Adding..." : "Add"}
        </button>
      </form>

      {credentials.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
          No credentials saved yet.
        </div>
      ) : (
        <div className="space-y-3">
          {credentials.map((credential) => (
            <div
              key={credential.id}
              className="grid gap-3 rounded-lg border border-gray-200 p-4 xl:grid-cols-[1.4fr_1fr_1fr]"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Login URL
                </p>
                {credential.login_url ? (
                  <a
                    href={credential.login_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex max-w-full truncate text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    {credential.login_url}
                  </a>
                ) : (
                  <p className="mt-2 text-sm text-gray-400">Empty</p>
                )}
              </div>

              <CopyField
                label="Username"
                value={credential.username}
                copied={copiedKey === `${credential.id}:username`}
                onCopy={() =>
                  copyValue(`${credential.id}:username`, credential.username)
                }
              />
              <CopyField
                label="Password"
                value={credential.password}
                copied={copiedKey === `${credential.id}:password`}
                onCopy={() =>
                  copyValue(`${credential.id}:password`, credential.password)
                }
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CopyField({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string | null;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 text-sm">
          {value || "Empty"}
        </code>
        <button
          type="button"
          className="h-8 rounded-md border border-gray-300 bg-white px-3 text-xs font-semibold hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
          disabled={!value}
          onClick={onCopy}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
