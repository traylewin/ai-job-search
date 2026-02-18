"use client";

import { useState } from "react";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import { db } from "@/lib/db/instant";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_NAME = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_NAME || "google-web";

export default function LandingPage() {
  const [error, setError] = useState<string | null>(null);
  const [nonce] = useState(() => crypto.randomUUID());

  return (
    <div className="bg-gradient-to-b from-blue-50 to-white flex flex-col" style={{ minHeight: "var(--app-height, 100vh)" }}>
      {/* Header */}
      <header className="px-4 sm:px-8 py-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-teal-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <svg
              className="w-4.5 h-4.5 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <span className="font-semibold text-gray-800 text-lg">
            Job Hunt Agent
          </span>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-start justify-center px-6 pt-12 sm:pt-20">
        <div className="max-w-md w-full text-center">
          {/* Hero icon */}
          <div className="mx-auto mb-8 w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-teal-400 flex items-center justify-center shadow-xl shadow-blue-500/25">
            <svg
              className="w-10 h-10 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>

          {/* Headline */}
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
            Your AI Job Search Assistant
          </h1>
          <p className="text-gray-500 mt-5 mb-10 leading-relaxed">
            Manage applications, track opportunities, handle follow-ups.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
            {[
              "Smart Job Matching",
              "Email Analysis",
              "Application Tracker",
              "Resume Insights",
            ].map((feature) => (
              <span
                key={feature}
                className="text-xs font-medium text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full"
              >
                {feature}
              </span>
            ))}
          </div>

          {/* Google Login */}
          <div className="flex flex-col items-center gap-4">
            <div>
              <p className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-4">Get started</p>
              <div className="flex justify-center [&>div]:rounded-full [&>div]:ring-2 [&>div]:ring-blue-400 [&>div]:ring-offset-2">
            <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
              <GoogleLogin
                nonce={nonce}
                size="large"
                width="240"
                text="signin_with"
                shape="pill"
                onError={() => setError("Google sign-in failed. Please try again.")}
                onSuccess={({ credential }) => {
                  if (!credential) {
                    setError("No credential received from Google.");
                    return;
                  }
                  setError(null);
                  // Extract Google profile picture from JWT payload
                  try {
                    const payload = JSON.parse(atob(credential.split(".")[1]));
                    if (payload.picture) {
                      localStorage.setItem("avatar_url", payload.picture);
                    }
                    if (payload.name) {
                      localStorage.setItem("user_name", payload.name);
                    }
                  } catch {
                    // ignore decode errors
                  }
                  db.auth
                    .signInWithIdToken({
                      clientName: GOOGLE_CLIENT_NAME,
                      idToken: credential,
                      nonce,
                    })
                    .catch((err: { body?: { message?: string } }) => {
                      setError(
                        err.body?.message || "Failed to sign in. Please try again."
                      );
                    });
                }}
              />
            </GoogleOAuthProvider>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 px-4 py-2 rounded-lg">
                {error}
              </p>
            )}
          </div>

          {/* Footer note */}
        </div>
      </main>
    </div>
  );
}
